import type {
  EurostatHicpObservation,
  EurostatHicpSeries,
} from "@/lib/eurostat-hicp";

export const ECB_INFLATION_TARGET_PERCENT = 2;

export type EuroInflationLevel =
  | "VERY HIGH"
  | "ABOVE TARGET"
  | "MODERATELY ABOVE TARGET"
  | "NEAR TARGET"
  | "BELOW TARGET"
  | "UNAVAILABLE";

export type EuroInflationMomentum =
  | "HEATING RAPIDLY"
  | "HEATING"
  | "STABLE"
  | "COOLING"
  | "COOLING RAPIDLY"
  | "UNAVAILABLE";

type InflationMetric = { value: number | null; date: string | null };
type MonthlyInflation = {
  date: string;
  index: number | null;
  yoy: number | null;
  mom: number | null;
  annualized3m: number | null;
};

type EuroHicpSeriesResult = {
  dataset: string;
  seriesId: string;
  label: string;
  source: "Eurostat";
  sourceUrl: string | null;
  geo: string;
  unit: string;
  frequency: string;
  status: "available" | "insufficient history" | "unavailable";
  freshness: "current" | "stale" | "unavailable";
  error: string | null;
  lastUpdated: string | null;
  latestObservationDate: string | null;
  internalObservationCount: number;
  internalHistoryRequirementMet: boolean;
  latest: {
    index: InflationMetric;
    yoy: InflationMetric;
    mom: InflationMetric;
    annualized3m: InflationMetric;
  };
  momentum: {
    shortTerm: EuroInflationMomentum;
    mediumTerm: EuroInflationMomentum;
  };
  latestSixMonths: MonthlyInflation[];
  missingMonthsInLatestSix: string[];
  rawObservations: EurostatHicpObservation[];
};

export type { EuroHicpSeriesResult };

export type EuroAreaInflationState = {
  status: "available" | "partial" | "unavailable";
  area: "Euro area";
  target: {
    authority: "European Central Bank";
    value: 2;
    unit: "%";
    reference: "medium-term symmetric target";
  };
  current: {
    overall: EuroInflationLevel;
    headline: EuroInflationLevel;
    core: EuroInflationLevel;
    explanation: string;
  };
  momentum: {
    overall: EuroInflationMomentum;
    shortTerm: EuroInflationMomentum;
    mediumTerm: EuroInflationMomentum;
    headline: { shortTerm: EuroInflationMomentum; mediumTerm: EuroInflationMomentum };
    core: { shortTerm: EuroInflationMomentum; mediumTerm: EuroInflationMomentum };
    method: string;
  };
  source: {
    name: "Eurostat";
    dataset: "prc_hicp_minr";
    geo: "EA";
    unit: "I25";
    frequency: "M";
    historyFrom: string;
    freshnessMethod: string;
  };
  headline: EuroHicpSeriesResult;
  core: EuroHicpSeriesResult;
  explanations: string[];
};

const LEVEL_THRESHOLDS = {
  belowTargetMaximum: 1.5,
  nearTargetMaximum: 2.5,
  moderatelyAboveMaximum: 3.5,
  aboveTargetMaximum: 5,
} as const;

function round(value: number): number {
  return Number(value.toFixed(2));
}

function monthDistance(newer: string, older: string) {
  const [newYear, newMonth] = newer.split("-").map(Number);
  const [oldYear, oldMonth] = older.split("-").map(Number);
  if (![newYear, newMonth, oldYear, oldMonth].every(Number.isFinite)) return null;
  return (newYear! - oldYear!) * 12 + (newMonth! - oldMonth!);
}

function offsetMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, monthNumber! - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function levelFor(value: number | null): EuroInflationLevel {
  if (value === null || !Number.isFinite(value)) return "UNAVAILABLE";
  if (value <= LEVEL_THRESHOLDS.belowTargetMaximum) return "BELOW TARGET";
  if (value <= LEVEL_THRESHOLDS.nearTargetMaximum) return "NEAR TARGET";
  if (value <= LEVEL_THRESHOLDS.moderatelyAboveMaximum) return "MODERATELY ABOVE TARGET";
  if (value <= LEVEL_THRESHOLDS.aboveTargetMaximum) return "ABOVE TARGET";
  return "VERY HIGH";
}

function monthlyMap(observations: EurostatHicpObservation[]) {
  return new Map(observations.map((observation) => [observation.date, observation.index]));
}

function percentageChange(current: number | undefined, previous: number | undefined) {
  if (current === undefined || previous === undefined || previous === 0) return null;
  return round((current / previous - 1) * 100);
}

function annualizedThreeMonthChange(current: number | undefined, threeMonthsAgo: number | undefined) {
  if (current === undefined || threeMonthsAgo === undefined || threeMonthsAgo === 0) return null;
  return round((Math.pow(current / threeMonthsAgo, 4) - 1) * 100);
}

