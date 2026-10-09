import {
  buildDatedChanges,
  buildDatedDifferences,
  buildRollingAverageSeries,
  calibrateHistoricalMove,
  type DatedChange,
  type DatedObservation,
} from "@/lib/labour-history-calibration";

export type LabourMetric = { value: number | null; date: string | null };

export type LabourStateInput = {
  unemploymentRate: {
    latest: LabourMetric;
    previousMonth: LabourMetric;
  };
  nonfarmPayrollEmployment: {
    latestMonthlyChange: LabourMetric;
    previousMonthlyChange: LabourMetric;
    averageMonthlyChange3m: LabourMetric;
    averageMonthlyChange6m: LabourMetric;
  };
  initialJoblessClaims: {
    latest: LabourMetric;
    previousWeek: LabourMetric;
    average4Week: LabourMetric;
  };
  joltsJobOpenings: {
    latest: LabourMetric;
    previousMonth: LabourMetric;
    threeMonthsAgo: LabourMetric;
    sixMonthsAgo: LabourMetric;
  };
  averageHourlyEarnings: {
    latestMoM: LabourMetric;
    previousMoM: LabourMetric;
    latestYoY: LabourMetric;
    annualized3m: LabourMetric;
  };
  historicalObservations?: {
    unemploymentRate: DatedObservation[];
    payrollEmployment: DatedObservation[];
    initialJoblessClaims: DatedObservation[];
    jobOpenings: DatedObservation[];
    hourlyEarnings: DatedObservation[];
  };
};

export type LabourAssessment = {
  state: "VERY STRONG" | "STRONG" | "RESILIENT" | "COOLING" | "WEAK" | "UNAVAILABLE";
  momentum:
    | "STRENGTHENING"
    | "IMPROVING"
    | "STABLE"
    | "COOLING"
    | "DETERIORATING"
    | "UNAVAILABLE";
  momentumArrow: "↑↑" | "↑" | "→" | "↓" | "↓↓" | "";
  wagePressure:
    | "RISING"
    | "FIRM"
    | "STABLE"
    | "COOLING"
    | "RAPIDLY COOLING"
    | "UNAVAILABLE";
  wagePressureArrow: "↑↑" | "↑" | "→" | "↓" | "↓↓" | "";
  strongestPositiveDriver: string | null;
  strongestNegativeDriver: string | null;
  positiveDrivers: string[];
  negativeDrivers: string[];
  explanations: {
    state: string;
    momentum: string;
    wagePressure: string;
  };
};

export const LABOUR_ENGINE_THRESHOLDS = {
  state: {
    veryStrong: 1.15,
    strong: 0.55,
    resilient: -0.1,
    cooling: -0.65,
    unemploymentRate: { veryLow: 3.5, low: 4.2, neutral: 4.8, elevated: 5.5 },
    unemploymentChange: { strongMove: 0.2, moderateMove: 0.1 },
    payrollThousands: {
      latest: { strong: 175, positive: 100, weak: 50 },
      average3m: { strong: 200, positive: 125, weak: 75 },
      average6m: { strong: 180, positive: 125, weak: 75 },
    },
    claims: {
      low: 220_000,
      moderate: 250_000,
      elevated: 300_000,
      high: 350_000,
    },
    jobOpeningsThousands: { strong: 8000, positive: 7000, neutral: 6000, weak: 5000 },
    minimumAvailableIndicatorGroups: 2,
  },
  momentum: {
    strengthening: 0.75,
    improving: 0.25,
    stable: -0.15,
    deteriorating: -0.5,
    unemploymentChangePoints: { strong: 0.2, moderate: 0.1 },
    fallbackMagnitude: {
      unemploymentRate: { moderate: 0.1, strong: 0.2 },
      payrollMomentum: { moderate: 20, strong: 75 },
      payrollVs3m: { moderate: 50, strong: 100 },
      payroll3mVs6m: { moderate: 35, strong: 70 },
      weeklyClaims: { moderate: 25_000, strong: 50_000 },
      claimsVsFourWeek: { moderate: 25_000, strong: 50_000 },
      jobOpeningsMonth: { moderate: 250, strong: 500 },
      jobOpenings3m: { moderate: 500, strong: 1_000 },
      jobOpenings6m: { moderate: 750, strong: 1_500 },
      wageYoYChange: { moderate: 0.1, strong: 0.25 },
      wageMoMChange: { moderate: 0.1, strong: 0.2 },
      wageAnnualized3mChange: { moderate: 0.5, strong: 1 },
    },
  },
  wagePressure: {
    rising: 1.1,
    firm: 0.35,
    stable: -0.35,
    rapidlyCooling: -1.1,
    yoyPercent: { veryLow: 2, low: 3, neutral: 4, high: 5 },
    momPercent: { low: 0.15, neutral: 0.25, high: 0.35 },
    annualized3mPercent: { veryLow: 1.5, low: 2.5, neutral: 3.5, high: 4.5 },
  },
} as const;

