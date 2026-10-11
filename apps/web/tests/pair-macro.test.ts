import { describe, it, expect } from "vitest";
import {
  indexInflation,
  matchedDifference,
  comparisonSeries,
  type ComparisonSnapshot,
} from "../src/lib/pair-macro";
import { employmentHistory, monthEndHistory } from "../src/lib/international-macro";
describe("pair comparisons and additional labour history", () => {
  it("matches periods rather than subtracting unrelated latest observations", () => {
    expect(
      matchedDifference(
        [
          { date: "2026-10-06", value: 2.5 },
          { date: "2026-10-09", value: 3 },
        ],
        [{ date: "2026-10-06", value: 4 }],
      ),
    ).toEqual({ date: "2026-10-06", value: -1.5 });
    expect(
      matchedDifference([{ date: "2026-Q2", value: 4 }], [{ date: "2026-06", value: 3 }]),
    ).toBeNull();
  });
  it("calculates YoY and MoM using exact calendar comparators", () => {
    const rows = indexInflation([
      { date: "2025-08", value: 100 },
      { date: "2026-06", value: 105 },
      { date: "2026-08", value: 110 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.yoy).toBeCloseTo(10);
    expect(rows[0]?.change).toBeNull();
  });
  it("shows nonannualized GDP growth instead of comparing GDP levels", () => {
    const snapshot = {
      gdp: [
        { date: "2026-Q1", value: 100 },
        { date: "2026-Q2", value: 101 },
      ],
      policy: [],
      inflation: [],
      labour: [],
    } as unknown as ComparisonSnapshot;
    expect(comparisonSeries(snapshot).gdp).toEqual([{ date: "2026-Q2", value: expect.closeTo(1) }]);
  });
  it("does not bridge a missing employment month", () => {
    const rows = employmentHistory(
      [
        { date: "2026-01", value: 100 },
        { date: "2026-03", value: 110 },
      ],
      false,
    );
    expect(rows[1]?.change).toBeNull();
  });
  it("computes quarterly employment changes and preserves actual month-end observation dates", () => {
    expect(
      employmentHistory(
        [
          { date: "2025-Q4", value: 100 },
          { date: "2026-Q1", value: 104 },
        ],
        true,
      )[1]?.change,
    ).toBe(4);
    expect(
      monthEndHistory([
        { date: "2026-01-03", value: 3 },
        { date: "2026-01-30", value: 4 },
        { date: "2026-02-06", value: 5 },
      ]),
    ).toEqual([
      { date: "2026-01-30", value: 4 },
      { date: "2026-02-06", value: 5 },
    ]);
  });
});