function monthlyInflationHistory(
  observations: EurostatHicpObservation[],
  months = 6
): MonthlyInflation[] {
  const byMonth = monthlyMap(observations);
  const latestMonth = observations.at(-1)?.date;
  if (!latestMonth) return [];
  const firstMonth = offsetMonth(latestMonth, -(months - 1));
  const history: MonthlyInflation[] = [];
  for (let offset = 0; offset < months; offset += 1) {
    const month = offsetMonth(firstMonth, offset);
    const index = byMonth.get(month);
    history.push({
      date: month,
      index: index === undefined ? null : round(index),
      yoy: percentageChange(index, byMonth.get(offsetMonth(month, -12))),
      mom: percentageChange(index, byMonth.get(offsetMonth(month, -1))),
      annualized3m: annualizedThreeMonthChange(index, byMonth.get(offsetMonth(month, -3))),
    });
  }
  return history;
}

function yoyForMonth(month: string, byMonth: Map<string, number>) {
  return percentageChange(byMonth.get(month), byMonth.get(offsetMonth(month, -12)));
}

function historicalOneMonthYoyChanges(
  observations: EurostatHicpObservation[],
  currentDate: string
) {
  const byMonth = monthlyMap(observations);
  const historyStart = offsetMonth(currentDate, -36);
  const changes: number[] = [];
  for (const observation of observations) {
    if (observation.date >= currentDate || observation.date < historyStart) continue;
    const priorYoy = yoyForMonth(offsetMonth(observation.date, -1), byMonth);
    const thisYoy = yoyForMonth(observation.date, byMonth);
    if (priorYoy !== null && thisYoy !== null) changes.push(thisYoy - priorYoy);
  }
  return changes;
}

function calibratedOneMonthMove(
  move: number | null,
  priorMoves: number[]
) {
  if (move === null) return null;
  if (priorMoves.length >= 18) {
    const below = priorMoves.filter((prior) => prior < move).length;
    const ties = priorMoves.filter((prior) => prior === move).length;
    const percentile = (below + ties / 2) / priorMoves.length;
    if (percentile <= 0.1) return -2;
    if (percentile <= 0.25) return -1;
    if (percentile >= 0.9) return 2;
    if (percentile >= 0.75) return 1;
    return 0;
  }
  const absolute = Math.abs(move);
  if (absolute < 0.1) return 0;
  return Math.sign(move) * (absolute >= 0.3 ? 2 : 1);
}

function signedBand(value: number | null, threshold: number) {
  if (value === null) return null;
  if (Math.abs(value) < threshold) return 0;
  return Math.sign(value) * (Math.abs(value) >= threshold * 2 ? 2 : 1);
}

function paceBand(value: number | null, target: number, band: number) {
  if (value === null) return null;
  return signedBand(value - target, band);
}

function classifyMomentum(score: number | null): EuroInflationMomentum {
  if (score === null) return "UNAVAILABLE";
  if (score >= 1.15) return "HEATING RAPIDLY";
  if (score >= 0.3) return "HEATING";
  if (score <= -1.15) return "COOLING RAPIDLY";
  if (score <= -0.3) return "COOLING";
  return "STABLE";
}

function scoreMomentum(
  observations: EurostatHicpObservation[],
  period: "shortTerm" | "mediumTerm"
) {
  const byMonth = monthlyMap(observations);
  const latestMonth = observations.at(-1)?.date;
  if (!latestMonth) return null;
  const currentYoy = yoyForMonth(latestMonth, byMonth);
  if (currentYoy === null) return null;
  const threeMonthAgoYoy = yoyForMonth(offsetMonth(latestMonth, -3), byMonth);
  const sixMonthAgoYoy = yoyForMonth(offsetMonth(latestMonth, -6), byMonth);
  const latestMoM = percentageChange(
    byMonth.get(latestMonth),
    byMonth.get(offsetMonth(latestMonth, -1))
  );
  const annualized3m = annualizedThreeMonthChange(
    byMonth.get(latestMonth),
    byMonth.get(offsetMonth(latestMonth, -3))
  );

  const signals: Array<{ value: number | null; weight: number }> =
    period === "shortTerm"
      ? [
          {
            value: calibratedOneMonthMove(
              (() => {
                const prior = yoyForMonth(offsetMonth(latestMonth, -1), byMonth);
                return prior === null ? null : currentYoy - prior;
              })(),
              historicalOneMonthYoyChanges(observations, latestMonth)
            ),
            weight: 0.5,
          },
          {
            value: threeMonthAgoYoy === null
              ? null
              : signedBand(currentYoy - threeMonthAgoYoy, 0.2),
            weight: 1,
          },
          { value: paceBand(latestMoM, Math.pow(1 + ECB_INFLATION_TARGET_PERCENT / 100, 1 / 12) * 100 - 100, 0.08), weight: 1.25 },
          { value: paceBand(annualized3m, ECB_INFLATION_TARGET_PERCENT, 0.6), weight: 1.5 },
        ]
      : [
          {
            value: threeMonthAgoYoy === null
              ? null
              : signedBand(currentYoy - threeMonthAgoYoy, 0.2),
            weight: 1.5,
          },
          {
            value: sixMonthAgoYoy === null
              ? null
              : signedBand(currentYoy - sixMonthAgoYoy, 0.35),
            weight: 1.5,
          },
        ];
  const available = signals.filter((signal) => signal.value !== null);
  if (available.length === 0) return null;
  const totalWeight = available.reduce((sum, signal) => sum + signal.weight, 0);
  return available.reduce((sum, signal) => sum + signal.value! * signal.weight, 0) / totalWeight;
}