export const LABOUR_ENGINE_WEIGHTS = {
  state: {
    unemploymentRate: 1.75,
    unemploymentRateDirection: 0.75,
    latestJobsAdded: 1,
    averageJobsAdded3m: 1.5,
    averageJobsAdded6m: 1.25,
    fourWeekClaims: 1.5,
    jobOpenings: 1,
  },
  momentum: {
    unemploymentRate: 1.25,
    latestJobsAddedChange: 4.5,
    latestJobsAddedVs3mAverage: 0.75,
    threeMonthVsSixMonthJobsAverage: 3.5,
    weeklyClaimsChange: 1,
    claimsVsFourWeekAverage: 0.75,
    jobOpeningsMonth: 1,
    jobOpenings3m: 1.25,
    jobOpenings6m: 0.75,
  },
  wagePressure: {
    yearOverYear: 1.5,
    monthOverMonth: 0.75,
    annualized3m: 1.5,
    monthOverMonthChange: 0.5,
    yearOverYearChange: 0.75,
    annualized3mChange: 0.75,
  },
} as const;

type Signal = {
  score: number;
  weight: number;
  positiveLabel: string;
  negativeLabel: string;
};

function weightedScore(signals: Signal[]) {
  const valid = signals.filter(
    (signal) => Number.isFinite(signal.score) && signal.weight > 0
  );
  const totalWeight = valid.reduce((sum, signal) => sum + signal.weight, 0);
  if (!totalWeight) return null;
  return valid.reduce((sum, signal) => sum + signal.score * signal.weight, 0) / totalWeight;
}

function signal(
  value: number | null,
  weight: number,
  positiveLabel: string,
  negativeLabel: string
): Signal | null {
  return value === null || !Number.isFinite(value)
    ? null
    : { score: value, weight, positiveLabel, negativeLabel };
}

function toSignals(signals: Array<Signal | null>) {
  return signals.filter((item): item is Signal => item !== null);
}

function thresholdScore(
  value: number | null,
  cutoffs: readonly [number, number, number, number],
  inverse = false
) {
  if (value === null || !Number.isFinite(value)) return null;
  const [veryLow, low, neutral, high] = cutoffs;
  const score =
    value < veryLow
      ? 2
      : value < low
        ? 1
        : value <= neutral
          ? 0
          : value <= high
            ? -1
            : -2;
  return inverse ? -score : score;
}

function payrollLevelScore(
  value: number | null,
  cutoffs: { strong: number; positive: number; weak: number }
) {
  if (value === null || !Number.isFinite(value)) return null;
  return value <= 0 ? -2 : value < cutoffs.weak ? -1 : value < cutoffs.positive ? 0 : value < cutoffs.strong ? 1 : 2;
}

function claimsLevelScore(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  const cutoffs = LABOUR_ENGINE_THRESHOLDS.state.claims;
  return value <= cutoffs.low
    ? 2
    : value <= cutoffs.moderate
      ? 1
      : value <= cutoffs.elevated
        ? 0
        : value <= cutoffs.high
          ? -1
          : -2;
}

function jobOpeningsLevelScore(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  const cutoffs = LABOUR_ENGINE_THRESHOLDS.state.jobOpeningsThousands;
  return value >= cutoffs.strong
    ? 2
    : value >= cutoffs.positive
      ? 1
      : value >= cutoffs.neutral
        ? 0
        : value >= cutoffs.weak
          ? -1
          : -2;
}

