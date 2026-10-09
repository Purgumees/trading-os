import { describe, expect, it } from "vitest";
import {
  calculateEuroAreaGrowthState,
} from "../src/lib/euro-area-growth-state-engine";
import type {
  EurostatGrowthObservation,
  EurostatGrowthSeries,
  EurostatGrowthSeriesId,
} from "../src/lib/eurostat-growth";

function makeQuarterSeries(
  id: "B1GQ" | "P31_S14_S15",
  quarterlyRate: number,
  freshness: "current" | "stale" = "current"
): EurostatGrowthSeries {
  const observations: EurostatGrowthObservation[] = [];
  let value = 1000;
  for (let index = 0; index < 10; index += 1) {
    if (index > 0) value *= 1 + quarterlyRate / 100;
    const quarterIndex = 2024 * 4 + index;
    observations.push({
      date: `${Math.floor(quarterIndex / 4)}-Q${(quarterIndex % 4) + 1}`,
      value: Number(value.toFixed(4)),
      flag: null,
    });
  }
  const dataset = "namq_10_gdp";
  return {
    id,
    dataset,
    label: id === "B1GQ" ? "Real GDP" : "Household consumption",
    source: "Eurostat",
    sourceUrl: `https://ec.europa.eu/eurostat/${dataset}?na_item=${id}`,
    geo: "EA",
    unit: "CLV20_MEUR",
    frequency: "Q",
    filters: { freq: "Q", unit: "CLV20_MEUR", na_item: id, geo: "EA" },
    lastUpdated: "2026-10-07T23:00:00+0200",
    freshness,
    latestObservationDate: observations.at(-1)!.date,
    observations,
  };
}

function makeMonthlySeries(
  id: "INDUSTRIAL_PRODUCTION" | "RETAIL_VOLUME",
  monthlyRate: number,
  freshness: "current" | "stale" = "current"
): EurostatGrowthSeries {
  const observations: EurostatGrowthObservation[] = [];
  let value = 100;
  for (let index = 0; index < 20; index += 1) {
    if (index > 0) value *= 1 + monthlyRate / 100;
    const date = new Date(Date.UTC(2025, index, 1)).toISOString().slice(0, 7);
    observations.push({ date, value: Number(value.toFixed(4)), flag: null });
  }
  const dataset = id === "INDUSTRIAL_PRODUCTION" ? "sts_inpr_m" : "sts_trtu_m";
  return {
    id,
    dataset,
    label: id,
    source: "Eurostat",
    sourceUrl: `https://ec.europa.eu/eurostat/${dataset}`,
    geo: "EA21",
    unit: "I21",
    frequency: "M",
    filters: { freq: "M", unit: "I21", geo: "EA21" },
    lastUpdated: "2026-10-08T11:00:00+0200",
    freshness,
    latestObservationDate: observations.at(-1)!.date,
    observations,
  };
}

function calculate(
  overrides: Partial<Record<EurostatGrowthSeriesId, EurostatGrowthSeries | null>> = {}
) {
  return calculateEuroAreaGrowthState({
    gdpSeries: overrides.B1GQ === undefined ? makeQuarterSeries("B1GQ", 0.8) : overrides.B1GQ,
    householdConsumptionSeries:
      overrides.P31_S14_S15 === undefined
        ? makeQuarterSeries("P31_S14_S15", 0.4)
        : overrides.P31_S14_S15,
    industrialProductionSeries:
      overrides.INDUSTRIAL_PRODUCTION === undefined
        ? makeMonthlySeries("INDUSTRIAL_PRODUCTION", 0.4)
        : overrides.INDUSTRIAL_PRODUCTION,
    retailSalesSeries:
      overrides.RETAIL_VOLUME === undefined
        ? makeMonthlySeries("RETAIL_VOLUME", 0.3)
        : overrides.RETAIL_VOLUME,
  });
}

