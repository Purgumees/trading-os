export type InflationObservation = { date: string; value: number };
export type InflationMetric = { value: number | null; date?: string | null };
export type InflationMonthlyObservation = {
  date: string;
  yoy: number | null;
  mom: number | null;
};

export function buildInflationMonthlyHistory(
  observationsNewestFirst: InflationObservation[],
  months = 6
): InflationMonthlyObservation[] {
  if (observationsNewestFirst.length === 0 || months < 1) {
    return [];
  }

  const sorted = [...observationsNewestFirst]
    .filter((observation) => Number.isFinite(observation.value))
    .sort((left, right) => right.date.localeCompare(left.date));
  const byMonth = new Map<string, InflationObservation>();
  for (const observation of sorted) {
    byMonth.set(observation.date.slice(0, 7), observation);
  }

  const latestDate = sorted[0]?.date;
  if (!latestDate) {
    return [];
  }

  const latestMonth = new Date(`${latestDate.slice(0, 7)}-01T00:00:00Z`);
  const history: InflationMonthlyObservation[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const monthDate = new Date(latestMonth);
    monthDate.setUTCMonth(monthDate.getUTCMonth() - offset);
    const monthKey = monthDate.toISOString().slice(0, 7);
    const yearAgoDate = new Date(monthDate);
    yearAgoDate.setUTCFullYear(yearAgoDate.getUTCFullYear() - 1);
    const previousMonthDate = new Date(monthDate);
    previousMonthDate.setUTCMonth(previousMonthDate.getUTCMonth() - 1);
    const current = byMonth.get(monthKey);
    const yearAgo = byMonth.get(yearAgoDate.toISOString().slice(0, 7));
    const previous = byMonth.get(previousMonthDate.toISOString().slice(0, 7));

    history.push({
      date: `${monthKey}-01`,
      yoy:
        current && yearAgo && yearAgo.value !== 0
          ? Number((((current.value / yearAgo.value) - 1) * 100).toFixed(2))
          : null,
      mom:
        current && previous && previous.value !== 0
          ? Number((((current.value / previous.value) - 1) * 100).toFixed(2))
          : null,
    });
  }

  return history;
}

export type InflationSeriesInput = {
  currentYoY: InflationMetric;
  oneMonthAgoYoY: InflationMetric;
  threeMonthsAgoYoY: InflationMetric;
  sixMonthsAgoYoY: InflationMetric;
  latestMoM: InflationMetric;
  annualized3m: InflationMetric;
  historicalObservations?: InflationObservation[];
};

export type InflationStateInput = {
  headlineCpi: InflationSeriesInput;
  headlinePce: InflationSeriesInput;
  coreCpi: InflationSeriesInput;
  corePce: InflationSeriesInput;
  ismManufacturingPrices: { value: number | null; previousValue: number | null } | null;
  ismServicesPrices: { value: number | null; previousValue: number | null } | null;
};

export type InflationLevel =
  "VERY HIGH" | "ABOVE TARGET" | "MODERATELY ABOVE TARGET" | "NEAR TARGET" | "BELOW TARGET";
export type InflationMomentum =
  "HEATING RAPIDLY" | "HEATING" | "STABLE" | "COOLING" | "COOLING RAPIDLY";
export type ForwardPricePressure = "SURGING" | "RISING" | "STABLE" | "EASING" | "FALLING RAPIDLY";

