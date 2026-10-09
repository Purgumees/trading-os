import { describe, expect, it } from "vitest";
import {
  calculateEuroAreaInflationState,
  ECB_INFLATION_TARGET_PERCENT,
} from "../src/lib/euro-area-inflation-state-engine";
import type { EurostatHicpObservation, EurostatHicpSeries } from "../src/lib/eurostat-hicp";

function makeSeries(
  code: "TOTAL" | "TOT_X_NRG_FOOD",
  monthlyRates: number[] = Array.from({ length: 36 }, () => 0.15)
): EurostatHicpSeries {
  let index = 100;
  const observations: EurostatHicpObservation[] = [];
  for (let offset = 0; offset < monthlyRates.length; offset += 1) {
    if (offset > 0) index *= 1 + monthlyRates[offset]! / 100;
    const month = new Date(Date.UTC(2023, offset, 1)).toISOString().slice(0, 7);
    observations.push({ date: month, index: Number(index.toFixed(4)), flag: null });
  }
  return {
    dataset: "prc_hicp_minr",
    code,
    label: code === "TOTAL" ? "Headline HICP" : "Core HICP (excluding energy, food, alcohol and tobacco)",
    geo: "EA",
    unit: "I25",
    frequency: "M",
    source: "Eurostat",
    sourceUrl: `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?coicop18=${code}`,
    lastUpdated: "2026-10-02T11:00:00+0200",
    observations,
  };
}

describe("Euro Area Inflation State v1", () => {
  it("uses the ECB 2% target and retains distinct headline and core states", () => {
    const result = calculateEuroAreaInflationState({
      headlineSeries: makeSeries("TOTAL", Array.from({ length: 36 }, () => 0.25)),
      coreSeries: makeSeries("TOT_X_NRG_FOOD", Array.from({ length: 36 }, () => 0.1)),
    });
    expect(ECB_INFLATION_TARGET_PERCENT).toBe(2);
    expect(result.target.authority).toBe("European Central Bank");
    expect(result.current.headline).not.toBe("UNAVAILABLE");
    expect(result.current.core).not.toBe("UNAVAILABLE");
    expect(result.current.overall).not.toBe("UNAVAILABLE");
  });

  it("calculates YoY, MoM and geometric 3-month annualized rates from index observations", () => {
    const headlineSeries = makeSeries("TOTAL", Array.from({ length: 36 }, () => 0.2));
    const result = calculateEuroAreaInflationState({
      headlineSeries,
      coreSeries: makeSeries("TOT_X_NRG_FOOD", Array.from({ length: 36 }, () => 0.2)),
    });
    const latest = headlineSeries.observations.at(-1)!;
    const prior = headlineSeries.observations.at(-2)!;
    const yearAgo = headlineSeries.observations.at(-13)!;
    const threeMonthsAgo = headlineSeries.observations.at(-4)!;
    expect(result.headline.latest.yoy.value).toBeCloseTo((latest.index / yearAgo.index - 1) * 100, 2);
    expect(result.headline.latest.mom.value).toBeCloseTo((latest.index / prior.index - 1) * 100, 2);
    expect(result.headline.latest.annualized3m.value).toBeCloseTo(
      (Math.pow(latest.index / threeMonthsAgo.index, 4) - 1) * 100,
      2
    );
  });

  it("retains at least 24 raw monthly observations and renders six latest consecutive months", () => {
    const headline = makeSeries("TOTAL");
    const core = makeSeries("TOT_X_NRG_FOOD");
    const result = calculateEuroAreaInflationState({
      headlineSeries: headline,
      coreSeries: core,
    });
    expect(result.headline.internalHistoryRequirementMet).toBe(true);
    expect(result.headline.internalObservationCount).toBe(36);
    expect(result.headline.rawObservations).toHaveLength(36);
    expect(result.headline.latestSixMonths).toHaveLength(6);
    expect(result.headline.latestSixMonths.map((month) => month.date)).toEqual([
      "2025-07",
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
    ]);
  });

  it("does not interpolate missing monthly observations", () => {
    const headline = makeSeries("TOTAL");
    headline.observations = headline.observations.filter((observation) => observation.date !== "2025-11");
    const result = calculateEuroAreaInflationState({
      headlineSeries: headline,
      coreSeries: makeSeries("TOT_X_NRG_FOOD"),
    });
    const missingMonth = result.headline.latestSixMonths.find((month) => month.date === "2025-11");
    expect(missingMonth).toEqual({
      date: "2025-11",
      index: null,
      yoy: null,
      mom: null,
      annualized3m: null,
    });
    expect(result.headline.missingMonthsInLatestSix).toContain("2025-11");
  });

  it("keeps headline target state available when core fails and reports incomplete pair status", () => {
    const result = calculateEuroAreaInflationState({
      headlineSeries: makeSeries("TOTAL"),
      coreSeries: null,
      coreError: "Eurostat request failed with HTTP 503.",
    });
    expect(result.status).toBe("partial");
    expect(result.current.overall).toBe(result.current.headline);
    expect(result.current.overall).not.toBe("UNAVAILABLE");
    expect(result.current.core).toBe("UNAVAILABLE");
    expect(result.explanations.join(" ")).toContain("HTTP 503");
  });

  it("does not substitute core HICP for the ECB-target headline state", () => {
    const result = calculateEuroAreaInflationState({
      headlineSeries: null,
      headlineError: "Eurostat request failed with HTTP 503.",
      coreSeries: makeSeries("TOT_X_NRG_FOOD"),
    });
    expect(result.status).toBe("partial");
    expect(result.current.overall).toBe("UNAVAILABLE");
    expect(result.current.core).not.toBe("UNAVAILABLE");
  });

  it("preserves source identity, dates, monthly pace, and observation flags", () => {
    const result = calculateEuroAreaInflationState({
      headlineSeries: makeSeries("TOTAL"),
      coreSeries: makeSeries("TOT_X_NRG_FOOD"),
    });
    expect(result.source).toEqual({
      name: "Eurostat",
      dataset: "prc_hicp_minr",
      geo: "EA",
      unit: "I25",
      frequency: "M",
      historyFrom: "2020-01",
      freshnessMethod: expect.any(String),
    });
    expect(result.headline.seriesId).toBe("TOTAL");
    expect(result.core.seriesId).toBe("TOT_X_NRG_FOOD");
    expect(result.headline.latestObservationDate).toBe("2025-12");
    expect(result.headline.latest.index.date).toBe("2025-12");
    expect(result.headline.rawObservations[0]?.flag).toBeNull();
  });

  it("marks observations stale after two calendar months without replacing their values", () => {
    const headline = makeSeries("TOTAL");
    const core = makeSeries("TOT_X_NRG_FOOD");
    const result = calculateEuroAreaInflationState({
      headlineSeries: headline,
      coreSeries: core,
      asOfDate: "2026-02-01",
    });
    expect(result.headline.latestObservationDate).toBe("2025-12");
    expect(result.headline.freshness).toBe("stale");
    expect(result.core.freshness).toBe("stale");
    expect(result.headline.latest.index.value).toBeCloseTo(
      headline.observations.at(-1)!.index,
      2
    );
    expect(result.explanations.join(" ")).toContain("STALE DATA");
  });

  it("considers the previous month's observation current", () => {
    const headline = makeSeries("TOTAL");
    const result = calculateEuroAreaInflationState({
      headlineSeries: headline,
      coreSeries: makeSeries("TOT_X_NRG_FOOD"),
      asOfDate: "2026-01-08",
    });
    expect(result.headline.freshness).toBe("current");
  });
});
