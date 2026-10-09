import { describe, expect, it } from "vitest";
import {
  calculateUsRatesYieldCurve,
  type TreasuryMaturity,
  type YieldObservation,
} from "../src/lib/us-rates-yield-curve-engine";
import {
  calculateUsRatesRegime,
  type RatesRegime,
} from "../src/lib/us-rates-regime-engine";

const NOW = new Date("2026-10-12T16:00:00.000Z");
const CURRENT = {
  "2Y": 4,
  "10Y": 4.5,
  "30Y": 5,
} as const;

type HorizonMoves = {
  "2Y": number;
  "10Y": number;
  "30Y": number;
};

type MoveSet = {
  oneDay: HorizonMoves;
  oneWeek: HorizonMoves;
  oneMonth: HorizonMoves;
};

function buildRateData(
  moves: MoveSet,
  missingMaturity?: TreasuryMaturity,
  fedOverall: "CONFIRMED" | "STRONGLY CONFIRMED" | "DIVERGING" | "STRONGLY DIVERGING" | "MIXED" | "INSUFFICIENT DATA" = "CONFIRMED"
) {
  const dates = [
    { date: "2026-10-12", horizon: null },
    { date: "2026-10-09", horizon: "oneDay" as const },
    { date: "2026-10-05", horizon: "oneWeek" as const },
    { date: "2026-09-11", horizon: "oneMonth" as const },
  ];
  const observations = Object.fromEntries(
    (["2Y", "5Y", "10Y", "30Y"] as const).map((maturity) => {
      if (maturity === missingMaturity) return [maturity, []];
      const base =
        maturity === "2Y"
          ? CURRENT["2Y"]
          : maturity === "10Y"
            ? CURRENT["10Y"]
            : maturity === "30Y"
              ? CURRENT["30Y"]
              : 4.25;
      const maturityKey = maturity === "5Y" ? "2Y" : maturity;
      const values: YieldObservation[] = dates.map(({ date, horizon }) => ({
        date,
        value:
          base -
          (horizon === null
            ? 0
            : moves[horizon][maturityKey as keyof HorizonMoves] / 100),
      }));
      return [maturity, values];
    })
  ) as Record<TreasuryMaturity, YieldObservation[]>;
  const rates = calculateUsRatesYieldCurve({ observations, now: NOW });
  const fedConfirmation = {
    overall: fedOverall,
  } as Parameters<typeof calculateUsRatesRegime>[0]["fedConfirmation"];
  return calculateUsRatesRegime({ rates, fedConfirmation });
}

function flatMoves(move: HorizonMoves): MoveSet {
  return { oneDay: move, oneWeek: move, oneMonth: move };
}

const baseline = { "2Y": 0, "10Y": 0, "30Y": 0 };