export type InflationAssessment = {
  current: {
    overall: InflationLevel | "UNAVAILABLE";
    core: InflationLevel | "UNAVAILABLE";
    headline: InflationLevel | "UNAVAILABLE";
    explanation: string;
  };
  momentum: {
    core: InflationMomentum | "UNAVAILABLE";
    coreArrow: "↑↑" | "↑" | "→" | "↓" | "↓↓" | "";
    headline: InflationMomentum | "UNAVAILABLE";
    headlineArrow: "↑↑" | "↑" | "→" | "↓" | "↓↓" | "";
    series: Record<
      "coreCpi" | "corePce" | "headlineCpi" | "headlinePce",
      {
        state: InflationMomentum | "UNAVAILABLE";
        arrow: "↑↑" | "↑" | "→" | "↓" | "↓↓" | "";
        shortTerm: InflationMomentum | "UNAVAILABLE";
        shortTermArrow: "↑↑" | "↑" | "→" | "↓" | "↓↓" | "";
        mediumTerm: InflationMomentum | "UNAVAILABLE";
        mediumTermArrow: "↑↑" | "↑" | "→" | "↓" | "↓↓" | "";
        calibration: "historical" | "fallback" | "unavailable";
        oneMonthCalibrationScore: -2 | -1 | 0 | 1 | 2 | null;
      }
    >;
    shortMediumDivergence: string;
    shortTerm: {
      core: InflationMomentum | "UNAVAILABLE";
      coreArrow: "↑↑" | "↑" | "→" | "↓" | "↓↓" | "";
      headline: InflationMomentum | "UNAVAILABLE";
      headlineArrow: "↑↑" | "↑" | "→" | "↓" | "↓↓" | "";
    };
    mediumTerm: {
      core: InflationMomentum | "UNAVAILABLE";
      coreArrow: "↑↑" | "↑" | "→" | "↓" | "↓↓" | "";
      headline: InflationMomentum | "UNAVAILABLE";
      headlineArrow: "↑↑" | "↑" | "→" | "↓" | "↓↓" | "";
    };
    divergence: string;
    explanation: string;
  };
  forwardPricePressure: {
    state: ForwardPricePressure | "UNAVAILABLE";
    arrow: "↑↑" | "↑" | "→" | "↓" | "↓↓" | "";
    strongestDriver: string | null;
    explanation: string;
  };
  strongestInflationaryDriver: string | null;
  strongestDisinflationaryDriver: string | null;
  explanation: string;
};

export const INFLATION_ENGINE_THRESHOLDS = {
  level: {
    belowTargetMaximum: 1.5,
    nearTargetMaximum: 2.5,
    moderatelyAboveMaximum: 3.5,
    aboveTargetMaximum: 5,
    veryHighScore: 1.65,
    aboveTargetScore: 0.95,
    moderatelyAboveScore: 0.3,
    nearTargetScore: -0.55,
  },
  momentum: {
    combinedRapid: 1.15,
    combinedHeating: 0.3,
    combinedCooling: -0.3,
    combinedRapidCooling: -1.15,
    historicalWindowYears: 3,
    minimumHistoricalChanges: 18,
    historicalUnusualLowerPercentile: 0.1,
    historicalMeaningfulLowerPercentile: 0.25,
    historicalMeaningfulUpperPercentile: 0.75,
    historicalUnusualUpperPercentile: 0.9,
    fallbackYoYChange: {
      headlineCpi: { moderate: 0.12, strong: 0.3 },
      headlinePce: { moderate: 0.1, strong: 0.25 },
      coreCpi: { moderate: 0.1, strong: 0.24 },
      corePce: { moderate: 0.08, strong: 0.2 },
    },
    trendChange3m: {
      headlineCpi: 0.22,
      headlinePce: 0.18,
      coreCpi: 0.18,
      corePce: 0.14,
    },
    trendChange6m: {
      headlineCpi: 0.35,
      headlinePce: 0.3,
      coreCpi: 0.3,
      corePce: 0.24,
    },
    targetMonthlyPace: {
      headlineCpi: 0.17,
      headlinePce: 0.16,
      coreCpi: 0.17,
      corePce: 0.16,
    },
    targetAnnualized3mPace: {
      headlineCpi: 2.05,
      headlinePce: 1.95,
      coreCpi: 2.05,
      corePce: 1.95,
    },
    monthlyPaceBand: {
      headlineCpi: 0.1,
      headlinePce: 0.09,
      coreCpi: 0.09,
      corePce: 0.08,
    },
    annualized3mPaceBand: {
      headlineCpi: 0.8,
      headlinePce: 0.7,
      coreCpi: 0.7,
      corePce: 0.6,
    },
  },
  forwardPrices: {
    manufacturing: { moderate: 1.5, strong: 3 },
    services: { moderate: 1.25, strong: 2.5 },
    surging: 0.85,
    rising: 0.4,
    easing: -0.4,
    fallingRapidly: -1.4,
  },
} as const;

export const INFLATION_ENGINE_WEIGHTS = {
  current: {
    overallCore: 0.7,
    overallHeadline: 0.3,
    corePce: 0.65,
    coreCpi: 0.35,
    headlinePce: 0.55,
    headlineCpi: 0.45,
  },
  momentum: {
    corePce: 0.65,
    coreCpi: 0.35,
    headlinePce: 0.55,
    headlineCpi: 0.45,
    yoyOneMonth: 0.5,
    yoyThreeMonths: 2,
    yoySixMonths: 1.5,
    latestMonthPace: 1.25,
    annualizedThreeMonthPace: 1.5,
    shortTermOneMonth: 1,
    shortTermThreeMonth: 1,
    mediumTermThreeMonth: 1.5,
    mediumTermSixMonth: 1.5,
  },
  forwardPrices: {
    manufacturing: 0.45,
    services: 0.55,
  },
} as const;

