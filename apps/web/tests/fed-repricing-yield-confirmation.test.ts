import { describe, expect, it } from "vitest";
import {
  calculateFedRepricingYieldConfirmation,
  type ConfirmationState,
} from "../src/lib/fed-repricing-yield-confirmation";
import type { FedRepricing } from "../src/lib/fed-pricing";
import type { YieldChange } from "../src/lib/us-rates-yield-curve-engine";

function fed(state: FedRepricing["state"]) {
  const arrows: Record<FedRepricing["state"], FedRepricing["arrow"]> = {
    "STRONGLY HAWKISH": "↑↑",
    HAWKISH: "↑",
    "LITTLE / NO REPRICING": "→",
    DOVISH: "↓",
    "STRONGLY DOVISH": "↓↓",
    UNAVAILABLE: "",
  };
  return { state, arrow: arrows[state] };
}

function yieldChange(direction: YieldChange["direction"]): Pick<
  YieldChange,
  "changeBasisPoints" | "direction" | "arrow"
> {
  const values: Record<
    YieldChange["direction"],
    { changeBasisPoints: number | null; arrow: string }
  > = {
    "UNUSUALLY LARGE RISE": { changeBasisPoints: 15, arrow: "↑↑" },
    RISE: { changeBasisPoints: 4, arrow: "↑" },
    STABLE: { changeBasisPoints: 0.5, arrow: "→" },
    DECLINE: { changeBasisPoints: -4, arrow: "↓" },
    "UNUSUALLY LARGE DECLINE": { changeBasisPoints: -15, arrow: "↓↓" },
    UNAVAILABLE: { changeBasisPoints: null, arrow: "" },
  };
  return { ...values[direction], direction };
}

function buildInput({
  fed1d = "HAWKISH",
  fed1w = "HAWKISH",
  fed1m = "HAWKISH",
  yield1d = "RISE",
  yield1w = "RISE",
  yield1m = "RISE",
}: {
  fed1d?: FedRepricing["state"];
  fed1w?: FedRepricing["state"];
  fed1m?: FedRepricing["state"];
  yield1d?: YieldChange["direction"];
  yield1w?: YieldChange["direction"];
  yield1m?: YieldChange["direction"];
} = {}) {
  return {
    polymarket: {
      upcomingMeetings: [
        {
          meetingDate: "2026-10-28",
          meetingLabel: "Fed Decision in October?",
          repricing: {
            oneDay: fed(fed1d),
            oneWeek: fed(fed1w),
            oneMonth: fed(fed1m),
          },
        },
      ],
    },
    rates: {
      maturities: {
        "2Y": {
          changes: {
            oneDay: yieldChange(yield1d),
            oneWeek: yieldChange(yield1w),
            oneMonth: yieldChange(yield1m),
            threeMonths: yieldChange("STABLE"),
          },
        },
      },
    },
  };
}

function classify(
  input: ReturnType<typeof buildInput>,
  horizon: "oneDay" | "oneWeek" | "oneMonth"
): ConfirmationState {
  return calculateFedRepricingYieldConfirmation(input).horizons[horizon].state;
}

describe("Fed repricing × US 2Y confirmation", () => {
  it("confirms hawkish repricing when the 2Y yield rises", () => {
    expect(classify(buildInput(), "oneDay")).toBe("CONFIRMATION");
  });

  it("confirms dovish repricing when the 2Y yield falls", () => {
    expect(
      classify(
        buildInput({ fed1d: "DOVISH", yield1d: "DECLINE" }),
        "oneDay"
      )
    ).toBe("CONFIRMATION");
  });

  it("flags hawkish repricing with a falling 2Y as divergence", () => {
    expect(
      classify(
        buildInput({ fed1d: "HAWKISH", yield1d: "DECLINE" }),
        "oneDay"
      )
    ).toBe("DIVERGENCE");
  });

  it("flags dovish repricing with a rising 2Y as divergence", () => {
    expect(
      classify(
        buildInput({ fed1d: "DOVISH", yield1d: "RISE" }),
        "oneDay"
      )
    ).toBe("DIVERGENCE");
  });

  it("requires strong magnitude from both engines for strong confirmation or divergence", () => {
    expect(
      classify(
        buildInput({
          fed1d: "STRONGLY DOVISH",
          yield1d: "UNUSUALLY LARGE DECLINE",
        }),
        "oneDay"
      )
    ).toBe("STRONG CONFIRMATION");
    expect(
      classify(
        buildInput({
          fed1d: "STRONGLY DOVISH",
          yield1d: "UNUSUALLY LARGE RISE",
        }),
        "oneDay"
      )
    ).toBe("STRONG DIVERGENCE");
  });

  it("classifies neutral Fed repricing or neutral 2Y movement as mixed / weak", () => {
    expect(
      classify(
        buildInput({
          fed1d: "LITTLE / NO REPRICING",
          yield1d: "RISE",
        }),
        "oneDay"
      )
    ).toBe("MIXED / WEAK");
    expect(
      classify(
        buildInput({
          fed1d: "HAWKISH",
          yield1d: "STABLE",
        }),
        "oneDay"
      )
    ).toBe("MIXED / WEAK");
  });

  it("marks a horizon unavailable if either matched-horizon input is unavailable", () => {
    expect(
      classify(
        buildInput({ fed1d: "UNAVAILABLE", yield1d: "RISE" }),
        "oneDay"
      )
    ).toBe("UNAVAILABLE");
    expect(
      classify(
        buildInput({ fed1d: "HAWKISH", yield1d: "UNAVAILABLE" }),
        "oneDay"
      )
    ).toBe("UNAVAILABLE");
  });

  it("keeps a strong one-week result primary despite a noisy conflicting one-day move", () => {
    const result = calculateFedRepricingYieldConfirmation(
      buildInput({
        fed1d: "DOVISH",
        yield1d: "UNUSUALLY LARGE RISE",
        fed1w: "STRONGLY HAWKISH",
        yield1w: "UNUSUALLY LARGE RISE",
        fed1m: "UNAVAILABLE",
        yield1m: "UNAVAILABLE",
      })
    );

    expect(result.horizons.oneDay.state).toBe("DIVERGENCE");
    expect(result.horizons.oneWeek.state).toBe("STRONG CONFIRMATION");
    expect(result.primaryHorizon).toBe("1W");
    expect(result.overall).toBe("STRONGLY CONFIRMED");
  });

  it("weights one week more than one day when the horizons conflict", () => {
    const result = calculateFedRepricingYieldConfirmation(
      buildInput({
        fed1d: "HAWKISH",
        yield1d: "DECLINE",
        fed1w: "DOVISH",
        yield1w: "DECLINE",
        fed1m: "UNAVAILABLE",
        yield1m: "UNAVAILABLE",
      })
    );

    expect(result.horizons.oneDay.state).toBe("DIVERGENCE");
    expect(result.horizons.oneWeek.state).toBe("CONFIRMATION");
    expect(result.overall).toBe("CONFIRMED");
  });
});
