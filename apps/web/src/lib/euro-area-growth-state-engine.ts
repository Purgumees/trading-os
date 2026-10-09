import type {
  EurostatGrowthObservation,
  EurostatGrowthSeries,
  EurostatGrowthSeriesId,
} from "@/lib/eurostat-growth";
import type {
  EurostatEcSurveyId,
  EurostatEcSurveySeries,
} from "@/lib/eurostat-ec-surveys";

export type EuroGrowthState =
  | "STRONG EXPANSION"
  | "EXPANSION"
  | "WEAK EXPANSION"
  | "STAGNATION"
  | "CONTRACTION"
  | "UNAVAILABLE";
export type EuroGrowthMomentum =
  | "ACCELERATING"
  | "IMPROVING"
  | "STABLE"
  | "SLOWING"
  | "DETERIORATING"
  | "UNAVAILABLE";
export type EuroForwardGrowth =
  | "STRONGLY POSITIVE"
  | "POSITIVE"
  | "NEUTRAL"
  | "NEGATIVE"
  | "STRONGLY NEGATIVE"
  | "UNAVAILABLE";
type TrendDirection = "up" | "down" | "flat" | "unavailable";
type Metric = { value: number | null; date: string | null };

export type EuroAreaForwardSurveyIndicator = {
  id: EurostatEcSurveyId;
  label: string;
  dataset: string;
  source: "European Commission DG ECFIN via Eurostat";
  sourceUrl: string;
  geo: string;
  unit: "balance";
  freshness: "current" | "stale" | "unavailable";
  status: "available" | "unavailable";
  latest: Metric;
  recentChange: Metric;
  shortTermChange: Metric;
  mediumTermChange: Metric;
  shortTermDirection: TrendDirection;
  mediumTermDirection: TrendDirection;
  historyCount: number;
  lastUpdated: string | null;
  error: string | null;
};

export type EuroAreaGrowthState = {
  status: "available" | "partial" | "unavailable";
  area: "Euro area";
  assessment: {
    currentState: EuroGrowthState;
    momentum: EuroGrowthMomentum;
    forwardGrowth: EuroForwardGrowth;
    explanation: {
      currentState: string;
      momentum: string;
      forwardGrowth: string;
    };
    positiveDrivers: string[];
    negativeDrivers: string[];
  };
  gdp: {
    freshness: "current" | "stale" | "unavailable";
    latest: {
      level: Metric;
      qoq: Metric;
      qoqAnnualized: Metric;
      yoy: Metric;
    };
    previousQuarter: Metric;
    series: EurostatGrowthSeries | null;
    error: string | null;
    rawObservations: EurostatGrowthObservation[];
  };
  householdConsumption: {
    freshness: "current" | "stale" | "unavailable";
    latest: {
      level: Metric;
      qoq: Metric;
      qoqAnnualized: Metric;
      yoy: Metric;
    };
    previousQuarter: Metric;
    series: EurostatGrowthSeries | null;
    error: string | null;
    rawObservations: EurostatGrowthObservation[];
  };
  industrialProduction: MonthlyActivity;
  retailSales: MonthlyActivity;
  forwardSurvey: {
    manufacturingOrderBooks: EuroAreaForwardSurveyIndicator;
    manufacturingProductionExpectations: EuroAreaForwardSurveyIndicator;
    servicesDemandExpectations: EuroAreaForwardSurveyIndicator;
    method: string;
  };
  sources: {
    freshnessMethod: string;
    surveyMethod: string;
  };
  explanations: string[];
};

type MonthlyActivity = {
  freshness: "current" | "stale" | "unavailable";
  latest: {
    index: Metric;
    mom: Metric;
    yoy: Metric;
  };
  shortTermChange: Metric;
  mediumTermChange: Metric;
  direction3m: TrendDirection;
  direction6m: TrendDirection;
  series: EurostatGrowthSeries | null;
  error: string | null;
  rawObservations: EurostatGrowthObservation[];
};

const CURRENT_STATE_WEIGHTS = {
  gdp: 2.5,
  householdConsumption: 2,
  industrialProduction: 1,
  retailSales: 1,
} as const;