type SeriesKey = keyof typeof INFLATION_ENGINE_THRESHOLDS.momentum.fallbackYoYChange;

const SERIES_LABELS: Record<SeriesKey, string> = {
  headlineCpi: "Headline CPI",
  headlinePce: "Headline PCE",
  coreCpi: "Core CPI",
  corePce: "Core PCE",
};

function valid(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function levelScore(value: number | null) {
  if (!valid(value)) return null;
  const thresholds = INFLATION_ENGINE_THRESHOLDS.level;
  if (value <= thresholds.belowTargetMaximum) return -1;
  if (value <= thresholds.nearTargetMaximum) return 0;
  if (value <= thresholds.moderatelyAboveMaximum) return 0.65;
  if (value <= thresholds.aboveTargetMaximum) return 1.35;
  return 2;
}

function levelForScore(score: number | null): InflationLevel | "UNAVAILABLE" {
  if (score === null) return "UNAVAILABLE";
  const thresholds = INFLATION_ENGINE_THRESHOLDS.level;
  if (score >= thresholds.veryHighScore) return "VERY HIGH";
  if (score >= thresholds.aboveTargetScore) return "ABOVE TARGET";
  if (score >= thresholds.moderatelyAboveScore) return "MODERATELY ABOVE TARGET";
  if (score >= thresholds.nearTargetScore) return "NEAR TARGET";
  return "BELOW TARGET";
}

function weightedAverage(items: Array<{ value: number | null; weight: number }>) {
  const available = items.filter((item) => item.value !== null);
  const weight = available.reduce((sum, item) => sum + item.weight, 0);
  return weight === 0
    ? null
    : available.reduce((sum, item) => sum + item.value! * item.weight, 0) / weight;
}

function consecutiveMonths(newer: string, older: string) {
  const newDate = new Date(`${newer}T00:00:00Z`);
  const oldDate = new Date(`${older}T00:00:00Z`);
  return (
    Number.isFinite(newDate.getTime()) &&
    Number.isFinite(oldDate.getTime()) &&
    newDate.getUTCFullYear() * 12 +
      newDate.getUTCMonth() -
      (oldDate.getUTCFullYear() * 12 + oldDate.getUTCMonth()) ===
      1
  );
}

function monthDistance(newer: string, older: string) {
  const newDate = new Date(`${newer}T00:00:00Z`);
  const oldDate = new Date(`${older}T00:00:00Z`);
  if (!Number.isFinite(newDate.getTime()) || !Number.isFinite(oldDate.getTime())) {
    return null;
  }
  return (
    newDate.getUTCFullYear() * 12 +
    newDate.getUTCMonth() -
    (oldDate.getUTCFullYear() * 12 + oldDate.getUTCMonth())
  );
}

function historicalYoyChanges(observations: InflationObservation[]) {
  const changes: Array<{ date: string; value: number }> = [];
  for (let index = 0; index + 13 < observations.length; index += 1) {
    const current = observations[index];
    const previous = observations[index + 1];
    const yearAgo = observations[index + 12];
    const yearAgoPrevious = observations[index + 13];
    if (
      !current ||
      !previous ||
      !yearAgo ||
      !yearAgoPrevious ||
      !consecutiveMonths(current.date, previous.date) ||
      monthDistance(current.date, yearAgo.date) !== 12 ||
      !consecutiveMonths(yearAgo.date, yearAgoPrevious.date) ||
      monthDistance(previous.date, yearAgoPrevious.date) !== 12
    ) {
      continue;
    }
    const currentYoY = (current.value / yearAgo.value - 1) * 100;
    const previousYoY = (previous.value / yearAgoPrevious.value - 1) * 100;
    changes.push({ date: current.date, value: currentYoY - previousYoY });
  }
  return changes;
}

type CalibratedMoveScore = -2 | -1 | 0 | 1 | 2 | null;

function calibrationScore(
  input: InflationSeriesInput,
  key: SeriesKey,
  latestMove: number | null,
): { score: CalibratedMoveScore; method: "historical" | "fallback" | "unavailable" } {
  if (!valid(latestMove)) return { score: null, method: "unavailable" as const };
  const currentDate = input.currentYoY.date;
  const historical = input.historicalObservations
    ? historicalYoyChanges(input.historicalObservations)
    : [];
  const windowStart = currentDate ? new Date(`${currentDate}T00:00:00Z`) : null;
  if (windowStart)
    windowStart.setUTCFullYear(
      windowStart.getUTCFullYear() - INFLATION_ENGINE_THRESHOLDS.momentum.historicalWindowYears,
    );
  const prior = historical
    .filter((entry) => {
      const date = new Date(`${entry.date}T00:00:00Z`);
      return (
        !!windowStart &&
        !!currentDate &&
        Number.isFinite(date.getTime()) &&
        date < new Date(`${currentDate}T00:00:00Z`) &&
        date >= windowStart
      );
    })
    .map((entry) => entry.value);
  const config = INFLATION_ENGINE_THRESHOLDS.momentum;
  if (prior.length >= config.minimumHistoricalChanges) {
    const below = prior.filter((value) => value < latestMove).length;
    const ties = prior.filter((value) => value === latestMove).length;
    const percentile = (below + ties / 2) / prior.length;
    let score: Exclude<CalibratedMoveScore, null> = 0;
    if (percentile <= config.historicalUnusualLowerPercentile) score = -2;
    else if (percentile <= config.historicalMeaningfulLowerPercentile) score = -1;
    else if (percentile >= config.historicalUnusualUpperPercentile) score = 2;
    else if (percentile >= config.historicalMeaningfulUpperPercentile) score = 1;
    return { score, method: "historical" as const };
  }

  const thresholds = config.fallbackYoYChange[key];
  const magnitude = Math.abs(latestMove);
  const direction = latestMove > 0 ? 1 : latestMove < 0 ? -1 : 0;
  const score: Exclude<CalibratedMoveScore, null> =
    magnitude >= thresholds.strong
      ? direction > 0
        ? 2
        : direction < 0
          ? -2
          : 0
      : magnitude >= thresholds.moderate
        ? direction
        : 0;
  return {
    score,
    method: "fallback" as const,
  };
}

function signedBand(value: number | null, threshold: number) {
  if (!valid(value)) return null;
  if (Math.abs(value) < threshold) return 0;
  return Math.sign(value) * (Math.abs(value) >= threshold * 2 ? 2 : 1);
}

function abovePaceScore(value: number | null, target: number, band: number) {
  if (!valid(value)) return null;
  const difference = value - target;
  if (difference >= band * 2) return 2;
  if (difference >= band) return 1;
  if (difference <= -band * 2) return -2;
  if (difference <= -band) return -1;
  return 0;
}

function classifyMomentum(score: number | null): InflationMomentum | "UNAVAILABLE" {
  if (score === null) return "UNAVAILABLE";
  const thresholds = INFLATION_ENGINE_THRESHOLDS.momentum;
  if (score >= thresholds.combinedRapid) return "HEATING RAPIDLY";
  if (score >= thresholds.combinedHeating) return "HEATING";
  if (score <= thresholds.combinedRapidCooling) return "COOLING RAPIDLY";
  if (score <= thresholds.combinedCooling) return "COOLING";
  return "STABLE";
}

function momentumArrow(state: InflationMomentum | "UNAVAILABLE") {
  switch (state) {
    case "HEATING RAPIDLY":
      return "↑↑";
    case "HEATING":
      return "↑";
    case "COOLING":
      return "↓";
    case "COOLING RAPIDLY":
      return "↓↓";
    case "STABLE":
      return "→";
    default:
      return "";
  }
}

function scoreMomentum(input: InflationSeriesInput, key: SeriesKey) {
  const config = INFLATION_ENGINE_THRESHOLDS.momentum;
  const weights = INFLATION_ENGINE_WEIGHTS.momentum;
  const yoyOneMonthMove =
    valid(input.currentYoY.value) && valid(input.oneMonthAgoYoY.value)
      ? input.currentYoY.value - input.oneMonthAgoYoY.value
      : null;
  const calibrated = calibrationScore(input, key, yoyOneMonthMove);
  const yoyThreeMonthMove =
    valid(input.currentYoY.value) && valid(input.threeMonthsAgoYoY.value)
      ? input.currentYoY.value - input.threeMonthsAgoYoY.value
      : null;
  const yoySixMonthMove =
    valid(input.currentYoY.value) && valid(input.sixMonthsAgoYoY.value)
      ? input.currentYoY.value - input.sixMonthsAgoYoY.value
      : null;
  const signals = [
    { value: calibrated.score, weight: weights.yoyOneMonth },
    {
      value: signedBand(yoyThreeMonthMove, config.trendChange3m[key]),
      weight: weights.yoyThreeMonths,
    },
    { value: signedBand(yoySixMonthMove, config.trendChange6m[key]), weight: weights.yoySixMonths },
    {
      value: abovePaceScore(
        input.latestMoM.value,
        config.targetMonthlyPace[key],
        config.monthlyPaceBand[key],
      ),
      weight: weights.latestMonthPace,
    },
    {
      value: abovePaceScore(
        input.annualized3m.value,
        config.targetAnnualized3mPace[key],
        config.annualized3mPaceBand[key],
      ),
      weight: weights.annualizedThreeMonthPace,
    },
  ].filter((signal) => signal.value !== null);
  if (!signals.length) {
    return {
      score: null,
      state: "UNAVAILABLE" as const,
      calibration: calibrated.method,
      oneMonthCalibrationScore: calibrated.score,
    };
  }
  const score =
    signals.reduce((sum, signal) => sum + signal.value! * signal.weight, 0) /
    signals.reduce((sum, signal) => sum + signal.weight, 0);
  return {
    score,
    state: classifyMomentum(score),
    calibration: calibrated.method,
    oneMonthCalibrationScore: calibrated.score,
  };
}

function scoreShortTermMomentum(input: InflationSeriesInput, key: SeriesKey) {
  const config = INFLATION_ENGINE_THRESHOLDS.momentum;
  const weights = INFLATION_ENGINE_WEIGHTS.momentum;
  const oneMonthMove =
    valid(input.currentYoY.value) && valid(input.oneMonthAgoYoY.value)
      ? input.currentYoY.value - input.oneMonthAgoYoY.value
      : null;
  const calibrated = calibrationScore(input, key, oneMonthMove);
  const threeMonthMove =
    valid(input.currentYoY.value) && valid(input.threeMonthsAgoYoY.value)
      ? input.currentYoY.value - input.threeMonthsAgoYoY.value
      : null;
  const signals = [
    { value: calibrated.score, weight: weights.shortTermOneMonth },
    {
      value: signedBand(threeMonthMove, config.trendChange3m[key]),
      weight: weights.shortTermThreeMonth,
    },
    {
      value: abovePaceScore(
        input.latestMoM.value,
        config.targetMonthlyPace[key],
        config.monthlyPaceBand[key],
      ),
      weight: weights.latestMonthPace,
    },
    {
      value: abovePaceScore(
        input.annualized3m.value,
        config.targetAnnualized3mPace[key],
        config.annualized3mPaceBand[key],
      ),
      weight: weights.annualizedThreeMonthPace,
    },
  ].filter((signal) => signal.value !== null);
  const totalWeight = signals.reduce((sum, item) => sum + item.weight, 0);
  const score =
    totalWeight === 0
      ? null
      : signals.reduce((sum, item) => sum + item.value! * item.weight, 0) / totalWeight;
  return {
    score,
    state: classifyMomentum(score),
  };
}

function scoreMediumTermMomentum(input: InflationSeriesInput, key: SeriesKey) {
  const config = INFLATION_ENGINE_THRESHOLDS.momentum;
  const weights = INFLATION_ENGINE_WEIGHTS.momentum;
  const threeMonthMove =
    valid(input.currentYoY.value) && valid(input.threeMonthsAgoYoY.value)
      ? input.currentYoY.value - input.threeMonthsAgoYoY.value
      : null;
  const sixMonthMove =
    valid(input.currentYoY.value) && valid(input.sixMonthsAgoYoY.value)
      ? input.currentYoY.value - input.sixMonthsAgoYoY.value
      : null;
  const signals = [
    {
      value: signedBand(threeMonthMove, config.trendChange3m[key]),
      weight: weights.mediumTermThreeMonth,
    },
    {
      value: signedBand(sixMonthMove, config.trendChange6m[key]),
      weight: weights.mediumTermSixMonth,
    },
  ].filter((signal) => signal.value !== null);
  const totalWeight = signals.reduce((sum, item) => sum + item.weight, 0);
  const score =
    totalWeight === 0
      ? null
      : signals.reduce((sum, item) => sum + item.value! * item.weight, 0) / totalWeight;
  return {
    score,
    state: classifyMomentum(score),
  };
}

function ismChangeScore(
  current: number | null,
  previous: number | null,
  thresholds: { moderate: number; strong: number },
) {
  if (!valid(current) || !valid(previous)) return null;
  const change = current - previous;
  if (change >= thresholds.strong) return 2;
  if (change >= thresholds.moderate) return 1;
  if (change <= -thresholds.strong) return -2;
  if (change <= -thresholds.moderate) return -1;
  return 0;
}

function classifyForward(score: number | null): ForwardPricePressure | "UNAVAILABLE" {
  if (score === null) return "UNAVAILABLE";
  const thresholds = INFLATION_ENGINE_THRESHOLDS.forwardPrices;
  if (score >= thresholds.surging) return "SURGING";
  if (score >= thresholds.rising) return "RISING";
  if (score <= thresholds.fallingRapidly) return "FALLING RAPIDLY";
  if (score <= thresholds.easing) return "EASING";
  return "STABLE";
}

function forwardArrow(state: ForwardPricePressure | "UNAVAILABLE") {
  switch (state) {
    case "SURGING":
      return "↑↑";
    case "RISING":
      return "↑";
    case "EASING":
      return "↓";
    case "FALLING RAPIDLY":
      return "↓↓";
    case "STABLE":
      return "→";
    default:
      return "";
  }
}

export function calculateInflationState(input: InflationStateInput): InflationAssessment {
  const weights = INFLATION_ENGINE_WEIGHTS.current;
  const coreScore = weightedAverage([
    { value: levelScore(input.corePce.currentYoY.value), weight: weights.corePce },
    { value: levelScore(input.coreCpi.currentYoY.value), weight: weights.coreCpi },
  ]);
  const headlineScore = weightedAverage([
    { value: levelScore(input.headlinePce.currentYoY.value), weight: weights.headlinePce },
    { value: levelScore(input.headlineCpi.currentYoY.value), weight: weights.headlineCpi },
  ]);
  const overallScore = weightedAverage([
    { value: coreScore, weight: weights.overallCore },
    { value: headlineScore, weight: weights.overallHeadline },
  ]);
  const currentCore = levelForScore(coreScore);
  const currentHeadline = levelForScore(headlineScore);
  const currentOverall = levelForScore(overallScore);
  const levelExplanation = `Core inflation is ${currentCore.toLowerCase()} and headline inflation is ${currentHeadline.toLowerCase()}; the overall reading gives core inflation 70% of the weight and headline inflation 30%.`;

  const scored = {
    coreCpi: scoreMomentum(input.coreCpi, "coreCpi"),
    corePce: scoreMomentum(input.corePce, "corePce"),
    headlineCpi: scoreMomentum(input.headlineCpi, "headlineCpi"),
    headlinePce: scoreMomentum(input.headlinePce, "headlinePce"),
  };
  const shortScored = {
    coreCpi: scoreShortTermMomentum(input.coreCpi, "coreCpi"),
    corePce: scoreShortTermMomentum(input.corePce, "corePce"),
    headlineCpi: scoreShortTermMomentum(input.headlineCpi, "headlineCpi"),
    headlinePce: scoreShortTermMomentum(input.headlinePce, "headlinePce"),
  };
  const mediumScored = {
    coreCpi: scoreMediumTermMomentum(input.coreCpi, "coreCpi"),
    corePce: scoreMediumTermMomentum(input.corePce, "corePce"),
    headlineCpi: scoreMediumTermMomentum(input.headlineCpi, "headlineCpi"),
    headlinePce: scoreMediumTermMomentum(input.headlinePce, "headlinePce"),
  };
  const coreMomentumScore = weightedAverage([
    { value: scored.corePce.score, weight: INFLATION_ENGINE_WEIGHTS.momentum.corePce },
    { value: scored.coreCpi.score, weight: INFLATION_ENGINE_WEIGHTS.momentum.coreCpi },
  ]);
  const headlineMomentumScore = weightedAverage([
    { value: scored.headlinePce.score, weight: INFLATION_ENGINE_WEIGHTS.momentum.headlinePce },
    { value: scored.headlineCpi.score, weight: INFLATION_ENGINE_WEIGHTS.momentum.headlineCpi },
  ]);
  const coreShortTermScore = weightedAverage([
    { value: shortScored.corePce.score, weight: INFLATION_ENGINE_WEIGHTS.momentum.corePce },
    { value: shortScored.coreCpi.score, weight: INFLATION_ENGINE_WEIGHTS.momentum.coreCpi },
  ]);
  const headlineShortTermScore = weightedAverage([
    {
      value: shortScored.headlinePce.score,
      weight: INFLATION_ENGINE_WEIGHTS.momentum.headlinePce,
    },
    {
      value: shortScored.headlineCpi.score,
      weight: INFLATION_ENGINE_WEIGHTS.momentum.headlineCpi,
    },
  ]);
  const coreMediumTermScore = weightedAverage([
    { value: mediumScored.corePce.score, weight: INFLATION_ENGINE_WEIGHTS.momentum.corePce },
    { value: mediumScored.coreCpi.score, weight: INFLATION_ENGINE_WEIGHTS.momentum.coreCpi },
  ]);
  const headlineMediumTermScore = weightedAverage([
    {
      value: mediumScored.headlinePce.score,
      weight: INFLATION_ENGINE_WEIGHTS.momentum.headlinePce,
    },
    {
      value: mediumScored.headlineCpi.score,
      weight: INFLATION_ENGINE_WEIGHTS.momentum.headlineCpi,
    },
  ]);
  const coreShortTerm = classifyMomentum(coreShortTermScore);
  const headlineShortTerm = classifyMomentum(headlineShortTermScore);
  const coreMediumTerm = classifyMomentum(coreMediumTermScore);
  const headlineMediumTerm = classifyMomentum(headlineMediumTermScore);
  const coreMomentum = classifyMomentum(coreMomentumScore);
  const headlineMomentum = classifyMomentum(headlineMomentumScore);
  const divergent =
    coreMomentumScore !== null &&
    headlineMomentumScore !== null &&
    Math.sign(coreMomentumScore) !== 0 &&
    Math.sign(headlineMomentumScore) !== 0 &&
    Math.sign(coreMomentumScore) !== Math.sign(headlineMomentumScore);
  const divergence = divergent
    ? `Headline inflation is ${headlineMomentum.toLowerCase()} while core inflation is ${coreMomentum.toLowerCase()}.`
    : "Core and headline inflation momentum are broadly aligned.";
  const shortMediumDivergences = [
    {
      name: "Headline",
      short: headlineShortTerm,
      medium: headlineMediumTerm,
    },
    { name: "Core", short: coreShortTerm, medium: coreMediumTerm },
  ].flatMap(({ name, short, medium }) => {
    if (
      medium.includes("COOLING") &&
      short.includes("HEATING")
    ) {
      return [`${name} is medium-term cooling, short-term reaccelerating.`];
    }
    if (
      medium.includes("HEATING") &&
      short.includes("COOLING")
    ) {
      return [`${name} is medium-term heating, short-term easing.`];
    }
    return [];
  });
  const shortMediumDivergence =
    shortMediumDivergences.join(" ") ||
    ([
      coreShortTerm,
      headlineShortTerm,
      coreMediumTerm,
      headlineMediumTerm,
    ].some((state) => state === "UNAVAILABLE")
      ? "Short- or medium-term momentum is unavailable for some inflation series."
      : "Short- and medium-term momentum are broadly aligned.");

  const drivers = [
    ...Object.entries(scored).map(([key, value]) => ({
      label: SERIES_LABELS[key as SeriesKey],
      score: value.score,
    })),
  ];
  const positiveDriver =
    drivers
      .filter((driver) => driver.score !== null && driver.score > 0)
      .sort((a, b) => b.score! - a.score!)[0]?.label ?? null;
  const negativeDriver =
    drivers
      .filter((driver) => driver.score !== null && driver.score < 0)
      .sort((a, b) => a.score! - b.score!)[0]?.label ?? null;

  const manufacturingScore = ismChangeScore(
    input.ismManufacturingPrices?.value ?? null,
    input.ismManufacturingPrices?.previousValue ?? null,
    INFLATION_ENGINE_THRESHOLDS.forwardPrices.manufacturing,
  );
  const servicesScore = ismChangeScore(
    input.ismServicesPrices?.value ?? null,
    input.ismServicesPrices?.previousValue ?? null,
    INFLATION_ENGINE_THRESHOLDS.forwardPrices.services,
  );
  const forwardScore = weightedAverage([
    { value: manufacturingScore, weight: INFLATION_ENGINE_WEIGHTS.forwardPrices.manufacturing },
    { value: servicesScore, weight: INFLATION_ENGINE_WEIGHTS.forwardPrices.services },
  ]);
  const forwardState = classifyForward(forwardScore);
  const manufacturingImpact =
    manufacturingScore === null
      ? null
      : manufacturingScore * INFLATION_ENGINE_WEIGHTS.forwardPrices.manufacturing;
  const servicesImpact =
    servicesScore === null ? null : servicesScore * INFLATION_ENGINE_WEIGHTS.forwardPrices.services;
  const forwardDriver =
    (manufacturingImpact === null && servicesImpact === null) ||
    (manufacturingImpact === 0 && servicesImpact === 0)
      ? null
      : Math.abs(manufacturingImpact ?? 0) >= Math.abs(servicesImpact ?? 0)
        ? "Manufacturing prices"
        : "Services prices";
  const forwardExplanation = forwardDriver
    ? `ISM ${forwardDriver.toLowerCase()} readings point to ${forwardState.toLowerCase()} forward price pressure.`
    : forwardScore === null
      ? "ISM prices readings are unavailable."
      : "ISM prices readings are broadly unchanged, indicating stable forward price pressure.";
  const momentumExplanation = `Core inflation is ${coreMomentum.toLowerCase()} ${momentumArrow(coreMomentum)} and headline inflation is ${headlineMomentum.toLowerCase()} ${momentumArrow(headlineMomentum)}; multi-month trends and price pace temper one-month moves.`;
  const explanation = `${levelExplanation} ${divergence} ${forwardExplanation}`;

  return {
    current: {
      overall: currentOverall,
      core: currentCore,
      headline: currentHeadline,
      explanation: levelExplanation,
    },
    momentum: {
      core: coreMomentum,
      coreArrow: momentumArrow(coreMomentum),
      headline: headlineMomentum,
      headlineArrow: momentumArrow(headlineMomentum),
      series: {
        coreCpi: {
          state: scored.coreCpi.state,
          arrow: momentumArrow(scored.coreCpi.state),
          shortTerm: shortScored.coreCpi.state,
          shortTermArrow: momentumArrow(shortScored.coreCpi.state),
          mediumTerm: mediumScored.coreCpi.state,
          mediumTermArrow: momentumArrow(mediumScored.coreCpi.state),
          calibration: scored.coreCpi.calibration,
          oneMonthCalibrationScore: scored.coreCpi.oneMonthCalibrationScore,
        },
        corePce: {
          state: scored.corePce.state,
          arrow: momentumArrow(scored.corePce.state),
          shortTerm: shortScored.corePce.state,
          shortTermArrow: momentumArrow(shortScored.corePce.state),
          mediumTerm: mediumScored.corePce.state,
          mediumTermArrow: momentumArrow(mediumScored.corePce.state),
          calibration: scored.corePce.calibration,
          oneMonthCalibrationScore: scored.corePce.oneMonthCalibrationScore,
        },
        headlineCpi: {
          state: scored.headlineCpi.state,
          arrow: momentumArrow(scored.headlineCpi.state),
          shortTerm: shortScored.headlineCpi.state,
          shortTermArrow: momentumArrow(shortScored.headlineCpi.state),
          mediumTerm: mediumScored.headlineCpi.state,
          mediumTermArrow: momentumArrow(mediumScored.headlineCpi.state),
          calibration: scored.headlineCpi.calibration,
          oneMonthCalibrationScore: scored.headlineCpi.oneMonthCalibrationScore,
        },
        headlinePce: {
          state: scored.headlinePce.state,
          arrow: momentumArrow(scored.headlinePce.state),
          shortTerm: shortScored.headlinePce.state,
          shortTermArrow: momentumArrow(shortScored.headlinePce.state),
          mediumTerm: mediumScored.headlinePce.state,
          mediumTermArrow: momentumArrow(mediumScored.headlinePce.state),
          calibration: scored.headlinePce.calibration,
          oneMonthCalibrationScore: scored.headlinePce.oneMonthCalibrationScore,
        },
      },
      shortMediumDivergence,
      shortTerm: {
        core: coreShortTerm,
        coreArrow: momentumArrow(coreShortTerm),
        headline: headlineShortTerm,
        headlineArrow: momentumArrow(headlineShortTerm),
      },
      mediumTerm: {
        core: coreMediumTerm,
        coreArrow: momentumArrow(coreMediumTerm),
        headline: headlineMediumTerm,
        headlineArrow: momentumArrow(headlineMediumTerm),
      },
      divergence,
      explanation: momentumExplanation,
    },
    forwardPricePressure: {
      state: forwardState,
      arrow: forwardArrow(forwardState),
      strongestDriver: forwardDriver,
      explanation: forwardExplanation,
    },
    strongestInflationaryDriver: positiveDriver,
    strongestDisinflationaryDriver: negativeDriver,
    explanation,
  };
}