describe("US Long-End Rates & Yield Curve Interpretation Engine", () => {
  it.each([
    [
      "parallel rally",
      { "2Y": -10, "10Y": -10, "30Y": -10 },
      "PARALLEL RALLY",
    ],
    [
      "parallel selloff",
      { "2Y": 10, "10Y": 10, "30Y": 10 },
      "PARALLEL SELLOFF",
    ],
    [
      "bull steepening",
      { "2Y": -10, "10Y": -5, "30Y": -3 },
      "BULL STEEPENING",
    ],
    [
      "bear steepening",
      { "2Y": 3, "10Y": 8, "30Y": 12 },
      "BEAR STEEPENING",
    ],
    [
      "bull flattening",
      { "2Y": -3, "10Y": -8, "30Y": -12 },
      "BULL FLATTENING",
    ],
    [
      "bear flattening",
      { "2Y": 10, "10Y": 5, "30Y": 3 },
      "BEAR FLATTENING",
    ],
  ] as Array<[string, HorizonMoves, RatesRegime]>)("classifies %s", (_name, daily, expected) => {
    const result = buildRateData(flatMoves(daily));
    expect(result.horizons.oneDay.regime).toBe(expected);
    expect(result.primaryRegime).toBe(expected);
  });

  it("classifies non-aligned yield and curve movements as mixed / unclear", () => {
    const result = buildRateData(
      flatMoves({ "2Y": -10, "10Y": 4, "30Y": -3 })
    );
    expect(result.horizons.oneDay.regime).toBe("MIXED / UNCLEAR");
    expect(result.horizons.oneDay.yieldMovement).toBe(
      "SHORT-TERM YIELDS ↓ / LONG-TERM YIELDS MIXED (10Y ↑ / 30Y ↓)"
    );
  });

  it.each([
    [
      "short-term yields down while long-term yields rise",
      { "2Y": -10, "10Y": 5, "30Y": 8 },
      "SHORT-TERM YIELDS ↓ / LONG-TERM YIELDS ↑",
      "2Y yield declined while 10Y yield rose and 30Y yield rose.",
    ],
    [
      "short-term yields down while long-term yields are stable",
      { "2Y": -10, "10Y": 0, "30Y": 0 },
      "SHORT-TERM YIELDS ↓ / LONG-TERM YIELDS STABLE",
      "2Y yield declined while 10Y yield was unchanged and 30Y yield was unchanged.",
    ],
    [
      "short-term yields up while long-term yields fall",
      { "2Y": 10, "10Y": -5, "30Y": -8 },
      "SHORT-TERM YIELDS ↑ / LONG-TERM YIELDS ↓",
      "2Y yield rose while 10Y yield declined and 30Y yield declined.",
    ],
    [
      "all yields fall",
      { "2Y": -10, "10Y": -10, "30Y": -10 },
      "ALL YIELDS ↓",
      "The 2Y, 10Y, and 30Y yields are falling.",
    ],
    [
      "all yields rise",
      { "2Y": 10, "10Y": 10, "30Y": 10 },
      "ALL YIELDS ↑",
      "The 2Y, 10Y, and 30Y yields are rising.",
    ],
  ] as Array<[string, HorizonMoves, string, string]>)(
    "describes %s in plain language",
    (_name, daily, expectedMovement, expectedExplanation) => {
      const result = buildRateData(flatMoves(daily)).horizons.oneWeek;
      expect(result.yieldMovement).toBe(expectedMovement);
      expect(result.explanation).toContain(expectedExplanation);
      expect(result.explanation).toMatch(/Yield curve: (steepening|flattening|stable|mixed)\./);
    }
  );

  it("explains mixed curve direction through the actual spread movements", () => {
    const result = buildRateData(
      flatMoves({ "2Y": 0, "10Y": 5, "30Y": -5 })
    ).horizons.oneWeek;
    expect(result.curveDirection).toBe("MIXED");
    expect(result.yieldMovement).toBe(
      "SHORT-TERM YIELDS STABLE / LONG-TERM YIELDS MIXED (10Y ↑ / 30Y ↓)"
    );
    expect(result.explanation).toContain(
      "The yield curve is mixed/unclear: 2Y–10Y spread is steepening, while 2Y–30Y spread is flattening."
    );
  });

  it("marks a horizon unavailable when any required yield or spread data is missing", () => {
    const result = buildRateData(flatMoves(baseline), "30Y");
    expect(result.horizons.oneDay.regime).toBe("UNAVAILABLE");
    expect(result.horizons.oneDay.changes["30Y"]).toBeNull();
    expect(result.primaryRegime).toBe("UNAVAILABLE");
  });

  it("reports conflicting daily and weekly configurations without changing the 1W primary regime", () => {
    const result = buildRateData({
      oneDay: { "2Y": 10, "10Y": 5, "30Y": 3 },
      oneWeek: { "2Y": -10, "10Y": -5, "30Y": -3 },
      oneMonth: baseline,
    });
    expect(result.horizons.oneDay.regime).toBe("BEAR FLATTENING");
    expect(result.horizons.oneWeek.regime).toBe("BULL STEEPENING");
    expect(result.primaryRegime).toBe("BULL STEEPENING");
    expect(result.primaryHorizon).toBe("1W");
  });

  it("maps existing Fed × 2Y confirmation descriptively", () => {
    const result = buildRateData(flatMoves(baseline));
    expect(result.frontEndFedConfirmation).toBe("CONFIRMED");
    expect(
      buildRateData(flatMoves(baseline), undefined, "STRONGLY DIVERGING")
        .frontEndFedConfirmation
    ).toBe("DIVERGING");
    expect(
      buildRateData(flatMoves(baseline), undefined, "MIXED")
        .frontEndFedConfirmation
    ).toBe("UNAVAILABLE");
  });
});