describe("Euro Area Growth State Engine v1", () => {
  it("calculates quarterly GDP QoQ, annualized QoQ and YoY from real volume levels", () => {
    const state = calculate();
    expect(state.gdp.latest.qoq.value).toBeCloseTo(0.8, 2);
    expect(state.gdp.latest.qoqAnnualized.value).toBeCloseTo(
      (Math.pow(1.008, 4) - 1) * 100,
      2
    );
    expect(state.gdp.latest.yoy.value).toBeGreaterThan(0);
  });

  it("calculates monthly MoM, YoY and exact three- and six-month trends", () => {
    const state = calculate();
    expect(state.industrialProduction.latest.mom.value).toBeCloseTo(0.4, 2);
    expect(state.industrialProduction.latest.yoy.value).toBeGreaterThan(0);
    expect(state.industrialProduction.shortTermChange.value).toBeGreaterThan(0);
    expect(state.industrialProduction.mediumTermChange.value).toBeGreaterThan(0);
    expect(state.retailSales.direction3m).toBe("up");
    expect(state.retailSales.direction6m).toBe("up");
  });

  it("classifies available current activity while leaving unavailable PMI inputs out", () => {
    const state = calculate();
    expect(state.status).toBe("partial");
    expect(state.assessment.currentState).toBe("EXPANSION");
    expect(state.assessment.forwardGrowth).toBe("UNAVAILABLE");
    expect(state.manufacturingPmi.status).toBe("unavailable");
    expect(state.servicesPmi.status).toBe("unavailable");
    expect(state.assessment.explanation.forwardGrowth).toContain("unavailable");
  });

  it("weights available PMI New Orders significantly when reliable observations are supplied", () => {
    const state = calculateEuroAreaGrowthState({
      gdpSeries: makeQuarterSeries("B1GQ", 0.1),
      householdConsumptionSeries: makeQuarterSeries("P31_S14_S15", 0.1),
      industrialProductionSeries: makeMonthlySeries("INDUSTRIAL_PRODUCTION", 0.1),
      retailSalesSeries: makeMonthlySeries("RETAIL_VOLUME", 0.1),
      manufacturingPmi: {
        current: 51,
        previous: 50,
        date: "2026-08",
        newOrders: 57,
        source: "Verified test survey",
      },
      servicesPmi: {
        current: 52,
        previous: 51,
        date: "2026-08",
        newOrders: 58,
        source: "Verified test survey",
      },
    });
    expect(state.assessment.forwardGrowth).toBe("STRONGLY POSITIVE");
  });

  it("marks stale series and excludes their values from the current-state classification", () => {
    const state = calculate({
      B1GQ: makeQuarterSeries("B1GQ", 2, "stale"),
      P31_S14_S15: null,
      INDUSTRIAL_PRODUCTION: null,
      RETAIL_VOLUME: null,
    });
    expect(state.gdp.latest.qoq.value).toBeCloseTo(2, 2);
    expect(state.gdp.freshness).toBe("stale");
    expect(state.assessment.currentState).toBe("UNAVAILABLE");
    expect(state.explanations.join(" ")).toContain("STALE DATA");
  });

  it("does not substitute earlier observations when the required comparison period is missing", () => {
    const gdp = makeQuarterSeries("B1GQ", 1);
    const latestDate = gdp.observations.at(-1)!.date;
    const [latestYear, latestQuarter] = latestDate.split("-Q").map(Number);
    const previousQuarter =
      latestQuarter === 1
        ? `${latestYear! - 1}-Q4`
        : `${latestYear}-Q${latestQuarter! - 1}`;
    gdp.observations = gdp.observations.filter((observation) => observation.date !== previousQuarter);
    const state = calculate({
      B1GQ: gdp,
      P31_S14_S15: null,
      INDUSTRIAL_PRODUCTION: null,
      RETAIL_VOLUME: null,
    });
    expect(state.gdp.latest.qoq.value).toBeNull();
    expect(state.gdp.latest.qoqAnnualized.value).toBeNull();
    expect(state.gdp.latest.yoy.value).not.toBeNull();
  });

  it("preserves a failed series as missing and reports the source error", () => {
    const state = calculateEuroAreaGrowthState({
      gdpSeries: null,
      householdConsumptionSeries: null,
      industrialProductionSeries: null,
      retailSalesSeries: null,
      errors: { B1GQ: "HTTP 503" },
    });
    expect(state.status).toBe("unavailable");
    expect(state.assessment.currentState).toBe("UNAVAILABLE");
    expect(state.explanations.join(" ")).toContain("HTTP 503");
  });
});
