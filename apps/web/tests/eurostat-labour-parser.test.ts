import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEurostatLabourSeries } from "../src/lib/eurostat-labour";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Eurostat JSON-stat labour parser", () => {
  it("uses the official id/size dimension order, not object property order", async () => {
    const dataset = {
      id: ["time", "geo", "freq", "s_adj", "age", "sex", "unit"],
      size: [2, 1, 1, 1, 1, 1, 1],
      // Deliberately reverse the JSON object property order.
      dimension: {
        unit: { category: { index: { PC_ACT: 0 }, label: { PC_ACT: "Percent" } } },
        sex: { category: { index: { T: 0 }, label: { T: "Total" } } },
        age: { category: { index: { TOTAL: 0 }, label: { TOTAL: "All" } } },
        s_adj: { category: { index: { SA: 0 }, label: { SA: "SA" } } },
        freq: { category: { index: { M: 0 }, label: { M: "Monthly" } } },
        geo: { category: { index: { EA21: 0 }, label: { EA21: "EA21" } } },
        time: { category: { index: { "2026-01": 0, "2026-02": 1 }, label: { "2026-01": "Jan", "2026-02": "Feb" } } },
      },
      value: { "0": 6.4, "1": 6.2 },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => dataset }));
    const series = await fetchEurostatLabourSeries("UNR", "2026-03-15");
    expect(series.observations.map((o) => o.value)).toEqual([6.4, 6.2]);
    expect(series.observations.map((o) => o.date)).toEqual(["2026-01", "2026-02"]);
  });

  it("rejects missing required Eurostat category instead of substituting another series", async () => {
    const dataset = {
      id: ["time", "geo", "freq", "s_adj", "age", "sex", "unit"],
      size: [1, 1, 1, 1, 1, 1, 1],
      dimension: {
        time: { category: { index: { "2026-01": 0 }, label: { "2026-01": "Jan" } } },
        geo: { category: { index: { EA21: 0 }, label: { EA21: "EA21" } } },
        freq: { category: { index: { M: 0 }, label: { M: "Monthly" } } },
        s_adj: { category: { index: { SA: 0 }, label: { SA: "SA" } } },
        age: { category: { index: { TOTAL: 0 }, label: { TOTAL: "All" } } },
        sex: { category: { index: { T: 0 }, label: { T: "Total" } } },
        unit: { category: { index: { THS_PER: 0 }, label: { THS_PER: "Thousands" } } },
      },
      value: { "0": 120 },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => dataset }));
    await expect(fetchEurostatLabourSeries("UNR", "2026-03-15")).rejects.toThrow(
      "Missing requested Eurostat dimension unit=PC_ACT"
    );
  });
});
