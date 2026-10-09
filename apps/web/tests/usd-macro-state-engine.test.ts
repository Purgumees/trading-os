import { describe, expect, it } from "vitest";
import {
  calculateUsdMacroState,
  type UsdMacroBias,
} from "../src/lib/usd-macro-state-engine";

type Input = Parameters<typeof calculateUsdMacroState>[0];
type FedState = Input["fedConfirmation"]["horizons"]["oneWeek"]["fedState"];
type ConfirmationState = Input["fedConfirmation"]["horizons"]["oneWeek"]["state"];
type FedYieldDirection = Input["fedConfirmation"]["horizons"]["oneWeek"]["twoYearDirection"];
type Regime = Input["ratesRegime"]["horizons"]["oneWeek"]["regime"];

function input(overrides: {
  fed?: FedState;
  fed1d?: FedState;
  fed1m?: FedState;
  confirmation?: ConfirmationState;
  growthMomentum?: Input["growth"]["momentum"];
  growthState?: Input["growth"]["state"];
  labourMomentum?: Input["labour"]["momentum"];
  inflationMomentum?: Input["inflation"]["momentum"]["core"];
  forwardPricePressure?: Input["inflation"]["forwardPricePressure"]["state"];
  ratesDirection?: -1 | 0 | 1 | null;
  ratesDirection1m?: -1 | 0 | 1 | null;
  longEndDirection?: -1 | 0 | 1 | null;
  regime?: Regime;
} = {}): Input {
  const oneWeekMove = overrides.ratesDirection === undefined ? 1 : overrides.ratesDirection;
  const oneMonthMove =
    overrides.ratesDirection1m === undefined ? oneWeekMove : overrides.ratesDirection1m;
  const longEndMove =
    overrides.longEndDirection === undefined ? oneWeekMove : overrides.longEndDirection;
  const fedHorizon = (state: FedState, horizonState: ConfirmationState) => ({
    fedState: state,
    state: horizonState,
    twoYearDirection: (
      oneWeekMove === null
        ? "UNAVAILABLE"
        : oneWeekMove > 0
          ? "RISE"
          : oneWeekMove < 0
            ? "DECLINE"
            : "STABLE"
    ) as FedYieldDirection,
  });
  const move = (
    direction: -1 | 0 | 1 | null
  ): Input["rates"]["maturities"]["2Y"]["changes"]["oneWeek"] => ({
    changeBasisPoints: direction === null ? null : direction * 8,
    direction: direction === null ? "UNAVAILABLE" : direction > 0 ? "RISE" : direction < 0 ? "DECLINE" : "STABLE",
  });
  const oneWeekRegime = overrides.regime ?? "BEAR FLATTENING";
  return {
    growth: {
      state: overrides.growthState ?? "EXPANSION",
      momentum: overrides.growthMomentum ?? "STABLE",
      forwardGrowth: "POSITIVE",
    },
    labour: {
      state: "RESILIENT",
      momentum: overrides.labourMomentum ?? "STABLE",
      wagePressure: "STABLE",
    },
    inflation: {
      current: {
        overall: "ABOVE TARGET",
        core: "ABOVE TARGET",
        headline: "ABOVE TARGET",
        explanation: "test",
      },
      momentum: {
        core: overrides.inflationMomentum ?? "STABLE",
        headline: overrides.inflationMomentum ?? "STABLE",
        shortTerm: {
          core: overrides.inflationMomentum ?? "STABLE",
          headline: overrides.inflationMomentum ?? "STABLE",
        },
        mediumTerm: {
          core: overrides.inflationMomentum ?? "STABLE",
          headline: overrides.inflationMomentum ?? "STABLE",
        },
      },
      forwardPricePressure: { state: overrides.forwardPricePressure ?? "STABLE" },
    } satisfies Input["inflation"],
    fedConfirmation: {
      overall: "CONFIRMED",
      horizons: {
        oneDay: fedHorizon(
          overrides.fed1d ?? "LITTLE / NO REPRICING",
          "MIXED / WEAK"
        ),
        oneWeek: fedHorizon(
          overrides.fed ?? "HAWKISH",
          overrides.confirmation ?? "CONFIRMATION"
        ),
        oneMonth: fedHorizon(
          overrides.fed1m ?? overrides.fed ?? "HAWKISH",
          overrides.confirmation ?? "CONFIRMATION"
        ),
      },
    },
    ratesRegime: {
      primaryRegime: oneWeekRegime,
      horizons: {
        oneDay: { regime: "MIXED / UNCLEAR" },
        oneWeek: { regime: oneWeekRegime },
        oneMonth: { regime: oneWeekRegime },
      },
    },
    rates: {
      maturities: {
        "2Y": { changes: { oneWeek: move(oneWeekMove), oneMonth: move(oneMonthMove) } },
        "10Y": { changes: { oneWeek: move(longEndMove), oneMonth: move(longEndMove) } },
        "30Y": { changes: { oneWeek: move(longEndMove), oneMonth: move(longEndMove) } },
      },
    },
  };
}

