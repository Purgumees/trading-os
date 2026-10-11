import { expect, it } from "vitest";
import { quarterlyGrowthHistory } from "../src/lib/quarterly-growth-history";
it("calculates quarterly and annual growth and cumulative current-year change against Q4", () => {
  const d = quarterlyGrowthHistory([
    { date: "2025-Q2", value: 100 },
    { date: "2025-Q4", value: 110 },
    { date: "2026-Q1", value: 111 },
    { date: "2026-Q2", value: 112 },
  ]);
  expect(d.rows.at(-1)?.qoq).toBeCloseTo(100 / 111);
  expect(d.rows.at(-1)?.yoy).toBeCloseTo(12);
  expect(d.yearToDate).toBeCloseTo(200 / 110);
  expect(d.year).toBe(2026);
});
it("does not substitute another quarter when the comparator is missing", () => {
  const d = quarterlyGrowthHistory([
    { date: "2025-Q4", value: 100 },
    { date: "2026-Q2", value: 103 },
  ]);
  expect(d.rows.at(-1)?.qoq).toBeNull();
  expect(d.rows.at(-1)?.yoy).toBeNull();
  expect(d.rows.at(-2)?.qoq).toBeNull();
});
it("does not fabricate growth from empty history or a zero base", () => {
  expect(quarterlyGrowthHistory([]).rows).toEqual([]);
  expect(
    quarterlyGrowthHistory([
      { date: "2025-Q4", value: 0 },
      { date: "2026-Q1", value: 10 },
    ]).yearToDate,
  ).toBeNull();
});