function round(value: number) {
  return Number(value.toFixed(2));
}

function offsetMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, monthNumber! - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function offsetQuarter(quarter: string, offset: number) {
  const [year, q] = quarter.split("-Q").map(Number);
  const date = (year! * 4) + q! - 1 + offset;
  return `${Math.floor(date / 4)}-Q${(date % 4) + 1}`;
}

function monthDistance(newer: string, older: string) {
  const [newYear, newMonth] = newer.split("-").map(Number);
  const [oldYear, oldMonth] = older.split("-").map(Number);
  return (newYear! - oldYear!) * 12 + newMonth! - oldMonth!;
}

function observationMap(series: EurostatGrowthSeries | null) {
  return new Map((series?.observations ?? []).map((item) => [item.date, item.value]));
}

function percentChange(current: number | undefined, previous: number | undefined) {
  if (current === undefined || previous === undefined || previous === 0) return null;
  return round((current / previous - 1) * 100);
}

function qoqAnnualized(current: number | undefined, previous: number | undefined) {
  if (current === undefined || previous === undefined || previous <= 0) return null;
  return round((Math.pow(current / previous, 4) - 1) * 100);
}

function metric(value: number | null, date: string | null): Metric {
  return { value, date };
}

function quarterMetrics(series: EurostatGrowthSeries | null) {
  const byQuarter = observationMap(series);
  const latest = series?.observations.at(-1);
  const date = latest?.date ?? null;
  const previousDate = date ? offsetQuarter(date, -1) : null;
  const yearAgoDate = date ? offsetQuarter(date, -4) : null;
  const previous = previousDate ? byQuarter.get(previousDate) : undefined;
  const yearAgo = yearAgoDate ? byQuarter.get(yearAgoDate) : undefined;
  return {
    latest: {
      level: metric(latest ? round(latest.value) : null, date),
      qoq: metric(percentChange(latest?.value, previous), date),
      qoqAnnualized: metric(qoqAnnualized(latest?.value, previous), date),
      yoy: metric(percentChange(latest?.value, yearAgo), date),
    },
    previousQuarter: metric(previous === undefined ? null : round(previous), previousDate),
  };
}

function monthlyMetrics(series: EurostatGrowthSeries | null): Omit<
  MonthlyActivity,
  "freshness" | "series" | "error"
> {
  const byMonth = observationMap(series);
  const latest = series?.observations.at(-1);
  const date = latest?.date ?? null;
  const previous = date ? byMonth.get(offsetMonth(date, -1)) : undefined;
  const yearAgo = date ? byMonth.get(offsetMonth(date, -12)) : undefined;
  const threeMonthsAgo = date ? byMonth.get(offsetMonth(date, -3)) : undefined;
  const sixMonthsAgo = date ? byMonth.get(offsetMonth(date, -6)) : undefined;
  const shortTermChange = percentChange(latest?.value, threeMonthsAgo);
  const mediumTermChange = percentChange(latest?.value, sixMonthsAgo);
  return {
    latest: {
      index: metric(latest ? round(latest.value) : null, date),
      mom: metric(percentChange(latest?.value, previous), date),
      yoy: metric(percentChange(latest?.value, yearAgo), date),
    },
    shortTermChange: metric(shortTermChange, date),
    mediumTermChange: metric(mediumTermChange, date),
    direction3m: trendDirection(shortTermChange, 0.15),
    direction6m: trendDirection(mediumTermChange, 0.3),
    rawObservations: series?.observations ?? [],
  };
}

function trendDirection(value: number | null, threshold: number): TrendDirection {
  if (value === null) return "unavailable";
  if (value > threshold) return "up";
  if (value < -threshold) return "down";
  return "flat";
}

function componentFreshness(series: EurostatGrowthSeries | null) {
  return series?.freshness ?? "unavailable";
}

function usable(value: number | null, freshness: "current" | "stale" | "unavailable") {
  return freshness === "current" ? value : null;
}