function deltaScore(
  current: number | null,
  previous: number | null,
  moderate: number,
  strong: number
) {
  if (current === null || previous === null) return null;
  const difference = current - previous;
  if (difference >= strong) return 2;
  if (difference >= moderate) return 1;
  if (difference <= -strong) return -2;
  if (difference <= -moderate) return -1;
  return 0;
}

function unemploymentMomentum(current: number | null, previous: number | null) {
  const thresholds = LABOUR_ENGINE_THRESHOLDS.momentum.unemploymentChangePoints;
  const score = deltaScore(current, previous, thresholds.moderate, thresholds.strong);
  return score === null ? null : -score;
}

function wageRateScore(
  value: number | null,
  cutoffs: { veryLow: number; low: number; neutral: number; high: number }
) {
  return thresholdScore(
    value,
    [cutoffs.veryLow, cutoffs.low, cutoffs.neutral, cutoffs.high],
    true
  );
}

function wageMomScore(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  const cutoffs = LABOUR_ENGINE_THRESHOLDS.wagePressure.momPercent;
  return value < 0 ? -2 : value < cutoffs.low ? -1 : value < cutoffs.neutral ? 0 : value < cutoffs.high ? 1 : 2;
}

function getDrivers(signals: Signal[]) {
  const contributions = signals
    .filter((item) => item.score !== 0)
    .map((item) => ({
      impact: item.score * item.weight,
      label: item.score > 0 ? item.positiveLabel : item.negativeLabel,
    }));
  const positive = contributions
    .filter((item) => item.impact > 0)
    .sort((left, right) => right.impact - left.impact);
  const negative = contributions
    .filter((item) => item.impact < 0)
    .sort((left, right) => left.impact - right.impact);
  return {
    positive: [...new Set(positive.map((item) => item.label))].slice(0, 4),
    negative: [...new Set(negative.map((item) => item.label))].slice(0, 4),
    strongestPositive: positive[0]?.label ?? null,
    strongestNegative: negative[0]?.label ?? null,
  };
}

function classifyFiveWay(
  score: number | null,
  thresholds: { first: number; second: number; third: number; fourth: number },
  labels: readonly [string, string, string, string, string]
) {
  if (score === null) return "UNAVAILABLE";
  return score >= thresholds.first
    ? labels[0]
    : score >= thresholds.second
      ? labels[1]
      : score >= thresholds.third
        ? labels[2]
        : score >= thresholds.fourth
          ? labels[3]
          : labels[4];
}

function changeAtDate(
  changesNewestFirst: DatedChange[],
  date: string | null
) {
  return date ? changesNewestFirst.find((change) => change.date === date)?.value ?? null : null;
}

function differenceSeries(
  left: DatedObservation[],
  right: DatedObservation[]
): DatedChange[] {
  const rightByDate = new Map(right.map((item) => [item.date, item.value]));
  return left.flatMap((item) => {
    const comparison = rightByDate.get(item.date);
    return comparison === undefined
      ? []
      : [{ date: item.date, value: item.value - comparison }];
  });
}

function wageRateSeries(
  observationsNewestFirst: DatedObservation[],
  periods: 1 | 3 | 12,
  annualized = false
): DatedObservation[] {
  const series: DatedObservation[] = [];
  for (let index = 0; index + periods < observationsNewestFirst.length; index++) {
    const current = observationsNewestFirst[index];
    const base = observationsNewestFirst[index + periods];
    if (!current || !base || base.value === 0) continue;

    let contiguous = true;
    for (let offset = 0; offset < periods; offset++) {
      const newer = observationsNewestFirst[index + offset];
      const older = observationsNewestFirst[index + offset + 1];
      if (!newer || !older) {
        contiguous = false;
        break;
      }
      const newerDate = new Date(`${newer.date}T00:00:00Z`);
      const olderDate = new Date(`${older.date}T00:00:00Z`);
      const monthDistance =
        newerDate.getUTCFullYear() * 12 +
        newerDate.getUTCMonth() -
        (olderDate.getUTCFullYear() * 12 + olderDate.getUTCMonth());
      if (!Number.isFinite(monthDistance) || monthDistance !== 1) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) continue;

    const ratio = current.value / base.value;
    const rate = annualized ? (ratio ** (12 / periods) - 1) * 100 : (ratio - 1) * 100;
    if (Number.isFinite(rate)) {
      series.push({
        date: current.date,
        value: Number(rate.toFixed(4)),
      });
    }
  }
  return series;
}

