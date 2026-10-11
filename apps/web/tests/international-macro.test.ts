import { describe, expect, it } from "vitest";
import { bisObservations, cpiHistory, csvRecords, nzGdp } from "../src/lib/international-macro";
describe("international source transformations", () => {
  it("preserves quoted multiline CSV and skips missing/wrong series", () => {
    const csv =
      'REF_AREA,UNIT_MEASURE,TIME_PERIOD,OBS_VALUE,NOTE\nJP,368,2026-10-01,1.25,"first\nsecond"\nJP,368,2026-10-02,,x\nAU,368,2026-10-01,4,x';
    expect(csvRecords(csv)[0]?.NOTE).toBe("first\nsecond");
    expect(bisObservations(csv, "JP", "368")).toEqual([{ date: "2026-10-01", value: 1.25 }]);
  });
  it("excludes interpolated months and computes quarterly changes from index levels", () => {
    const csv =
      "REF_AREA,UNIT_MEASURE,TIME_PERIOD,OBS_VALUE\nNZ,628,2025-12,100\nNZ,628,2026-03,102\nNZ,771,2026-03,4\nNZ,771,2026-04,4.1\nNZ,771,2026-05,4.2\nNZ,771,2026-06,4.3\nNZ,628,2026-06,103";
    const rows = cpiHistory(csv, "NZ", true);
    expect(rows.map((r) => r.date)).toEqual(["2026-Q1", "2026-Q2"]);
    expect(rows[0]?.change).toBeCloseTo(2);
    expect(rows[1]?.change).toBeCloseTo(100 / 102);
  });
  it("selects seasonally adjusted NZ real GDP levels only", () => {
    const csv =
      "Series_reference,Period,Data_value\nSNEQ.SG01RSC00B01,2026.06,71805\nSNEQ.SG01RSC01B01PC,2026.06,0.2\nSNEQ.SG01RSC00B01,2026.03,71662";
    expect(nzGdp(csv)).toEqual([
      { date: "2026-Q1", value: 71662 },
      { date: "2026-Q2", value: 71805 },
    ]);
  });
});
