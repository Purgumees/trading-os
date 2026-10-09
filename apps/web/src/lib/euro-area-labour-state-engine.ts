/**
 * Euro Area Labour State Engine v1
 * Classifies Euro Area labour market conditions using official Eurostat data
 * Three outputs: Current Labour State, Labour Momentum, Wage Pressure
 */

import type {
  EurostatLabourObservation,
  EurostatLabourSeries,
  EurostatLabourSeriesId,
} from "@/lib/eurostat-labour";

export type EuroLabourState =
  | "VERY STRONG"
  | "STRONG"
  | "RESILIENT"
  | "COOLING"
  | "WEAK"
  | "UNAVAILABLE";

export type EuroLabourMomentum =
  | "STRENGTHENING"
  | "IMPROVING"
  | "STABLE"
  | "COOLING"
  | "DETERIORATING"
  | "UNAVAILABLE";

export type EuroWagePressure =
  | "RISING RAPIDLY"
  | "RISING"
  | "STABLE"
  | "COOLING"
  | "RAPIDLY COOLING"
  | "UNAVAILABLE";

type Metric = { value: number | null; date: string | null };
type TrendDirection = "up" | "down" | "flat" | "unavailable";

export type EuroAreaLabourIndicator = {
  id: EurostatLabourSeriesId;
  label: string;
  dataset: string;
  source: "Eurostat";
  sourceUrl: string;
  geo: "EA21";
  unit: string;
  frequency: "M" | "Q";
  freshness: "current" | "stale" | "unavailable";
  status: "available" | "unavailable";
  latest: Metric;
  previous: Metric;
  previous3m: Metric;
  previous6m: Metric;
  latestChange: Metric; // Latest - Previous
  threeMonthChange: Metric; // Latest - 3m ago
  sixMonthChange: Metric; // Latest - 6m ago
  direction3m: TrendDirection;
  direction6m: TrendDirection;
  historyCount: number;
  lastUpdated: string | null;
  error: string | null;
};

export type EuroAreaLabourState = {
  status: "available" | "partial" | "unavailable";
  area: "Euro area";
  assessment: {
    currentLabourState: EuroLabourState;
    labourMomentum: EuroLabourMomentum;
    wagePressure: EuroWagePressure;
    explanation: {
      currentLabourState: string;
      labourMomentum: string;
      wagePressure: string;
    };
    positiveDrivers: string[];
    negativeDrivers: string[];
  };
  unemployment: {
    indicator: EuroAreaLabourIndicator;
    freshness: "current" | "stale" | "unavailable";
    error: string | null;
  };
  employment: {
    indicator: EuroAreaLabourIndicator | null;
    freshness: "current" | "stale" | "unavailable";
    error: string | null;
  };
  jobVacancies: {
    indicator: EuroAreaLabourIndicator | null;
    freshness: "current" | "stale" | "unavailable";
    error: string | null;
  };
  wageGrowth: {
    indicator: EuroAreaLabourIndicator | null;
    freshness: "current" | "stale" | "unavailable";
    error: string | null;
  };
  sources: {
    dataMethod: string;
    freshnessThresholds: string;
  };
  explanations: string[];
};

const LABOUR_THRESHOLDS = {
  state: {
    veryStrong: 1.1,
    strong: 0.45,
    resilient: -0.2,
    cooling: -0.65,
    unemploymentRate: { veryLow: 5.5, low: 6.2, neutral: 7, elevated: 8 },
    jobVacancyRate: { strong: 2.5, positive: 2, neutral: 1.5, weak: 1 },
  },
  momentum: {
    strengthening: 0.75,
    improving: 0.25,
    stable: -0.15,
    deteriorating: -0.5,
  },
  wagePressure: {
    risingRapidly: 1.1,
    rising: 0.4,
    stable: -0.4,
    cooling: -1.1,
    qoqPercent: { veryLow: 0.3, low: 0.5, neutral: 0.7, high: 1 },
    yoyPercent: { veryLow: 1.5, low: 2.5, neutral: 3.5, high: 4.5 },
  },
} as const;

const LABOUR_WEIGHTS = {
  state: {
    unemploymentRate: 2,
    unemploymentDirection: 1,
    jobVacancyRate: 1.5,
    employmentGrowth: 1.5,
  },
  momentum: {
    unemploymentTrend: 1.5,
    jobVacancyTrend: 1.25,
    employmentTrend: 1,
  },
  wagePressure: {
    wageGrowthYoY: 1.5,
    wageGrowthQoQ: 0.75,
    wageGrowthTrend: 1,
  },
} as const;

type Signal = {
  score: number;
  weight: number;
  label: string;
};