function latestMetric(value: number | null, date: string | null): InflationMetric {
  return { value, date };
}

function buildSeriesResult(
  code: "TOTAL" | "TOT_X_NRG_FOOD",
  series: EurostatHicpSeries | null,
  failure: string | null,
  asOfDate: string
): EuroHicpSeriesResult {
  const observations = series?.observations ?? [];
  const latest = observations.at(-1);
  const byMonth = monthlyMap(observations);
  const latestDate = latest?.date ?? null;
  const currentMonth = latestDate?.slice(0, 7);
  const ageInMonths = currentMonth
    ? monthDistance(asOfDate.slice(0, 7), currentMonth)
    : null;
  const index = latest && currentMonth ? latest.index : undefined;
  const yoy = currentMonth ? percentageChange(index, byMonth.get(offsetMonth(currentMonth, -12))) : null;
  const mom = currentMonth ? percentageChange(index, byMonth.get(offsetMonth(currentMonth, -1))) : null;
  const annualized3m = currentMonth
    ? annualizedThreeMonthChange(index, byMonth.get(offsetMonth(currentMonth, -3)))
    : null;
  const history = monthlyInflationHistory(observations, 6);
  const missingMonthsInLatestSix = history
    .filter((month) => month.index === null)
    .map((month) => month.date);
  const sufficient = observations.length >= 24;
  const shortScore = sufficient ? scoreMomentum(observations, "shortTerm") : null;
  const mediumScore = sufficient ? scoreMomentum(observations, "mediumTerm") : null;

  return {
    dataset: series?.dataset ?? "prc_hicp_minr",
    seriesId: series?.code ?? code,
    label:
      series?.label ??
      (code === "TOTAL"
        ? "Headline HICP"
        : "Core HICP (excluding energy, food, alcohol and tobacco)"),
    source: "Eurostat",
    sourceUrl: series?.sourceUrl ?? null,
    geo: series?.geo ?? "EA",
    unit: series?.unit ?? "I25",
    frequency: series?.frequency ?? "M",
    status: failure
      ? "unavailable"
      : sufficient
        ? "available"
        : "insufficient history",
    freshness: !latestDate
      ? "unavailable"
      : ageInMonths !== null && ageInMonths >= 0 && ageInMonths < 2
        ? "current"
        : "stale",
    error: failure,
    lastUpdated: series?.lastUpdated ?? null,
    latestObservationDate: latestDate,
    internalObservationCount: observations.length,
    internalHistoryRequirementMet: sufficient,
    latest: {
      index: latestMetric(index === undefined ? null : round(index), latestDate),
      yoy: latestMetric(yoy, latestDate),
      mom: latestMetric(mom, latestDate),
      annualized3m: latestMetric(annualized3m, latestDate),
    },
    momentum: {
      shortTerm: classifyMomentum(shortScore),
      mediumTerm: classifyMomentum(mediumScore),
    },
    latestSixMonths: history,
    missingMonthsInLatestSix,
    rawObservations: observations,
  };
}

function overallMomentum(
  headline: EuroHicpSeriesResult,
  core: EuroHicpSeriesResult,
  period: "shortTerm" | "mediumTerm"
) {
  const values = [headline.momentum[period], core.momentum[period]].filter(
    (state) => state !== "UNAVAILABLE"
  );
  if (values.length !== 2) return "UNAVAILABLE" as const;
  const directional = values.reduce((score, state) => {
    if (state === "HEATING RAPIDLY") return score + 2;
    if (state === "HEATING") return score + 1;
    if (state === "COOLING") return score - 1;
    if (state === "COOLING RAPIDLY") return score - 2;
    return score;
  }, 0);
  return classifyMomentum(directional / values.length);
}

