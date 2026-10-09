import { describe, expect, it } from "vitest";
import {
  buildDatedChanges,
  calibrateHistoricalMove,
  LABOUR_CALIBRATION_CONFIG,
  type DatedChange,
  type DatedObservation,
} from "../src/lib/labour-history-calibration";

function monthlyChanges(valuesNewestFirst: number[], latestDate: string) {
  const latest = new Date(`${latestDate}T00:00:00Z`);
  return valuesNewestFirst.map((value, index) => {
    const date = new Date(latest);
    date.setUTCMonth(date.getUTCMonth() - index);
    return { date: date.toISOString().slice(0, 10), value };
  });
}

function historyWithVariation(latestDate = "2025-01-01"): DatedChange[] {
  const baseline = Array.from({ length: 36 }, (_, index) => {
    const changes = [-4, -2, -1, 0, 1, 2, 3, 4, -3];
    return changes[index % changes.length] ?? 0;
  });
  baseline[10] = 100_000;
  return monthlyChanges(baseline, "2024-12-01").map((change) => ({
    ...change,
    date: change.date,
  }));
}

describe("Labour historical calibration", () => {
  it("distinguishes ordinary and unusually large moves using robust history", () => {
    const historical = historyWithVariation();
    const latestDate = "2025-01-01";
    const ordinary = calibrateHistoricalMove({
      latestMove: 1,
      latestDate,
      historicalChangesNewestFirst: historical,
      cadence: "monthly",
      fallbackThresholds: { moderate: 20, strong: 75 },
    });
    const unusual = calibrateHistoricalMove({
      latestMove: 20,
      latestDate,
      historicalChangesNewestFirst: historical,
      cadence: "monthly",
      fallbackThresholds: { moderate: 20, strong: 75 },
    });

    expect(ordinary.method).toBe("historical");
    expect(ordinary.score).toBe(0);
    expect(unusual.method).toBe("historical");
    expect(unusual.score).toBe(2);
    expect(unusual.percentileRank).toBeGreaterThanOrEqual(
      LABOUR_CALIBRATION_CONFIG.unusualUpperPercentile
    );
  });

  it("uses only observations dated before the move being calibrated", () => {
    const latestDate = "2025-01-01";
    const historical = [
      ...monthlyChanges(Array.from({ length: 36 }, () => 1), "2024-12-01"),
      { date: "2025-02-01", value: 1_000_000 },
    ];
    const result = calibrateHistoricalMove({
      latestMove: 1,
      latestDate,
      historicalChangesNewestFirst: historical,
      cadence: "monthly",
      fallbackThresholds: { moderate: 20, strong: 75 },
    });

    expect(result.method).toBe("historical");
    expect(result.sampleSize).toBe(36);
    expect(result.score).toBe(0);
  });

  it("falls back to centralized v1 thresholds when history is insufficient", () => {
    const historical = monthlyChanges([1, 2, 0, -1], "2024-12-01");
    const result = calibrateHistoricalMove({
      latestMove: -80,
      latestDate: "2025-01-01",
      historicalChangesNewestFirst: historical,
      cadence: "monthly",
      fallbackThresholds: { moderate: 20, strong: 75 },
    });

    expect(result).toEqual({
      score: -2,
      method: "fallback",
      sampleSize: 4,
      percentileRank: null,
    });
  });

  it("reverses raw direction for inverse indicators like unemployment", () => {
    const historical = historyWithVariation();
    const result = calibrateHistoricalMove({
      latestMove: 20,
      latestDate: "2025-01-01",
      historicalChangesNewestFirst: historical,
      cadence: "monthly",
      fallbackThresholds: { moderate: 20, strong: 75 },
      macroSignalMultiplier: -1,
    });

    expect(result.score).toBe(-2);
  });

  it("uses ranks that remain stable when the history contains an extreme outlier", () => {
    const historical = historyWithVariation();
    const withoutExtreme = historical.filter((item) => item.value !== 100_000);
    const withOutlier = calibrateHistoricalMove({
      latestMove: 4,
      latestDate: "2025-01-01",
      historicalChangesNewestFirst: historical,
      cadence: "monthly",
      fallbackThresholds: { moderate: 20, strong: 75 },
    });
    const robustReference = calibrateHistoricalMove({
      latestMove: 4,
      latestDate: "2025-01-01",
      historicalChangesNewestFirst: withoutExtreme,
      cadence: "monthly",
      fallbackThresholds: { moderate: 20, strong: 75 },
    });

    expect(withOutlier.score).toBe(robustReference.score);
  });

  it("builds changes newest-first while skipping gaps in observation cadence", () => {
    const observations: DatedObservation[] = [
      { date: "2025-03-01", value: 104 },
      { date: "2025-02-01", value: 100 },
      { date: "2024-12-01", value: 90 },
      { date: "2024-11-01", value: 88 },
    ];

    expect(buildDatedChanges(observations, "monthly")).toEqual([
      { date: "2025-03-01", value: 4 },
      { date: "2024-12-01", value: 2 },
    ]);
  });
});