function growthRateScore(value: number | null, frequency: "Q" | "Y") {
  if (value === null) return null;
  if (frequency === "Q") {
    if (value <= -1) return -2;
    if (value < 0) return -1;
    if (value < 0.75) return 0;
    if (value < 2) return 0.75;
    if (value < 3.5) return 1.25;
    return 2;
  }
  if (value <= -2) return -2;
  if (value < 0) return -1;
  if (value < 1) return 0;
  if (value < 3) return 0.75;
  if (value < 5) return 1.25;
  return 2;
}

type Signal = { label: string; score: number | null; weight: number };

function weightedScore(signals: Signal[]) {
  const available = signals.filter((signal) => signal.score !== null);
  const weight = available.reduce((sum, signal) => sum + signal.weight, 0);
  if (!weight) return null;
  return available.reduce((sum, signal) => sum + signal.score! * signal.weight, 0) / weight;
}

function changeScore(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  const difference = current - previous;
  if (difference >= 1.25) return 2;
  if (difference >= 0.35) return 1;
  if (difference <= -1.25) return -2;
  if (difference <= -0.35) return -1;
  return 0;
}

function trendScore(value: number | null) {
  if (value === null) return null;
  if (value >= 0.75) return 2;
  if (value > 0.15) return 1;
  if (value <= -0.75) return -2;
  if (value < -0.15) return -1;
  return 0;
}

function classifyMomentum(score: number | null): EuroGrowthMomentum {
  if (score === null) return "UNAVAILABLE";
  if (score >= 1) return "ACCELERATING";
  if (score >= 0.3) return "IMPROVING";
  if (score <= -1) return "DETERIORATING";
  if (score <= -0.3) return "SLOWING";
  return "STABLE";
}

function balanceLevelScore(value: number | null) {
  if (value === null) return null;
  if (value >= 20) return 2;
  if (value >= 5) return 1;
  if (value > -5) return 0;
  if (value > -20) return -1;
  return -2;
}

function balanceChangeScore(value: number | null, threshold: number, strongThreshold: number) {
  if (value === null) return null;
  if (value >= strongThreshold) return 2;
  if (value >= threshold) return 1;
  if (value <= -strongThreshold) return -2;
  if (value <= -threshold) return -1;
  return 0;
}

function unavailableForwardIndicator(
  id: EurostatEcSurveyId,
  error: string | null
): EuroAreaForwardSurveyIndicator {
  const labelById: Record<EurostatEcSurveyId, string> = {
    "BS-IOB": "Manufacturing order-book assessment",
    "BS-IPE": "Manufacturing production expectations (next 3 months)",
    "BS-SAEM": "Services demand expectations (next 3 months)",
  };
  return {
    id,
    label: labelById[id],
    dataset: id === "BS-SAEM" ? "ei_bsse_m_r2" : "ei_bsin_m_r2",
    source: "European Commission DG ECFIN via Eurostat",
    sourceUrl: "",
    geo: "EA21",
    unit: "balance",
    freshness: "unavailable",
    status: "unavailable",
    latest: metric(null, null),
    recentChange: metric(null, null),
    shortTermChange: metric(null, null),
    mediumTermChange: metric(null, null),
    shortTermDirection: "unavailable",
    mediumTermDirection: "unavailable",
    historyCount: 0,
    lastUpdated: null,
    error,
  };
}