export function calculateEuroAreaInflationState({
  headlineSeries,
  coreSeries,
  headlineError = null,
  coreError = null,
  asOfDate = new Date().toISOString().slice(0, 10),
}: {
  headlineSeries: EurostatHicpSeries | null;
  coreSeries: EurostatHicpSeries | null;
  headlineError?: string | null;
  coreError?: string | null;
  asOfDate?: string;
}): EuroAreaInflationState {
  const headline = buildSeriesResult("TOTAL", headlineSeries, headlineError, asOfDate);
  const core = buildSeriesResult("TOT_X_NRG_FOOD", coreSeries, coreError, asOfDate);
  const headlineLevel = levelFor(headline.latest.yoy.value);
  const coreLevel = levelFor(core.latest.yoy.value);
  const overallLevel = headlineLevel;
  const shortTerm = overallMomentum(headline, core, "shortTerm");
  const mediumTerm = overallMomentum(headline, core, "mediumTerm");
  const overall =
    shortTerm === "UNAVAILABLE" || mediumTerm === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : classifyMomentum(
          (momentumValue(shortTerm) + momentumValue(mediumTerm)) / 2
        );
  const bothAvailable = headline.status === "available" && core.status === "available";
  const anyAvailable = headline.status === "available" || core.status === "available";
  const explanations: string[] = [];
  if (headlineError) explanations.push(`Headline HICP data unavailable: ${headlineError}`);
  if (coreError) explanations.push(`Core HICP data unavailable: ${coreError}`);
  if (!headline.internalHistoryRequirementMet && !headlineError) {
    explanations.push("Headline HICP has fewer than 24 monthly observations.");
  }
  if (!core.internalHistoryRequirementMet && !coreError) {
    explanations.push("Core HICP has fewer than 24 monthly observations.");
  }
  if (headline.missingMonthsInLatestSix.length > 0) {
    explanations.push(`Headline HICP is missing latest-six-month observations: ${headline.missingMonthsInLatestSix.join(", ")}.`);
  }
  if (core.missingMonthsInLatestSix.length > 0) {
    explanations.push(`Core HICP is missing latest-six-month observations: ${core.missingMonthsInLatestSix.join(", ")}.`);
  }
  if (headline.freshness === "stale") {
    explanations.push(`Headline HICP is STALE DATA; its latest observation is ${headline.latestObservationDate}.`);
  }
  if (core.freshness === "stale") {
    explanations.push(`Core HICP is STALE DATA; its latest observation is ${core.latestObservationDate}.`);
  }
  if (headline.status === "available") {
    explanations.unshift(
      `Overall inflation state follows headline HICP, the ECB ${ECB_INFLATION_TARGET_PERCENT}% medium-term symmetric target measure; core HICP is reported separately as an underlying inflation measure.`
    );
  } else if (anyAvailable) {
    explanations.unshift("Overall inflation state is unavailable because headline HICP, the ECB target measure, is unavailable; available core HICP is reported separately.");
  } else {
    explanations.unshift("Euro Area inflation state is unavailable because the required Eurostat HICP observations are missing.");
  }

  return {
    status: bothAvailable ? "available" : anyAvailable ? "partial" : "unavailable",
    area: "Euro area",
    target: {
      authority: "European Central Bank",
      value: ECB_INFLATION_TARGET_PERCENT,
      unit: "%",
      reference: "medium-term symmetric target",
    },
    current: {
      overall: overallLevel,
      headline: headlineLevel,
      core: coreLevel,
      explanation: headline.status === "available"
        ? `Headline HICP is ${headlineLevel.toLowerCase()} versus the ECB 2% target; core HICP is ${coreLevel.toLowerCase()} and shown separately.`
        : "Overall inflation state follows headline HICP, which is currently unavailable.",
    },
    momentum: {
      overall,
      shortTerm,
      mediumTerm,
      headline: {
        shortTerm: headline.momentum.shortTerm,
        mediumTerm: headline.momentum.mediumTerm,
      },
      core: {
        shortTerm: core.momentum.shortTerm,
        mediumTerm: core.momentum.mediumTerm,
      },
      method:
        "Short term combines historical-percentile-calibrated 1-month YoY change, 3-month YoY change, latest monthly pace and 3-month annualized pace versus 2%; medium term combines 3- and 6-month YoY changes. Monthly historical calibration excludes the latest move (no look-ahead). Overall momentum requires both headline and core classifications.",
    },
    source: {
      name: "Eurostat",
      dataset: "prc_hicp_minr",
      geo: "EA",
      unit: "I25",
      frequency: "M",
      historyFrom: "2020-01",
      freshnessMethod:
        "An observation is marked STALE DATA when it is two or more calendar months older than the current month; no values are extrapolated or substituted.",
    },
    headline,
    core,
    explanations,
  };
}

function momentumValue(state: EuroInflationMomentum) {
  if (state === "HEATING RAPIDLY") return 2;
  if (state === "HEATING") return 1;
  if (state === "COOLING RAPIDLY") return -2;
  if (state === "COOLING") return -1;
  return 0;
}
