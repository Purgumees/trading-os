import { describe, expect, it } from "vitest";
import {
  buildEurostatHicpUrl,
  EUROSTAT_HICP_SERIES,
  parseEurostatHicpDataset,
} from "../src/lib/eurostat-hicp";

describe("Eurostat HICP data adapter", () => {
  it("requests the verified Eurostat dataset with official Euro Area HICP filters", () => {
    const headline = new URL(buildEurostatHicpUrl("TOTAL"));
    const core = new URL(buildEurostatHicpUrl("TOT_X_NRG_FOOD"));
    expect(headline.pathname.endsWith("/prc_hicp_minr")).toBe(true);
    expect(headline.searchParams.get("freq")).toBe("M");
    expect(headline.searchParams.get("unit")).toBe("I25");
    expect(headline.searchParams.get("geo")).toBe("EA");
    expect(headline.searchParams.get("coicop18")).toBe("TOTAL");
    expect(headline.searchParams.get("sinceTimePeriod")).toBe("2020-01");
    expect(core.searchParams.get("coicop18")).toBe("TOT_X_NRG_FOOD");
    expect(EUROSTAT_HICP_SERIES.TOTAL.coicopLabel).toBe("Total");
    expect(EUROSTAT_HICP_SERIES.TOT_X_NRG_FOOD.coicopLabel).toBe(
      "Overall index excluding energy, food, alcohol and tobacco"
    );
  });

  it("orders observations by Eurostat time index and preserves flags without filling nulls", () => {
    const series = parseEurostatHicpDataset(
      {
        updated: "2026-02-06T23:00:00+0100",
        value: { "0": 120.5, "2": 121.1 },
        status: { "2": "b" },
        dimension: {
          coicop18: {
            category: {
              label: {
                TOTAL: "Total",
              },
            },
          },
          geo: {
            category: {
              label: {
                EA: "Euro area (EA11-1999, EA12-2001, EA13-2007, EA15-2008, EA16-2009, EA17-2011, EA18-2014, EA19-2015, EA20-2023, EA21-2026)",
              },
            },
          },
          time: {
            category: {
              index: {
                "2025-02": 1,
                "2025-01": 0,
                "2025-03": 2,
              },
            },
          },
        },
      },
      "TOTAL",
      "https://ec.europa.eu/eurostat/api/query"
    );
    expect(series.observations).toEqual([
      { date: "2025-01", index: 120.5, flag: null },
      { date: "2025-03", index: 121.1, flag: "b" },
    ]);
  });

  it("rejects unexpected COICOP 2018 values instead of substituting a different series", () => {
    expect(() =>
      parseEurostatHicpDataset(
        {
          value: { "0": 120 },
          dimension: {
            coicop18: { category: { label: { TOTAL: "Different series" } } },
            geo: { category: { label: { EA: "Euro area" } } },
            time: { category: { index: { "2025-01": 0 } } },
          },
        },
        "TOTAL",
        "https://ec.europa.eu/eurostat/api/query"
      )
    ).toThrow(/unexpected category/);
  });
});