function buildForwardIndicator(
  id: EurostatEcSurveyId,
  series: EurostatEcSurveySeries | null,
  error: string | null
): EuroAreaForwardSurveyIndicator {
  if (!series) return unavailableForwardIndicator(id, error);
  const byMonth = new Map(series.observations.map((item) => [item.date, item.value]));
  const latest = series.observations.at(-1);
  const date = latest?.date ?? null;
  const previous = date ? byMonth.get(offsetMonth(date, -1)) : undefined;
  const threeMonthsAgo = date ? byMonth.get(offsetMonth(date, -3)) : undefined;
  const twelveMonthsAgo = date ? byMonth.get(offsetMonth(date, -12)) : undefined;
  const latestIsCurrent = series.freshness === "current" && latest !== undefined;
  return {
    id,
    label: series.label,
    dataset: series.dataset,
    source: series.source,
    sourceUrl: series.sourceUrl,
    geo: series.geo,
    unit: "balance",
    freshness: series.freshness,
    status: latest ? "available" : "unavailable",
    latest: metric(latest ? round(latest.value) : null, date),
    recentChange: metric(
      latestIsCurrent ? (previous === undefined ? null : round(latest.value - previous)) : null,
      date
    ),
    shortTermChange: metric(
      latestIsCurrent ? (threeMonthsAgo === undefined ? null : round(latest.value - threeMonthsAgo)) : null,
      date
    ),
    mediumTermChange: metric(
      latestIsCurrent ? (twelveMonthsAgo === undefined ? null : round(latest.value - twelveMonthsAgo)) : null,
      date
    ),
    shortTermDirection: latestIsCurrent
      ? trendDirection(
          threeMonthsAgo === undefined ? null : latest.value - threeMonthsAgo,
          2
        )
      : "unavailable",
    mediumTermDirection: latestIsCurrent
      ? trendDirection(
          twelveMonthsAgo === undefined ? null : latest.value - twelveMonthsAgo,
          3
        )
      : "unavailable",
    historyCount: series.observations.length,
    lastUpdated: series.lastUpdated,
    error,
  };
}

function scoreForwardGrowth(
  indicators: EuroAreaForwardSurveyIndicator[]
) {
  const indicatorWeights: Record<EurostatEcSurveyId, number> = {
    "BS-IOB": 1.5,
    "BS-IPE": 2,
    "BS-SAEM": 2,
  };
  const signals: Signal[] = indicators.map((indicator) => {
    const current = indicator.freshness === "current" ? indicator.latest.value : null;
    const seriesScore = weightedScore([
      { label: "Current balance", score: balanceLevelScore(current), weight: 1.25 },
      {
        label: "Latest monthly change",
        score: balanceChangeScore(
          indicator.recentChange.value,
          1,
          4
        ),
        weight: 0.75,
      },
      {
        label: "Three-month change",
        score: balanceChangeScore(
          indicator.shortTermChange.value,
          2,
          6
        ),
        weight: 1,
      },
      {
        label: "Twelve-month change",
        score: balanceChangeScore(
          indicator.mediumTermChange.value,
          3,
          10
        ),
        weight: 1,
      },
    ]);
    return {
      label: indicator.label,
      score: seriesScore,
      weight: indicatorWeights[indicator.id],
    };
  });
  const score = weightedScore(signals);
  if (score === null) return { growth: "UNAVAILABLE" as const, score, signals };
  const growth: EuroForwardGrowth =
    score >= 1.25 ? "STRONGLY POSITIVE"
      : score >= 0.35 ? "POSITIVE"
        : score <= -1.25 ? "STRONGLY NEGATIVE"
          : score <= -0.35 ? "NEGATIVE"
            : "NEUTRAL";
  return { growth, score, signals };
}

function drivers(signals: Signal[], positive: boolean) {
  return signals
    .filter((signal) => signal.score !== null && (positive ? signal.score > 0 : signal.score < 0))
    .sort((left, right) =>
      positive
        ? right.score! * right.weight - left.score! * left.weight
        : left.score! * left.weight - right.score! * right.weight
    )
    .slice(0, 3)
    .map((signal) => signal.label);
}

function errorExplanation(label: string, error: string | null) {
  return error ? `${label} data unavailable: ${error}` : null;
}

function seriesExplanation(
  label: string,
  series: EurostatGrowthSeries | null,
  error: string | null
) {
  if (error) return errorExplanation(label, error)!;
  if (!series) return `${label} data is unavailable.`;
  if (series.freshness === "stale") {
    return `${label} is STALE DATA; latest observation is ${series.latestObservationDate}.`;
  }
  return null;
}

function forwardIndicatorExplanation(indicator: EuroAreaForwardSurveyIndicator) {
  if (indicator.error) return `${indicator.label} unavailable: ${indicator.error}`;
  if (indicator.freshness === "stale") {
    return `${indicator.label} is STALE DATA; latest observation is ${indicator.latest.date}.`;
  }
  if (indicator.status === "unavailable") {
    return `${indicator.label} is unavailable.`;
  }
  return null;
}

