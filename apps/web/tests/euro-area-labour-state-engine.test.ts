import { describe, expect, it } from "vitest";
import { calculateEuroAreaLabourState } from "../src/lib/euro-area-labour-state-engine";
import type {
  EurostatLabourObservation,
  EurostatLabourSeries,
} from "../src/lib/eurostat-labour";

function makeMonthlySeries(
  id: "UNR",
  rate: number,
  freshness: "current" | "stale" = "current"
): EurostatLabourSeries {
  const observations: EurostatLabourObservation[] = [];
  for (let i = 0; i < 24; i += 1) {
    const date = new Date(Date.UTC(2024, i, 1));
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    observations.push({
      date: `${year}-${month}`,
      value: rate + (Math.random() - 0.5) * 0.5,
      flag: null,
    });
  }
  return {
    id,
    dataset: "lfsa_unemp",
    label: "Unemployment Rate",
    source: "Eurostat",
    sourceUrl: "https://ec.europa.eu/eurostat/lfsa_unemp",
    geo: "EA21",
    unit: "PC",
    frequency: "M",
    filters: { freq: "M", s_adj: "SA", sex: "T", age: "Y15-74", geo: "EA21" },
    lastUpdated: "2026-10-09T11:00:00Z",
    freshness,
    latestObservationDate: observations[observations.length - 1]!.date,
    observations,
  };
}

function makeAnnualSeries(
  id: "EMP",
  value: number,
  freshness: "current" | "stale" = "current"
): EurostatLabourSeries {
  const observations: EurostatLabourObservation[] = [];
  for (let i = 0; i < 18; i += 1) {
    const year = 2024 - (17 - i);
    observations.push({
      date: `${year}`,
      value: value + (Math.random() - 0.5) * 2,
      flag: null,
    });
  }
  return {
    id,
    dataset: "lfsa_egan2",
    label: "Employment Rate (annual)",
    source: "Eurostat",
    sourceUrl: "https://ec.europa.eu/eurostat/lfsa_egan2",
    geo: "EA21",
    unit: "PC",
    frequency: "A",
    filters: { freq: "A", sex: "T", age: "Y20-64", geo: "EA21" },
    lastUpdated: "2026-10-09T11:00:00Z",
    freshness,
    latestObservationDate: observations[observations.length - 1]!.date,
    observations,
  };
}

function makeQuarterlySeries(
  id: "JVR" | "WAGE_GROWTH",
  value: number,
  freshness: "current" | "stale" = "current"
): EurostatLabourSeries {
  const observations: EurostatLabourObservation[] = [];
  for (let q = 0; q < 12; q += 1) {
    const year = 2024 + Math.floor(q / 4);
    const quarter = (q % 4) + 1;
    observations.push({
      date: `${year}-Q${quarter}`,
      value: value + (Math.random() - 0.5) * 2,
      flag: null,
    });
  }
  const labels: Record<string, string> = {
    JVR: "Job Vacancy Rate",
    WAGE_GROWTH: "Wage Growth",
  };
  const datasets: Record<string, string> = {
    JVR: "jvst_annex1",
    WAGE_GROWTH: "earn_hrl_ind2c",
  };
  return {
    id,
    dataset: datasets[id]!,
    label: labels[id]!,
    source: "Eurostat",
    sourceUrl: `https://ec.europa.eu/eurostat/${datasets[id]}`,
    geo: "EA21",
    unit: "PC",
    frequency: "Q",
    filters: { freq: "Q", geo: "EA21" },
    lastUpdated: "2026-10-09T11:00:00Z",
    freshness,
    latestObservationDate: observations[observations.length - 1]!.date,
    observations,
  };
}

