import { describe, expect, it } from "vitest";
import {
  calculateBasisPointChange,
  calculateUsRatesYieldCurve,
  type TreasuryMaturity,
  type YieldObservation,
} from "../src/lib/us-rates-yield-curve-engine";

const NOW = new Date("2026-10-12T16:00:00.000Z");

function makeObservations(
  entries: Array<[string, number]>
): Record<TreasuryMaturity, YieldObservation[]> {
  const series = entries.map(([date, value]) => ({ date, value }));
  return {
    "2Y": series,
    "5Y": series,
    "10Y": series,
    "30Y": series,
  };
}

describe("US Rates & Yield Curve Engine", () => {
  it("calculates yield changes in basis points", () => {
    expect(calculateBasisPointChange(4.35, 4.2)).toBe(15);
    expect(calculateBasisPointChange(4.2, 4.35)).toBe(-15);
    expect(calculateBasisPointChange(null, 4.35)).toBeNull();
  });

  it("selects prior available Treasury observations around weekends and holidays", () => {
    const result = calculateUsRatesYieldCurve({
      observations: makeObservations([
        ["2026-10-12", 4.2],
        ["2026-10-09", 4.1],
        ["2026-10-08", 4.05],
        ["2026-10-05", 4],
        ["2026-09-11", 3.9],
        ["2026-07-10", 3.8],
      ]),
      now: NOW,
    });

    expect(result.maturities["2Y"].changes.oneDay.comparisonDate).toBe("2026-10-09");
    expect(result.maturities["2Y"].changes.oneWeek.comparisonDate).toBe("2026-10-05");
    expect(result.maturities["2Y"].changes.oneMonth.comparisonDate).toBe("2026-09-11");
    expect(result.maturities["2Y"].changes.threeMonths.comparisonDate).toBe("2026-07-10");
    expect(result.maturities["2Y"].changes.oneDay.changeBasisPoints).toBe(10);
  });

  it("calculates maturity spreads and classifies curve steepening and flattening", () => {
    const steepening = calculateUsRatesYieldCurve({
      observations: {
        "2Y": [
          { date: "2026-10-12", value: 4.2 },
          { date: "2026-10-09", value: 4.2 },
        ],
        "5Y": [
          { date: "2026-10-12", value: 4.3 },
          { date: "2026-10-09", value: 4.25 },
        ],
        "10Y": [
          { date: "2026-10-12", value: 4.5 },
          { date: "2026-10-09", value: 4.4 },
        ],
        "30Y": [
          { date: "2026-10-12", value: 4.8 },
          { date: "2026-10-09", value: 4.7 },
        ],
      },
      now: NOW,
    });
    expect(steepening.yieldCurve["2Y-10Y"].currentSpreadBasisPoints).toBe(30);
    expect(steepening.yieldCurve["2Y-10Y"].changes.oneDay.changeBasisPoints).toBe(10);
    expect(steepening.yieldCurve["2Y-10Y"].changes.oneDay.direction).toBe("STEEPENING");
    expect(steepening.yieldCurve["2Y-30Y"].currentSpreadBasisPoints).toBe(60);
    expect(steepening.yieldCurve["5Y-30Y"].currentSpreadBasisPoints).toBe(50);

    const flattening = calculateUsRatesYieldCurve({
      observations: {
        "2Y": [
          { date: "2026-10-12", value: 4.3 },
          { date: "2026-10-09", value: 4.2 },
        ],
        "5Y": [
          { date: "2026-10-12", value: 4.3 },
          { date: "2026-10-09", value: 4.3 },
        ],
        "10Y": [
          { date: "2026-10-12", value: 4.4 },
          { date: "2026-10-09", value: 4.5 },
        ],
        "30Y": [
          { date: "2026-10-12", value: 4.7 },
          { date: "2026-10-09", value: 4.8 },
        ],
      },
      now: NOW,
    });
    expect(flattening.yieldCurve["2Y-10Y"].changes.oneDay.direction).toBe("FLATTENING");
  });

  it("uses maturity-specific historical moves without look-ahead for unusually large direction", () => {
    const observations = Array.from({ length: 300 }, (_, index) => {
      const date = new Date("2026-10-12T00:00:00Z");
      date.setUTCDate(date.getUTCDate() - index);
      return {
        date: date.toISOString().slice(0, 10),
        value: index === 0 ? 4.2 : 4,
      };
    });
    const result = calculateUsRatesYieldCurve({
      observations: {
        "2Y": observations,
        "5Y": observations.map((item) => ({ ...item, value: item.value + 0.5 })),
        "10Y": observations.map((item) => ({ ...item, value: item.value + 1 })),
        "30Y": observations.map((item) => ({ ...item, value: item.value + 1.5 })),
      },
      now: NOW,
    });

    expect(result.maturities["2Y"].changes.oneDay.direction).toBe(
      "UNUSUALLY LARGE RISE"
    );
    expect(result.maturities["2Y"].changes.oneDay.calibration.method).toBe(
      "historical"
    );
    expect(result.maturities["2Y"].changes.oneDay.calibration.sampleSize).toBeGreaterThanOrEqual(
      52
    );
  });

  it("marks missing or stale observations unavailable and never fills missing spreads", () => {
    const result = calculateUsRatesYieldCurve({
      observations: {
        "2Y": [{ date: "2026-10-12", value: 4.2 }],
        "5Y": [],
        "10Y": [{ date: "2026-09-01", value: 4.4 }],
        "30Y": [{ date: "2026-10-12", value: 4.8 }],
      },
      now: NOW,
    });

    expect(result.maturities["2Y"].changes.oneDay.direction).toBe("UNAVAILABLE");
    expect(result.maturities["5Y"].latest.status).toBe("unavailable");
    expect(result.maturities["10Y"].latest.status).toBe("stale");
    expect(result.yieldCurve["2Y-10Y"].currentSpreadBasisPoints).toBeNull();
    expect(result.yieldCurve["2Y-10Y"].changes.oneDay.direction).toBe("UNAVAILABLE");
    expect(result.summary.longEndDominates).toBeNull();
  });

  it("ignores observations dated after the calculation time", () => {
    const result = calculateUsRatesYieldCurve({
      observations: makeObservations([
        ["2026-10-13", 9],
        ["2026-10-12", 4.2],
        ["2026-10-09", 4.1],
      ]),
      now: NOW,
    });

    expect(result.maturities["2Y"].latest).toMatchObject({
      value: 4.2,
      date: "2026-10-12",
    });
  });
});