function calculate(overrides: Parameters<typeof input>[0] = {}) {
  return calculateUsdMacroState(input(overrides));
}

describe("USD macro state engine", () => {
  it("lets hawkish repricing with 2Y confirmation lead the bias", () => {
    expect(calculate({ fed: "STRONGLY HAWKISH", confirmation: "STRONG CONFIRMATION" }).bias)
      .toMatch(/BULLISH/);
  });

  it("lets dovish repricing with 2Y confirmation lead the bias", () => {
    expect(calculate({ fed: "STRONGLY DOVISH", confirmation: "STRONG CONFIRMATION", ratesDirection: -1 }).bias)
      .toMatch(/BEARISH/);
  });

  it("caps strongly dovish repricing with front-end confirmation when monthly rates conflict and long-end regime is mixed", () => {
    const conflicted = calculate({
      fed: "STRONGLY DOVISH",
      fed1m: "HAWKISH",
      confirmation: "STRONG CONFIRMATION",
      ratesDirection: -1,
      ratesDirection1m: 1,
      longEndDirection: 0,
      regime: "MIXED / UNCLEAR",
      labourMomentum: "COOLING",
      inflationMomentum: "COOLING",
      forwardPricePressure: "SURGING",
    });
    const aligned = calculate({
      fed: "STRONGLY DOVISH",
      fed1m: "STRONGLY DOVISH",
      confirmation: "STRONG CONFIRMATION",
      ratesDirection: -1,
      ratesDirection1m: -1,
      longEndDirection: -1,
      regime: "BULL STEEPENING",
      growthMomentum: "SLOWING",
      labourMomentum: "COOLING",
      inflationMomentum: "COOLING",
      forwardPricePressure: "EASING",
    });

    expect(conflicted.bias).toBe("BEARISH");
    expect(conflicted.confidence).toBeLessThan(aligned.confidence);
    expect(conflicted.contradictingEvidence.some((item) => item.includes("mixed/unclear"))).toBe(true);
    expect(conflicted.contradictingEvidence.some((item) => item.includes("Forward price pressure"))).toBe(true);
  });

  it("applies the same extreme-bias cap to the hawkish mirror case", () => {
    const result = calculate({
      fed: "STRONGLY HAWKISH",
      fed1m: "DOVISH",
      confirmation: "STRONG CONFIRMATION",
      ratesDirection: 1,
      ratesDirection1m: -1,
      longEndDirection: 0,
      regime: "MIXED / UNCLEAR",
    });
    expect(result.bias).toBe("BULLISH");
    expect(result.contradictingEvidence.some((item) => item.includes("mixed/unclear"))).toBe(true);
  });

  it("allows strongly bearish bias only with broad, multi-horizon aligned evidence", () => {
    const result = calculate({
      fed: "STRONGLY DOVISH",
      fed1m: "STRONGLY DOVISH",
      confirmation: "STRONG CONFIRMATION",
      ratesDirection: -1,
      ratesDirection1m: -1,
      longEndDirection: -1,
      regime: "BULL STEEPENING",
      growthMomentum: "SLOWING",
      labourMomentum: "COOLING",
      inflationMomentum: "COOLING",
      forwardPricePressure: "EASING",
    });
    expect(result.bias).toBe("STRONGLY BEARISH");
  });

  it("allows strongly bullish bias only with broad, multi-horizon aligned evidence", () => {
    const result = calculate({
      fed: "STRONGLY HAWKISH",
      fed1m: "STRONGLY HAWKISH",
      confirmation: "STRONG CONFIRMATION",
      ratesDirection: 1,
      ratesDirection1m: 1,
      longEndDirection: 1,
      regime: "BEAR STEEPENING",
      growthMomentum: "ACCELERATING",
      labourMomentum: "STRENGTHENING",
      inflationMomentum: "HEATING",
      forwardPricePressure: "SURGING",
    });
    expect(result.bias).toBe("STRONGLY BULLISH");
  });

  it("reduces the influence of dovish repricing when 2Y diverges", () => {
    const confirmed = calculate({ fed: "DOVISH", confirmation: "CONFIRMATION", ratesDirection: -1 });
    const divergent = calculate({ fed: "DOVISH", confirmation: "DIVERGENCE", ratesDirection: 1 });
    expect(biasIndex(divergent.bias)).toBeGreaterThan(biasIndex(confirmed.bias));
  });

  it("does not turn a strong economy into bullish USD against dovish repricing", () => {
    const result = calculate({
      growthState: "STRONG EXPANSION",
      growthMomentum: "ACCELERATING",
      fed: "DOVISH",
      confirmation: "CONFIRMATION",
      ratesDirection: -1,
    });
    expect(result.bias).toMatch(/BEARISH/);
  });

  it("does not mechanically make weak economy plus hawkish repricing bearish USD", () => {
    expect(calculate({
      growthState: "CONTRACTION",
      growthMomentum: "DETERIORATING",
      fed: "HAWKISH",
      confirmation: "CONFIRMATION",
    }).bias).toMatch(/BULLISH/);
  });

  it("does not turn above-target but cooling inflation into a bullish USD impulse", () => {
    const result = calculate({
      fed: "LITTLE / NO REPRICING",
      confirmation: "MIXED / WEAK",
      inflationMomentum: "COOLING",
      ratesDirection: 0,
      longEndDirection: 0,
      regime: "MIXED / UNCLEAR",
    });
    expect(result.bias).not.toMatch(/BULLISH/);
  });

  it("identifies reaccelerating inflation as a recent theme without treating its level as a USD signal", () => {
    const result = calculate({
      fed: "LITTLE / NO REPRICING",
      confirmation: "MIXED / WEAK",
      inflationMomentum: "HEATING",
      ratesDirection: 0,
      longEndDirection: 0,
      regime: "MIXED / UNCLEAR",
    });
    expect(result.primaryTheme).toBe("INFLATION");
    expect(result.bias).toBe("NEUTRAL");
  });

  it("preserves conflicting weekly and monthly rates context", () => {
    const result = calculate({ ratesDirection: -1, ratesDirection1m: 1 });
    expect(result.multiHorizonContext).toContain("inside a still-higher monthly rates backdrop");
  });

  it("identifies aligned weekly and monthly policy and rates horizons", () => {
    const result = calculate({
      fed: "DOVISH",
      fed1m: "DOVISH",
      confirmation: "CONFIRMATION",
      ratesDirection: -1,
      ratesDirection1m: -1,
    });
    expect(result.multiHorizonContext).toContain("align across 1W and 1M");
  });

  it("does not let noisy 1D repricing override a strong confirmed 1W impulse", () => {
    const result = calculate({
      fed1d: "STRONGLY DOVISH",
      fed: "STRONGLY HAWKISH",
      fed1m: "HAWKISH",
      confirmation: "STRONG CONFIRMATION",
      ratesDirection: 1,
    });
    expect(result.bias).toMatch(/BULLISH/);
    expect(result.policyImpulse.primary).toBe("STRONGLY HAWKISH");
  });

  it("reports no dominant theme when inputs are stable", () => {
    const result = calculate({
      fed: "LITTLE / NO REPRICING",
      confirmation: "MIXED / WEAK",
      ratesDirection: 0,
      longEndDirection: 0,
      regime: "MIXED / UNCLEAR",
    });
    expect(result.primaryTheme).toBe("MIXED / NO DOMINANT THEME");
  });

  it("generates bias-change conditions from current inflation and growth evidence", () => {
    const result = calculate({ forwardPricePressure: "SURGING" });
    expect(result.whatChangesBias.some((condition) => condition.includes("Forward price pressure"))).toBe(true);
    expect(result.whatChangesBias.some((condition) => condition.includes("stable growth momentum"))).toBe(true);
  });

  it("gracefully represents unavailable Fed and rates data", () => {
    const result = calculate({
      fed: "UNAVAILABLE",
      fed1m: "UNAVAILABLE",
      confirmation: "UNAVAILABLE",
      ratesDirection: null,
      ratesDirection1m: null,
      longEndDirection: null,
      regime: "UNAVAILABLE",
    });
    expect(result.bias).toBe("NEUTRAL");
    expect(result.marketConfirmation.longEndDivergence).toBeNull();
    expect(result.multiHorizonContext).toContain("no missing horizon was inferred");
  });

  it("reports macro inputs that conflict with the policy-led USD impulse", () => {
    const result = calculate({
      fed: "HAWKISH",
      confirmation: "CONFIRMATION",
      growthMomentum: "DETERIORATING",
      labourMomentum: "COOLING",
      inflationMomentum: "COOLING",
    });
    expect(result.contradictingEvidence.length).toBeGreaterThan(1);
  });
});

function biasIndex(bias: UsdMacroBias) {
  const order: UsdMacroBias[] = [
    "STRONGLY BEARISH",
    "BEARISH",
    "MILDLY BEARISH",
    "NEUTRAL",
    "MILDLY BULLISH",
    "BULLISH",
    "STRONGLY BULLISH",
  ];
  return order.indexOf(bias);
}