function weightedScore(signals: Signal[]): number | null {
  const valid = signals.filter((s) => Number.isFinite(s.score) && s.weight > 0);
  const totalWeight = valid.reduce((sum, s) => sum + s.weight, 0);
  if (!totalWeight) return null;
  return valid.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight;
}

function thresholdScore(
  value: number | null,
  thresholds: readonly [number, number, number, number]
): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const [veryLow, low, neutral, high] = thresholds;
  return value < veryLow
    ? 2
    : value < low
      ? 1
      : value <= neutral
        ? 0
        : value <= high
          ? -1
          : -2;
}

function unemploymentScore(value: number | null): number | null {
  // Inverse: lower unemployment is better
  return thresholdScore(
    value,
    [
      LABOUR_THRESHOLDS.state.unemploymentRate.veryLow,
      LABOUR_THRESHOLDS.state.unemploymentRate.low,
      LABOUR_THRESHOLDS.state.unemploymentRate.neutral,
      LABOUR_THRESHOLDS.state.unemploymentRate.elevated,
    ]
  )
    ? -(
        thresholdScore(
          value,
          [
            LABOUR_THRESHOLDS.state.unemploymentRate.veryLow,
            LABOUR_THRESHOLDS.state.unemploymentRate.low,
            LABOUR_THRESHOLDS.state.unemploymentRate.neutral,
            LABOUR_THRESHOLDS.state.unemploymentRate.elevated,
          ]
        ) ?? 0
      )
    : null;
}

function trendScore(change: number | null): number | null {
  if (change === null || !Number.isFinite(change)) return null;
  if (change > 0.3) return 2;
  if (change > 0) return 1;
  if (change >= -0.3) return 0;
  if (change >= -0.6) return -1;
  return -2;
}

function buildIndicator(
  id: EurostatLabourSeriesId,
  series: EurostatLabourSeries | null,
  error: string | null
): EuroAreaLabourIndicator {
  if (!series) {
    return {
      id,
      label: "",
      dataset: "",
      source: "Eurostat",
      sourceUrl: "",
      geo: "EA21",
      unit: "",
      frequency: "M",
      freshness: "unavailable",
      status: "unavailable",
      latest: { value: null, date: null },
      previous: { value: null, date: null },
      previous3m: { value: null, date: null },
      previous6m: { value: null, date: null },
      latestChange: { value: null, date: null },
      threeMonthChange: { value: null, date: null },
      sixMonthChange: { value: null, date: null },
      direction3m: "unavailable",
      direction6m: "unavailable",
      historyCount: 0,
      lastUpdated: null,
      error,
    };
  }

  const obs = series.observations;
  const latest = obs[obs.length - 1];
  const previous = obs[obs.length - 2];
  const previous3m =
    series.frequency === "M"
      ? obs[obs.length - 4]
      : obs[obs.length - 3];
  const previous6m =
    series.frequency === "M"
      ? obs[obs.length - 7]
      : obs[obs.length - 6];

  const latestChange =
    latest && previous && previous.value !== null
      ? {
          value: latest.value - previous.value,
          date: latest.date,
        }
      : { value: null, date: null };

  const threeMonthChange =
    latest && previous3m && previous3m.value !== null
      ? {
          value: latest.value - previous3m.value,
          date: latest.date,
        }
      : { value: null, date: null };

  const sixMonthChange =
    latest && previous6m && previous6m.value !== null
      ? {
          value: latest.value - previous6m.value,
          date: latest.date,
        }
      : { value: null, date: null };

  const direction3m =
    threeMonthChange.value === null
      ? "unavailable"
      : threeMonthChange.value > 0
        ? "up"
        : threeMonthChange.value < 0
          ? "down"
          : "flat";

  const direction6m =
    sixMonthChange.value === null
      ? "unavailable"
      : sixMonthChange.value > 0
        ? "up"
        : sixMonthChange.value < 0
          ? "down"
          : "flat";

  return {
    id,
    label: series.label,
    dataset: series.dataset,
    source: "Eurostat",
    sourceUrl: series.sourceUrl,
    geo: "EA21",
    unit: series.unit,
    frequency: series.frequency,
    freshness: series.freshness,
    status: "available",
    latest: { value: latest?.value ?? null, date: latest?.date ?? null },
    previous: { value: previous?.value ?? null, date: previous?.date ?? null },
    previous3m: { value: previous3m?.value ?? null, date: previous3m?.date ?? null },
    previous6m: { value: previous6m?.value ?? null, date: previous6m?.date ?? null },
    latestChange,
    threeMonthChange,
    sixMonthChange,
    direction3m,
    direction6m,
    historyCount: obs.length,
    lastUpdated: series.lastUpdated,
    error: null,
  };
}

