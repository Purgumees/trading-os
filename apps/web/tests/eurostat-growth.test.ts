import { describe, expect, it } from "vitest";
import {
  buildEurostatGrowthUrl,
  parseEurostatGrowthDataset,
} from "../src/lib/eurostat-growth";

describe("Eurostat Euro Area Growth adapter", () => {
  it("requests verified official GDP, household consumption, industry and retail series", () => {
    const gdp = new URL(buildEurostatGrowthUrl("B1GQ"));
    expect(gdp.pathname.endsWith("/namq_10_gdp")).toBe(true);
    expect(gdp.searchParams.get("freq")).toBe("Q");
    expect(gdp.searchParams.get("unit")).toBe("CLV20_MEUR");
    expect(gdp.searchParams.get("s_adj")).toBe("SCA");
    expect(gdp.searchParams.get("na_item")).toBe("B1GQ");
    expect(gdp.searchParams.get("geo")).toBe("EA");

    const consumption = new URL(buildEurostatGrowthUrl("P31_S14_S15"));
    expect(consumption.searchParams.get("na_item")).toBe("P31_S14_S15");

    const industry = new URL(buildEurostatGrowthUrl("INDUSTRIAL_PRODUCTION"));
    expect(industry.pathname.endsWith("/sts_inpr_m")).toBe(true);
    expect(industry.searchParams.get("indic_bt")).toBe("PRD");
    expect(industry.searchParams.get("nace_r2")).toBe("B-D");
    expect(industry.searchParams.get("unit")).toBe("I21");
    expect(industry.searchParams.get("geo")).toBe("EA21");

    const retail = new URL(buildEurostatGrowthUrl("RETAIL_VOLUME"));
    expect(retail.pathname.endsWith("/sts_trtu_m")).toBe(true);
    expect(retail.searchParams.get("indic_bt")).toBe("VOL_SLS");
    expect(retail.searchParams.get("nace_r2")).toBe("G47");
    expect(retail.searchParams.get("s_adj")).toBe("SCA");
  });

  it("orders by the JSON-stat time dimension and omits missing values without filling them", () => {
    const parsed = parseEurostatGrowthDataset(
      {
        id: ["freq", "unit", "s_adj", "na_item", "geo", "time"],
        size: [1, 1, 1, 1, 1, 3],
        updated: "2026-10-07T23:00:00+0200",
        value: { "0": 105, "2": 108 },
        status: { "2": "p" },
        dimension: {
          freq: { category: { index: { Q: 0 }, label: { Q: "Quarterly" } } },
          unit: {
            category: {
              index: { CLV20_MEUR: 0 },
              label: { CLV20_MEUR: "Chain linked volumes (2020), million euro" },
            },
          },
          s_adj: {
            category: {
              index: { SCA: 0 },
              label: { SCA: "Seasonally and calendar adjusted data" },
            },
          },
          na_item: {
            category: {
              index: { B1GQ: 0 },
              label: { B1GQ: "Gross domestic product at market prices" },
            },
          },
          geo: {
            category: {
              index: { EA: 0 },
              label: { EA: "Euro area (EA11-1999, EA21-2026)" },
            },
          },
          time: {
            category: {
              index: { "2026-Q1": 1, "2025-Q4": 0, "2026-Q2": 2 },
            },
          },
        },
      },
      "B1GQ",
      "https://ec.europa.eu/eurostat/api/query",
      "2026-10-08"
    );

    expect(parsed.observations).toEqual([
      { date: "2025-Q4", value: 105, flag: null },
      { date: "2026-Q2", value: 108, flag: "p" },
    ]);
    expect(parsed.freshness).toBe("current");
  });

  it("rejects a response whose selected official dataset dimension does not match", () => {
    expect(() =>
      parseEurostatGrowthDataset(
        {
          id: ["freq", "unit", "s_adj", "na_item", "geo", "time"],
          size: [1, 1, 1, 1, 1, 1],
          value: { "0": 100 },
          dimension: {
            freq: { category: { index: { Q: 0 }, label: { Q: "Quarterly" } } },
            unit: {
              category: {
                index: { CLV20_MEUR: 0 },
                label: { CLV20_MEUR: "Chain linked volumes (2020), million euro" },
              },
            },
            s_adj: {
              category: {
                index: { SCA: 0 },
                label: { SCA: "Seasonally and calendar adjusted data" },
              },
            },
            na_item: {
              category: {
                index: { B1GQ: 0 },
                label: { B1GQ: "Wrong item" },
              },
            },
            geo: {
              category: {
                index: { EA: 0 },
                label: { EA: "Euro area" },
              },
            },
            time: { category: { index: { "2026-Q2": 0 } } },
          },
        },
        "B1GQ",
        "https://ec.europa.eu/eurostat/api/query",
        "2026-10-08"
      )
    ).toThrow(/unexpected category/);
  });
});