export function calculateEuroAreaGrowthState({
  gdpSeries,
  householdConsumptionSeries,
  industrialProductionSeries,
  retailSalesSeries,
  manufacturingOrderBooks,
  manufacturingProductionExpectations,
  servicesDemandExpectations,
  errors = {},
  surveyErrors = {},
}: {
  gdpSeries: EurostatGrowthSeries | null;
  householdConsumptionSeries: EurostatGrowthSeries | null;
  industrialProductionSeries: EurostatGrowthSeries | null;
  retailSalesSeries: EurostatGrowthSeries | null;
  manufacturingOrderBooks: EurostatEcSurveySeries | null;
  manufacturingProductionExpectations: EurostatEcSurveySeries | null;
  servicesDemandExpectations: EurostatEcSurveySeries | null;
  errors?: Partial<Record<EurostatGrowthSeriesId, string | null>>;
  surveyErrors?: Partial<Record<EurostatEcSurveyId, string | null>>;
}): EuroAreaGrowthState {
  const gdpMetrics = quarterMetrics(gdpSeries);
  const consumptionMetrics = quarterMetrics(householdConsumptionSeries);
  const industryMetrics = monthlyMetrics(industrialProductionSeries);
  const retailMetrics = monthlyMetrics(retailSalesSeries);
  const gdpFreshness = componentFreshness(gdpSeries);
  const consumptionFreshness = componentFreshness(householdConsumptionSeries);
  const industryFreshness = componentFreshness(industrialProductionSeries);
  const retailFreshness = componentFreshness(retailSalesSeries);
  const stateSignals: Signal[] = [
    {
      label: "Real GDP",
      score: growthRateScore(
        usable(gdpMetrics.latest.qoqAnnualized.value, gdpFreshness),
        "Q"
      ),
      weight: CURRENT_STATE_WEIGHTS.gdp,
    },
    {
      label: "Household consumption",
      score: growthRateScore(
        usable(consumptionMetrics.latest.qoqAnnualized.value, consumptionFreshness),
        "Q"
      ),
      weight: CURRENT_STATE_WEIGHTS.householdConsumption,
    },
    {
      label: "Industrial production",
      score: growthRateScore(
        usable(industryMetrics.latest.yoy.value, industryFreshness),
        "Y"
      ),
      weight: CURRENT_STATE_WEIGHTS.industrialProduction,
    },
    {
      label: "Retail sales",
      score: growthRateScore(
        usable(retailMetrics.latest.yoy.value, retailFreshness),
        "Y"
      ),
      weight: CURRENT_STATE_WEIGHTS.retailSales,
    },
  ];
  const stateScore = weightedScore(stateSignals);
  const strongSignals = stateSignals.filter((signal) => signal.score !== null && signal.score >= 2);
  const currentState: EuroGrowthState =
    stateScore === null ? "UNAVAILABLE"
      : stateScore >= 1.5 && strongSignals.length >= 3 ? "STRONG EXPANSION"
        : stateScore >= 0.6 ? "EXPANSION"
          : stateScore >= 0.15 ? "WEAK EXPANSION"
            : stateScore > -0.35 ? "STAGNATION"
              : "CONTRACTION";

  const currentGdpRate = usable(gdpMetrics.latest.qoqAnnualized.value, gdpFreshness);
  const gdpByQuarter = observationMap(gdpSeries);
  const latestGdpDate = gdpSeries?.observations.at(-1)?.date;
  const previousGdpValue = latestGdpDate
    ? gdpByQuarter.get(offsetQuarter(latestGdpDate, -1))
    : undefined;
  const previousPreviousGdpValue = latestGdpDate
    ? gdpByQuarter.get(offsetQuarter(latestGdpDate, -2))
    : undefined;
  const previousGdpRate = qoqAnnualized(
    previousGdpValue,
    previousPreviousGdpValue
  );

  const currentConsumptionRate = usable(
    consumptionMetrics.latest.qoqAnnualized.value,
    consumptionFreshness
  );
  const consumptionByQuarter = observationMap(householdConsumptionSeries);
  const latestConsumptionDate = householdConsumptionSeries?.observations.at(-1)?.date;
  const consumptionPreviousRate = qoqAnnualized(
    latestConsumptionDate
      ? consumptionByQuarter.get(offsetQuarter(latestConsumptionDate, -1))
      : undefined,
    latestConsumptionDate
      ? consumptionByQuarter.get(offsetQuarter(latestConsumptionDate, -2))
      : undefined
  );
  const momentumSignals: Signal[] = [
    {
      label: "GDP growth rate",
      score: currentGdpRate === null || gdpFreshness !== "current"
        ? null
        : changeScore(currentGdpRate, previousGdpRate),
      weight: 2,
    },
    {
      label: "Household consumption growth rate",
      score: currentConsumptionRate === null || consumptionFreshness !== "current"
        ? null
        : changeScore(currentConsumptionRate, consumptionPreviousRate),
      weight: 1.5,
    },
    {
      label: "Industrial production (3M)",
      score: trendScore(usable(industryMetrics.shortTermChange.value, industryFreshness)),
      weight: 1.25,
    },
    {
      label: "Industrial production (6M)",
      score: trendScore(usable(industryMetrics.mediumTermChange.value, industryFreshness)),
      weight: 0.75,
    },
    {
      label: "Retail sales (3M)",
      score: trendScore(usable(retailMetrics.shortTermChange.value, retailFreshness)),
      weight: 1.25,
    },
    {
      label: "Retail sales (6M)",
      score: trendScore(usable(retailMetrics.mediumTermChange.value, retailFreshness)),
      weight: 0.75,
    },
  ];
  const momentumScore = weightedScore(momentumSignals);
  const momentum = classifyMomentum(momentumScore);
  const orderBooks = buildForwardIndicator(
    "BS-IOB",
    manufacturingOrderBooks,
    surveyErrors["BS-IOB"] ?? null
  );
  const productionExpectations = buildForwardIndicator(
    "BS-IPE",
    manufacturingProductionExpectations,
    surveyErrors["BS-IPE"] ?? null
  );
  const servicesExpectations = buildForwardIndicator(
    "BS-SAEM",
    servicesDemandExpectations,
    surveyErrors["BS-SAEM"] ?? null
  );
  const forwardIndicators = [orderBooks, productionExpectations, servicesExpectations];
  const forwardResult = scoreForwardGrowth(forwardIndicators);
  const positiveDrivers = drivers(stateSignals, true);
  const negativeDrivers = drivers(stateSignals, false);
  const forwardPositive = drivers(forwardResult.signals, true);
  const forwardNegative = drivers(forwardResult.signals, false);
  const explanations = [
    seriesExplanation("Real GDP", gdpSeries, errors.B1GQ ?? null),
    seriesExplanation(
      "Household consumption",
      householdConsumptionSeries,
      errors.P31_S14_S15 ?? null
    ),
    seriesExplanation(
      "Industrial production",
      industrialProductionSeries,
      errors.INDUSTRIAL_PRODUCTION ?? null
    ),
    seriesExplanation("Retail sales", retailSalesSeries, errors.RETAIL_VOLUME ?? null),
    ...forwardIndicators.map(forwardIndicatorExplanation),
  ].filter((item): item is string => item !== null);
  const currentSeriesLabels = [
    [gdpFreshness, "real GDP"],
    [consumptionFreshness, "household consumption"],
    [industryFreshness, "industrial production"],
    [retailFreshness, "retail sales"],
  ] as const;
  const freshSeriesNames = currentSeriesLabels
    .filter(([freshness]) => freshness === "current")
    .map(([, label]) => label);
  const currentSeriesCount = freshSeriesNames.length;
  const availableForwardIndicators = forwardIndicators.filter(
    (indicator) => indicator.status === "available" && indicator.freshness === "current"
  ).length;
  const hasAnySeries = [gdpSeries, householdConsumptionSeries, industrialProductionSeries, retailSalesSeries]
    .some((series) => series !== null) || forwardIndicators.some((indicator) => indicator.status === "available");
  const status =
    currentSeriesCount === 4 && availableForwardIndicators === 3
      ? "available"
      : hasAnySeries
        ? "partial"
        : "unavailable";

  return {
    status,
    area: "Euro area",
    assessment: {
      currentState,
      momentum,
      forwardGrowth: forwardResult.growth,
      explanation: {
        currentState: stateScore === null
          ? "Current Euro Area growth state is unavailable because there are no fresh activity indicators."
          : `${currentState} uses fresh data for ${freshSeriesNames.join(", ")}.${positiveDrivers[0] ? ` Strongest positive: ${positiveDrivers[0]}.` : ""}${negativeDrivers[0] ? ` Weakest: ${negativeDrivers[0]}.` : ""}`,
        momentum: momentumScore === null
          ? "Growth momentum is unavailable because there are no fresh comparable changes."
          : `${momentum} reflects changes in quarterly growth rates and the 3- and 6-month direction of monthly activity.`,
        forwardGrowth: forwardResult.growth === "UNAVAILABLE"
          ? "Forward Growth is unavailable because no fresh verified European Commission business survey indicators are available."
          : `${forwardResult.growth} reflects the levels and recent changes in available European Commission manufacturing order books, manufacturing production expectations, and services demand expectations.`,
      },
      positiveDrivers: [...new Set([...positiveDrivers, ...forwardPositive])].slice(0, 3),
      negativeDrivers: [...new Set([...negativeDrivers, ...forwardNegative])].slice(0, 3),
    },
    gdp: {
      freshness: gdpFreshness,
      ...gdpMetrics,
      series: gdpSeries,
      error: errors.B1GQ ?? null,
      rawObservations: gdpSeries?.observations ?? [],
    },
    householdConsumption: {
      freshness: consumptionFreshness,
      ...consumptionMetrics,
      series: householdConsumptionSeries,
      error: errors.P31_S14_S15 ?? null,
      rawObservations: householdConsumptionSeries?.observations ?? [],
    },
    industrialProduction: {
      freshness: industryFreshness,
      ...industryMetrics,
      series: industrialProductionSeries,
      error: errors.INDUSTRIAL_PRODUCTION ?? null,
      rawObservations: industrialProductionSeries?.observations ?? [],
    },
    retailSales: {
      freshness: retailFreshness,
      ...retailMetrics,
      series: retailSalesSeries,
      error: errors.RETAIL_VOLUME ?? null,
      rawObservations: retailSalesSeries?.observations ?? [],
    },
    forwardSurvey: {
      manufacturingOrderBooks: orderBooks,
      manufacturingProductionExpectations: productionExpectations,
      servicesDemandExpectations: servicesExpectations,
      method:
        "Forward Growth combines balance levels (weight 1.25), one-month changes (0.75), three-month changes (1.0), and twelve-month changes (1.0) for each available survey series. Manufacturing order books carry component weight 1.5; manufacturing production expectations and services demand expectations carry weight 2 each. Balance levels are graded at +20/+5/-5/-20 points; changes are graded at 1/4 points monthly, 2/6 points over three months, and 3/10 points over twelve months. Missing comparison periods are omitted, stale observations are excluded, and classifications are never inferred from unavailable series. These are survey balances, not PMI indices.",
    },
    sources: {
      freshnessMethod:
        "Quarterly series are current when their observation is no more than two quarter indices behind the current quarter; monthly series are current when no more than two calendar months behind. Older or future-dated observations are marked stale and excluded from current growth classifications. Latest published values remain visible with their status.",
      surveyMethod:
        "Monthly harmonised European Commission DG ECFIN Business and Consumer Survey observations are accessed through Eurostat's public Statistics API. Balance series use freq=M, s_adj=SA, unit=BAL, geo=EA21. Observations up to one calendar month old are current; older or future-dated observations are stale.",
    },
    explanations,
  };
}