function historicalWageRateChanges(
  observationsNewestFirst: DatedObservation[],
  periods: 1 | 3 | 12,
  annualized = false
) {
  return buildDatedChanges(
    wageRateSeries(observationsNewestFirst, periods, annualized),
    "monthly"
  );
}

function calibratedMomentumSignal(
  latestMove: number | null,
  date: string | null,
  historicalChanges: DatedChange[],
  cadence: "monthly" | "weekly",
  fallbackThresholds: { moderate: number; strong: number },
  weight: number,
  positiveLabel: string,
  negativeLabel: string,
  macroSignalMultiplier: 1 | -1 = 1
): Signal | null {
  const result = calibrateHistoricalMove({
    latestMove,
    latestDate: date,
    historicalChangesNewestFirst: historicalChanges,
    cadence,
    fallbackThresholds,
    macroSignalMultiplier,
  });
  return signal(result.score, weight, positiveLabel, negativeLabel);
}

export function calculateLabourState(input: LabourStateInput): LabourAssessment {
  const { state: stateThresholds, momentum: momentumThresholds, wagePressure } =
    LABOUR_ENGINE_THRESHOLDS;
  const weights = LABOUR_ENGINE_WEIGHTS;
  const unemployment = input.unemploymentRate.latest.value;
  const previousUnemployment = input.unemploymentRate.previousMonth.value;
  const latestPayroll = input.nonfarmPayrollEmployment.latestMonthlyChange.value;
  const previousPayroll = input.nonfarmPayrollEmployment.previousMonthlyChange.value;
  const averagePayroll3m = input.nonfarmPayrollEmployment.averageMonthlyChange3m.value;
  const averagePayroll6m = input.nonfarmPayrollEmployment.averageMonthlyChange6m.value;
  const claims = input.initialJoblessClaims.average4Week.value;
  const latestClaims = input.initialJoblessClaims.latest.value;
  const previousClaims = input.initialJoblessClaims.previousWeek.value;
  const openings = input.joltsJobOpenings.latest.value;
  const previousOpenings = input.joltsJobOpenings.previousMonth.value;
  const openings3m = input.joltsJobOpenings.threeMonthsAgo.value;
  const openings6m = input.joltsJobOpenings.sixMonthsAgo.value;
  const history = input.historicalObservations;
  const unemploymentChanges = buildDatedChanges(
    history?.unemploymentRate ?? [],
    "monthly"
  );
  const payrollChanges = buildDatedChanges(
    history?.payrollEmployment ?? [],
    "monthly"
  );
  const payrollMomentumChanges = buildDatedChanges(payrollChanges, "monthly");
  const payrollAverage3mSeries = buildRollingAverageSeries(
    payrollChanges,
    3,
    "monthly"
  );
  const payrollAverage6mSeries = buildRollingAverageSeries(
    payrollChanges,
    6,
    "monthly"
  );
  const payrollVsAverage3mHistory = differenceSeries(
    payrollChanges,
    payrollAverage3mSeries
  );
  const payrollAverageTrendHistory = differenceSeries(
    payrollAverage3mSeries,
    payrollAverage6mSeries
  );
  const claimsChanges = buildDatedChanges(
    history?.initialJoblessClaims ?? [],
    "weekly"
  );
  const claimsAverage4wSeries = buildRollingAverageSeries(
    history?.initialJoblessClaims ?? [],
    4,
    "weekly"
  );
  const claimsVsAverageHistory = differenceSeries(
    history?.initialJoblessClaims ?? [],
    claimsAverage4wSeries
  );
  const openingsChanges = buildDatedChanges(
    history?.jobOpenings ?? [],
    "monthly"
  );
  const openings3mChanges = buildDatedDifferences(
    history?.jobOpenings ?? [],
    3,
    "monthly"
  );
  const openings6mChanges = buildDatedDifferences(
    history?.jobOpenings ?? [],
    6,
    "monthly"
  );
  const wageYoYChanges = historicalWageRateChanges(
    history?.hourlyEarnings ?? [],
    12
  );
  const wageMoMChanges = historicalWageRateChanges(
    history?.hourlyEarnings ?? [],
    1
  );
  const wageAnnualized3mChanges = historicalWageRateChanges(
    history?.hourlyEarnings ?? [],
    3,
    true
  );

  const stateSignals = toSignals([
    signal(
      thresholdScore(
        unemployment,
        [
          stateThresholds.unemploymentRate.veryLow,
          stateThresholds.unemploymentRate.low,
          stateThresholds.unemploymentRate.neutral,
          stateThresholds.unemploymentRate.elevated,
        ]
      ),
      weights.state.unemploymentRate,
      "Low unemployment",
      "Elevated unemployment"
    ),
    signal(
      unemploymentMomentum(unemployment, previousUnemployment),
      weights.state.unemploymentRateDirection,
      "Unemployment rate falling (labour strengthening)",
      "Unemployment rate rising (labour weakening)"
    ),
    signal(
      payrollLevelScore(latestPayroll, stateThresholds.payrollThousands.latest),
      weights.state.latestJobsAdded,
      "Strong monthly job gains",
      "Weak monthly job gains"
    ),
    signal(
      payrollLevelScore(averagePayroll3m, stateThresholds.payrollThousands.average3m),
      weights.state.averageJobsAdded3m,
      "Strong 3-month hiring",
      "Weak 3-month hiring"
    ),
    signal(
      payrollLevelScore(averagePayroll6m, stateThresholds.payrollThousands.average6m),
      weights.state.averageJobsAdded6m,
      "Strong 6-month hiring",
      "Weak 6-month hiring"
    ),
    signal(
      claimsLevelScore(claims),
      weights.state.fourWeekClaims,
      "Low 4-week jobless claims",
      "Elevated 4-week jobless claims"
    ),
    signal(
      jobOpeningsLevelScore(openings),
      weights.state.jobOpenings,
      "High job openings",
      "Low job openings"
    ),
  ]);
  const availableStateIndicatorGroups = [
    unemployment !== null,
    latestPayroll !== null ||
      averagePayroll3m !== null ||
      averagePayroll6m !== null,
    claims !== null,
    openings !== null,
  ].filter(Boolean).length;
  const stateScore =
    availableStateIndicatorGroups <
    stateThresholds.minimumAvailableIndicatorGroups
      ? null
      : weightedScore(stateSignals);
  const state = classifyFiveWay(
    stateScore,
    {
      first: stateThresholds.veryStrong,
      second: stateThresholds.strong,
      third: stateThresholds.resilient,
      fourth: stateThresholds.cooling,
    },
    ["VERY STRONG", "STRONG", "RESILIENT", "COOLING", "WEAK"]
  ) as LabourAssessment["state"];

  const latestPayrollMomentum =
    latestPayroll !== null && previousPayroll !== null
      ? latestPayroll - previousPayroll
      : null;
  const latestPayrollVs3m =
    latestPayroll !== null && averagePayroll3m !== null
      ? latestPayroll - averagePayroll3m
      : null;
  const latestPayrollTrend =
    averagePayroll3m !== null && averagePayroll6m !== null
      ? averagePayroll3m - averagePayroll6m
      : null;
  const latestClaimsMove =
    latestClaims !== null && previousClaims !== null
      ? latestClaims - previousClaims
      : null;
  const latestClaimsVsAverage =
    latestClaims !== null && claims !== null ? latestClaims - claims : null;
  const latestOpeningsMonth =
    openings !== null && previousOpenings !== null
      ? openings - previousOpenings
      : null;
  const latestOpenings3m =
    openings !== null && openings3m !== null ? openings - openings3m : null;
  const latestOpenings6m =
    openings !== null && openings6m !== null ? openings - openings6m : null;
  const payrollDate = input.nonfarmPayrollEmployment.latestMonthlyChange.date;
  const unemploymentDate = input.unemploymentRate.latest.date;
  const claimsDate = input.initialJoblessClaims.latest.date;
  const openingsDate = input.joltsJobOpenings.latest.date;
  const momentumSignals = toSignals([
    calibratedMomentumSignal(
      unemployment !== null && previousUnemployment !== null
        ? unemployment - previousUnemployment
        : null,
      unemploymentDate,
      unemploymentChanges,
      "monthly",
      momentumThresholds.fallbackMagnitude.unemploymentRate,
      weights.momentum.unemploymentRate,
      "Unemployment rate falling (labour strengthening)",
      "Unemployment rate rising (labour weakening)",
      -1
    ),
    calibratedMomentumSignal(
      latestPayrollMomentum,
      payrollDate,
      payrollMomentumChanges,
      "monthly",
      momentumThresholds.fallbackMagnitude.payrollMomentum,
      weights.momentum.latestJobsAddedChange,
      "Jobs added accelerating",
      "Jobs added slowing"
    ),
    calibratedMomentumSignal(
      latestPayrollVs3m,
      payrollDate,
      payrollVsAverage3mHistory,
      "monthly",
      momentumThresholds.fallbackMagnitude.payrollVs3m,
      weights.momentum.latestJobsAddedVs3mAverage,
      "Monthly hiring above 3-month average",
      "Monthly hiring below 3-month average"
    ),
    calibratedMomentumSignal(
      latestPayrollTrend,
      payrollDate,
      payrollAverageTrendHistory,
      "monthly",
      momentumThresholds.fallbackMagnitude.payroll3mVs6m,
      weights.momentum.threeMonthVsSixMonthJobsAverage,
      "3-month hiring trend improving",
      "3-month hiring trend weakening"
    ),
    calibratedMomentumSignal(
      latestClaimsMove,
      claimsDate,
      claimsChanges,
      "weekly",
      momentumThresholds.fallbackMagnitude.weeklyClaims,
      weights.momentum.weeklyClaimsChange,
      "Weekly jobless claims falling (labour strengthening)",
      "Weekly jobless claims rising (labour weakening)",
      -1
    ),
    calibratedMomentumSignal(
      latestClaimsVsAverage,
      claimsDate,
      claimsVsAverageHistory,
      "weekly",
      momentumThresholds.fallbackMagnitude.claimsVsFourWeek,
      weights.momentum.claimsVsFourWeekAverage,
      "Weekly claims below 4-week average",
      "Weekly claims above 4-week average",
      -1
    ),
    calibratedMomentumSignal(
      latestOpeningsMonth,
      openingsDate,
      openingsChanges,
      "monthly",
      momentumThresholds.fallbackMagnitude.jobOpeningsMonth,
      weights.momentum.jobOpeningsMonth,
      "Job openings rising",
      "Job openings falling"
    ),
    calibratedMomentumSignal(
      latestOpenings3m,
      openingsDate,
      openings3mChanges,
      "monthly",
      momentumThresholds.fallbackMagnitude.jobOpenings3m,
      weights.momentum.jobOpenings3m,
      "Job openings above 3-month level",
      "Job openings below 3-month level"
    ),
    calibratedMomentumSignal(
      latestOpenings6m,
      openingsDate,
      openings6mChanges,
      "monthly",
      momentumThresholds.fallbackMagnitude.jobOpenings6m,
      weights.momentum.jobOpenings6m,
      "Job openings above 6-month level",
      "Job openings below 6-month level"
    ),
  ]);
  const momentumScore = weightedScore(momentumSignals);
  const momentum = classifyFiveWay(
    momentumScore,
    {
      first: momentumThresholds.strengthening,
      second: momentumThresholds.improving,
      third: momentumThresholds.stable,
      fourth: momentumThresholds.deteriorating,
    },
    ["STRENGTHENING", "IMPROVING", "STABLE", "COOLING", "DETERIORATING"]
  ) as LabourAssessment["momentum"];
  const momentumArrows: Record<LabourAssessment["momentum"], LabourAssessment["momentumArrow"]> = {
    STRENGTHENING: "↑↑",
    IMPROVING: "↑",
    STABLE: "→",
    COOLING: "↓",
    DETERIORATING: "↓↓",
    UNAVAILABLE: "",
  };

  const yearOverYearWage = input.averageHourlyEarnings.latestYoY.value;
  const monthOverMonthWage = input.averageHourlyEarnings.latestMoM.value;
  const previousMonthOverMonthWage = input.averageHourlyEarnings.previousMoM.value;
  const annualized3mWage = input.averageHourlyEarnings.annualized3m.value;
  const latestWageYoYChange = changeAtDate(
    wageYoYChanges,
    input.averageHourlyEarnings.latestYoY.date
  );
  const latestWageMoMChange =
    monthOverMonthWage !== null && previousMonthOverMonthWage !== null
      ? monthOverMonthWage - previousMonthOverMonthWage
      : null;
  const latestWageAnnualized3mChange = changeAtDate(
    wageAnnualized3mChanges,
    input.averageHourlyEarnings.annualized3m.date
  );
  const wageSignals = toSignals([
    signal(
      wageRateScore(yearOverYearWage, wagePressure.yoyPercent),
      weights.wagePressure.yearOverYear,
      "Wage growth elevated year over year",
      "Wage growth subdued year over year"
    ),
    signal(
      wageMomScore(monthOverMonthWage),
      weights.wagePressure.monthOverMonth,
      "Monthly wage growth firm",
      "Monthly wage growth soft"
    ),
    signal(
      wageRateScore(annualized3mWage, wagePressure.annualized3mPercent),
      weights.wagePressure.annualized3m,
      "3-month annualized wage growth elevated",
      "3-month annualized wage growth subdued"
    ),
    calibratedMomentumSignal(
      latestWageYoYChange,
      input.averageHourlyEarnings.latestYoY.date,
      wageYoYChanges,
      "monthly",
      momentumThresholds.fallbackMagnitude.wageYoYChange,
      weights.wagePressure.yearOverYearChange,
      "Wage growth accelerating year over year",
      "Wage growth decelerating year over year"
    ),
    calibratedMomentumSignal(
      latestWageMoMChange,
      input.averageHourlyEarnings.latestMoM.date,
      wageMoMChanges,
      "monthly",
      momentumThresholds.fallbackMagnitude.wageMoMChange,
      weights.wagePressure.monthOverMonthChange,
      "Monthly wage growth accelerating",
      "Monthly wage growth decelerating"
    ),
    calibratedMomentumSignal(
      latestWageAnnualized3mChange,
      input.averageHourlyEarnings.annualized3m.date,
      wageAnnualized3mChanges,
      "monthly",
      momentumThresholds.fallbackMagnitude.wageAnnualized3mChange,
      weights.wagePressure.annualized3mChange,
      "3-month annualized wage pressure rising",
      "3-month annualized wage pressure easing"
    ),
  ]);
  const wageScore = weightedScore(wageSignals);
  const wage = classifyFiveWay(
    wageScore,
    {
      first: wagePressure.rising,
      second: wagePressure.firm,
      third: wagePressure.stable,
      fourth: wagePressure.rapidlyCooling,
    },
    ["RISING", "FIRM", "STABLE", "COOLING", "RAPIDLY COOLING"]
  ) as LabourAssessment["wagePressure"];
  const wageArrows: Record<LabourAssessment["wagePressure"], LabourAssessment["wagePressureArrow"]> = {
    RISING: "↑↑",
    FIRM: "↑",
    STABLE: "→",
    COOLING: "↓",
    "RAPIDLY COOLING": "↓↓",
    UNAVAILABLE: "",
  };

  const drivers = getDrivers([...stateSignals, ...momentumSignals]);
  const stateExplanation =
    state === "UNAVAILABLE"
      ? "Current labour state is unavailable because too few core indicators have observations."
      : `${state} reflects a weighted balance of unemployment, hiring, jobless claims, and job openings.`;
  const momentumExplanation =
    momentum === "UNAVAILABLE"
      ? "Labour momentum is unavailable because no comparable current and prior observations are available."
      : `${momentum} reflects current-versus-prior changes and medium-term hiring, claims, and openings trends.`;
  const wageExplanation =
    wage === "UNAVAILABLE"
      ? "Wage pressure is unavailable because wage growth observations are missing."
      : `${wage} describes wage pressure only; it is not counted as labour-market strength.`;

  return {
    state,
    momentum,
    momentumArrow: momentumArrows[momentum],
    wagePressure: wage,
    wagePressureArrow: wageArrows[wage],
    strongestPositiveDriver: drivers.strongestPositive,
    strongestNegativeDriver: drivers.strongestNegative,
    positiveDrivers: drivers.positive,
    negativeDrivers: drivers.negative,
    explanations: {
      state: stateExplanation,
      momentum: momentumExplanation,
      wagePressure: wageExplanation,
    },
  };
}