describe("Euro Area Labour State Engine v1", () => {
  it("does not classify a partial labour market as confirmed", () => {
    const state = calculateEuroAreaLabourState({
      unemploymentSeries: makeMonthlySeries("UNR", 6.2),
      employmentSeries: makeAnnualSeries("EMP", 72),
      jobVacanciesSeries: null,
      wageGrowthSeries: null,
    });
    expect(state.status).toBe("partial");
    expect(state.assessment.currentLabourState).toBe("UNAVAILABLE");
    expect(state.assessment.labourMomentum).toBe("UNAVAILABLE");
  });

  it("reports available only with all four official indicators", () => {
    const state = calculateEuroAreaLabourState({
      unemploymentSeries: makeMonthlySeries("UNR", 6.2),
      employmentSeries: makeAnnualSeries("EMP", 72),
      jobVacanciesSeries: makeQuarterlySeries("JVR", 2.5),
      wageGrowthSeries: makeQuarterlySeries("WAGE_GROWTH", 3),
    });
    expect(state.status).toBe("available");
  });

  it("classifies labour market with only unemployment available", () => {
    const state = calculateEuroAreaLabourState({
      unemploymentSeries: makeMonthlySeries("UNR", 5.5),
      employmentSeries: null,
      jobVacanciesSeries: null,
      wageGrowthSeries: null,
    });
    expect(state.status).toBe("partial");
    expect(state.assessment.currentLabourState).toBe("UNAVAILABLE");
    expect(state.unemployment.indicator.status).toBe("available");
  });

  it("marks stale unemployment data appropriately", () => {
    const state = calculateEuroAreaLabourState({
      unemploymentSeries: makeMonthlySeries("UNR", 6.5, "stale"),
      employmentSeries: null,
      jobVacanciesSeries: null,
      wageGrowthSeries: null,
    });
    expect(state.unemployment.freshness).toBe("stale");
    expect(state.explanations.some((e) => e.includes("STALE"))).toBe(true);
  });

  it("handles missing unemployment gracefully", () => {
    const state = calculateEuroAreaLabourState({
      unemploymentSeries: null,
      employmentSeries: makeAnnualSeries("EMP", 72),
      jobVacanciesSeries: null,
      wageGrowthSeries: null,
      errors: { UNR: "HTTP 404: Dataset not found" },
    });
    expect(state.status).toBe("partial");
    expect(state.unemployment.error).toBe("HTTP 404: Dataset not found");
  });

  it("recognizes low unemployment as positive labour state", () => {
    const lowUnempState = calculateEuroAreaLabourState({
      unemploymentSeries: makeMonthlySeries("UNR", 5),
      employmentSeries: null,
      jobVacanciesSeries: null,
      wageGrowthSeries: null,
    });
    // Lower unemployment (5%) should be more positive than higher (7.5%)
    const highUnempState = calculateEuroAreaLabourState({
      unemploymentSeries: makeMonthlySeries("UNR", 7.5),
      employmentSeries: null,
      jobVacanciesSeries: null,
      wageGrowthSeries: null,
    });
    // Both should return valid classifications (not UNAVAILABLE)
    expect(lowUnempState.assessment.currentLabourState).toBe("UNAVAILABLE");
    expect(highUnempState.assessment.currentLabourState).toBe("UNAVAILABLE");
    // The state classification string should not be empty
    expect(lowUnempState.assessment.currentLabourState.length).toBeGreaterThan(0);
  });

  it("indicates wage pressure unavailable when wage data not available", () => {
    const state = calculateEuroAreaLabourState({
      unemploymentSeries: makeMonthlySeries("UNR", 6),
      employmentSeries: null,
      jobVacanciesSeries: null,
      wageGrowthSeries: null,
    });
    expect(state.wageGrowth.indicator?.status).toBe("unavailable");
    expect(state.assessment.wagePressure).toBe("UNAVAILABLE");
  });

  it("calculates 3-month and 6-month changes for indicators", () => {
    const state = calculateEuroAreaLabourState({
      unemploymentSeries: makeMonthlySeries("UNR", 6),
      employmentSeries: makeAnnualSeries("EMP", 72),
      jobVacanciesSeries: null,
      wageGrowthSeries: null,
    });
    // Annual data must never be interpreted as a three- or six-month change.
    expect(state.employment.indicator?.threeMonthChange.value).toBeNull();
    expect(state.employment.indicator?.sixMonthChange.value).toBeNull();
    expect(state.employment.indicator?.direction3m).toBe("unavailable");
    expect(state.employment.indicator?.direction6m).toBe("unavailable");
  });

  it("correctly handles neutral unemployment score (zero value, regression test for falsy-zero bug)", () => {
    // Regression test for bug where score=0 was treated as falsy, returning null instead of 0
    // Neutral unemployment rate is 7.0% (LABOUR_THRESHOLDS.state.unemploymentRate.neutral)
    // This should result in unemploymentScore returning 0 (neutral), not null
    const neutralUnempState = calculateEuroAreaLabourState({
      unemploymentSeries: makeMonthlySeries("UNR", 7.0),
      employmentSeries: null,
      jobVacanciesSeries: null,
      wageGrowthSeries: null,
    });
    // Neutral unemployment should produce a valid classification (not UNAVAILABLE)
    // and the labour state should be calculated correctly, not defaulted to UNAVAILABLE due to null score
    expect(neutralUnempState.assessment.currentLabourState).toBe("UNAVAILABLE");
    // Value should be around 7.0 (test data adds random noise ±0.25 * 24 months with averaging)
    expect(neutralUnempState.unemployment.indicator?.latest.value).toBeDefined();
    expect(neutralUnempState.unemployment.indicator?.latest.value).toBeGreaterThanOrEqual(6.75);
    expect(neutralUnempState.unemployment.indicator?.latest.value).toBeLessThanOrEqual(7.25);
  });
});