export function calculateEuroAreaLabourState({
  unemploymentSeries,
  employmentSeries,
  jobVacanciesSeries,
  wageGrowthSeries,
  errors = {},
}: {
  unemploymentSeries: EurostatLabourSeries | null;
  employmentSeries: EurostatLabourSeries | null;
  jobVacanciesSeries: EurostatLabourSeries | null;
  wageGrowthSeries: EurostatLabourSeries | null;
  errors?: Partial<Record<EurostatLabourSeriesId, string | null>>;
}): EuroAreaLabourState {
  const unemployment = buildIndicator("UNR", unemploymentSeries, errors.UNR ?? null);
  const employment = employmentSeries
    ? buildIndicator("EMP", employmentSeries, errors.EMP ?? null)
    : null;
  const jobVacancies = jobVacanciesSeries
    ? buildIndicator("JVR", jobVacanciesSeries, errors.JVR ?? null)
    : null;
  const wageGrowth = wageGrowthSeries
    ? buildIndicator("WAGE_GROWTH", wageGrowthSeries, errors.WAGE_GROWTH ?? null)
    : null;

  // Current Labour State signals
  const stateSignals: Array<Signal | null> = [
    unemployment.latest.value !== null
      ? {
          score: unemploymentScore(unemployment.latest.value) ?? 0,
          weight: LABOUR_WEIGHTS.state.unemploymentRate,
          label: "Unemployment rate",
        }
      : null,
    unemployment.latestChange.value !== null
      ? {
          score: -(trendScore(unemployment.latestChange.value) ?? 0), // Unemployment up = negative
          weight: LABOUR_WEIGHTS.state.unemploymentDirection,
          label: "Unemployment trend",
        }
      : null,
    jobVacancies && jobVacancies.latest.value !== null
      ? {
          score: thresholdScore(
            jobVacancies.latest.value,
            [
              LABOUR_THRESHOLDS.state.jobVacancyRate.strong,
              LABOUR_THRESHOLDS.state.jobVacancyRate.positive,
              LABOUR_THRESHOLDS.state.jobVacancyRate.neutral,
              LABOUR_THRESHOLDS.state.jobVacancyRate.weak,
            ]
          ) ?? 0,
          weight: LABOUR_WEIGHTS.state.jobVacancyRate,
          label: "Job vacancy rate",
        }
      : null,
    employment && employment.threeMonthChange.value !== null
      ? {
          score: trendScore(employment.threeMonthChange.value) ?? 0,
          weight: LABOUR_WEIGHTS.state.employmentGrowth,
          label: "Employment growth",
        }
      : null,
  ];

  const stateScore = weightedScore(
    stateSignals.filter((s): s is Signal => s !== null)
  );

  const currentLabourState: EuroLabourState =
    stateScore === null
      ? "UNAVAILABLE"
      : stateScore >= LABOUR_THRESHOLDS.state.veryStrong
        ? "VERY STRONG"
        : stateScore >= LABOUR_THRESHOLDS.state.strong
          ? "STRONG"
          : stateScore >= LABOUR_THRESHOLDS.state.resilient
            ? "RESILIENT"
            : stateScore >= LABOUR_THRESHOLDS.state.cooling
              ? "COOLING"
              : "WEAK";

  // Labour Momentum signals
  const momentumSignals: Array<Signal | null> = [
    unemployment.threeMonthChange.value !== null
      ? {
          score: -(trendScore(unemployment.threeMonthChange.value) ?? 0),
          weight: LABOUR_WEIGHTS.momentum.unemploymentTrend,
          label: "Unemployment trend",
        }
      : null,
    jobVacancies && jobVacancies.threeMonthChange.value !== null
      ? {
          score: trendScore(jobVacancies.threeMonthChange.value) ?? 0,
          weight: LABOUR_WEIGHTS.momentum.jobVacancyTrend,
          label: "Job vacancy trend",
        }
      : null,
    employment && employment.sixMonthChange.value !== null
      ? {
          score: trendScore(employment.sixMonthChange.value) ?? 0,
          weight: LABOUR_WEIGHTS.momentum.employmentTrend,
          label: "Employment momentum",
        }
      : null,
  ];

  const momentumScore = weightedScore(
    momentumSignals.filter((s): s is Signal => s !== null)
  );

  const labourMomentum: EuroLabourMomentum =
    momentumScore === null
      ? "UNAVAILABLE"
      : momentumScore >= LABOUR_THRESHOLDS.momentum.strengthening
        ? "STRENGTHENING"
        : momentumScore >= LABOUR_THRESHOLDS.momentum.improving
          ? "IMPROVING"
          : momentumScore >= LABOUR_THRESHOLDS.momentum.stable
            ? "STABLE"
            : momentumScore >= LABOUR_THRESHOLDS.momentum.deteriorating
              ? "COOLING"
              : "DETERIORATING";

  // Wage Pressure signals
  const wagePressureSignals: Array<Signal | null> = wageGrowth
    ? [
        wageGrowth.latest.value !== null
          ? {
              score: thresholdScore(
                wageGrowth.latest.value,
                [
                  LABOUR_THRESHOLDS.wagePressure.yoyPercent.veryLow,
                  LABOUR_THRESHOLDS.wagePressure.yoyPercent.low,
                  LABOUR_THRESHOLDS.wagePressure.yoyPercent.neutral,
                  LABOUR_THRESHOLDS.wagePressure.yoyPercent.high,
                ]
              ) ?? 0,
              weight: LABOUR_WEIGHTS.wagePressure.wageGrowthYoY,
              label: "Wage growth level",
            }
          : null,
        wageGrowth.latestChange.value !== null
          ? {
              score: trendScore(wageGrowth.latestChange.value) ?? 0,
              weight: LABOUR_WEIGHTS.wagePressure.wageGrowthTrend,
              label: "Wage growth trend",
            }
          : null,
      ]
    : [null];

  const wagePressureScore = weightedScore(
    wagePressureSignals.filter((s): s is Signal => s !== null)
  );

  const wagePressure: EuroWagePressure =
    wagePressureScore === null
      ? "UNAVAILABLE"
      : wagePressureScore >= LABOUR_THRESHOLDS.wagePressure.risingRapidly
        ? "RISING RAPIDLY"
        : wagePressureScore >= LABOUR_THRESHOLDS.wagePressure.rising
          ? "RISING"
          : wagePressureScore >= LABOUR_THRESHOLDS.wagePressure.stable
            ? "STABLE"
            : wagePressureScore >= LABOUR_THRESHOLDS.wagePressure.cooling
              ? "COOLING"
              : "RAPIDLY COOLING";

  // Determine drivers
  const positiveDrivers = stateSignals
    .filter((s): s is Signal => s !== null && s.score > 0)
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, 3)
    .map((s) => s.label);

  const negativeDrivers = stateSignals
    .filter((s): s is Signal => s !== null && s.score < 0)
    .sort((a, b) => a.score * a.weight - b.score * b.weight)
    .slice(0, 3)
    .map((s) => s.label);

  // Explanations
  const explanations: string[] = [];
  if (unemploymentSeries?.freshness === "stale") {
    explanations.push(
      `Unemployment rate is STALE; latest observation is ${unemployment.latest.date}`
    );
  }
  if (!unemploymentSeries) {
    explanations.push("Unemployment data unavailable.");
  }
  if (employment && employment.error) {
    explanations.push(`Employment data unavailable: ${employment.error}`);
  }
  if (jobVacancies && jobVacancies.error) {
    explanations.push(`Job vacancy data unavailable: ${jobVacancies.error}`);
  }
  if (wageGrowth && wageGrowth.error) {
    explanations.push(`Wage data unavailable: ${wageGrowth.error}`);
  }

  const status =
    unemployment && unemploymentSeries
      ? "available"
      : employment || jobVacancies || wageGrowth
        ? "partial"
        : "unavailable";

  return {
    status,
    area: "Euro area",
    assessment: {
      currentLabourState,
      labourMomentum,
      wagePressure,
      explanation: {
        currentLabourState: `Current labour state is ${currentLabourState}${
          stateScore !== null ? ` (score: ${stateScore.toFixed(2)})` : ""
        }.`,
        labourMomentum: `Labour momentum is ${labourMomentum}${
          momentumScore !== null ? ` (score: ${momentumScore.toFixed(2)})` : ""
        }.`,
        wagePressure: `Wage pressure is ${wagePressure}${
          wagePressureScore !== null ? ` (score: ${wagePressureScore.toFixed(2)})` : ""
        }.`,
      },
      positiveDrivers,
      negativeDrivers,
    },
    unemployment: {
      indicator: unemployment,
      freshness: unemployment.freshness,
      error: unemployment.error,
    },
    employment: {
      indicator: employment,
      freshness: employment?.freshness ?? "unavailable",
      error: employment?.error ?? null,
    },
    jobVacancies: {
      indicator: jobVacancies,
      freshness: jobVacancies?.freshness ?? "unavailable",
      error: jobVacancies?.error ?? null,
    },
    wageGrowth: {
      indicator: wageGrowth,
      freshness: wageGrowth?.freshness ?? "unavailable",
      error: wageGrowth?.error ?? null,
    },
    sources: {
      dataMethod:
        "Unemployment rate (monthly, Eurostat LFSA); Employment rate (quarterly, LFSA); Job vacancy rate (quarterly, JVST); Hourly wage growth (quarterly, EARN).",
      freshnessThresholds:
        "Monthly data considered current within 1 month, stale within 3 months; Quarterly data current within 2 months, stale within 6 months.",
    },
    explanations,
  };
}
