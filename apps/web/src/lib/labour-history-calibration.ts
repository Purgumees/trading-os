export type DatedObservation = {
  date: string;
  value: number;
};

export type DatedChange = {
  date: string;
  value: number;
};

export type LabourCalibrationResult = {
  score: -2 | -1 | 0 | 1 | 2 | null;
  method: "historical" | "fallback" | "unavailable";
  sampleSize: number;
  percentileRank: number | null;
};

export const LABOUR_CALIBRATION_CONFIG = {
  windowYears: 3,
  minimumMonthlyObservations: 24,
  minimumWeeklyObservations: 52,
  meaningfulLowerPercentile: 0.25,
  unusualLowerPercentile: 0.125,
  meaningfulUpperPercentile: 0.75,
  unusualUpperPercentile: 0.875,
} as const;

type Cadence = "monthly" | "weekly";

function isConsecutive(
  newerDate: string,
  olderDate: string,
  cadence: Cadence
) {
  const newer = new Date(`${newerDate}T00:00:00Z`);
  const older = new Date(`${olderDate}T00:00:00Z`);
  if (!Number.isFinite(newer.getTime()) || !Number.isFinite(older.getTime())) {
    return false;
  }

  if (cadence === "weekly") {
    return newer.getTime() - older.getTime() === 7 * 86400000;
  }

  const monthDistance =
    newer.getUTCFullYear() * 12 +
    newer.getUTCMonth() -
    (older.getUTCFullYear() * 12 + older.getUTCMonth());
  return monthDistance === 1;
}

export function buildDatedChanges(
  observationsNewestFirst: DatedObservation[],
  cadence: Cadence
): DatedChange[] {
  const changes: DatedChange[] = [];

  for (let index = 0; index < observationsNewestFirst.length - 1; index++) {
    const newer = observationsNewestFirst[index];
    const older = observationsNewestFirst[index + 1];
    if (
      !newer ||
      !older ||
      !Number.isFinite(newer.value) ||
      !Number.isFinite(older.value) ||
      !isConsecutive(newer.date, older.date, cadence)
    ) {
      continue;
    }

    changes.push({
      date: newer.date,
      value: newer.value - older.value,
    });
  }

  return changes;
}

export function buildDatedDifferences(
  currentSeriesNewestFirst: DatedObservation[],
  periods: number,
  cadence: Cadence
): DatedChange[] {
  if (!Number.isInteger(periods) || periods < 1) {
    return [];
  }

  const changes: DatedChange[] = [];
  for (
    let index = 0;
    index + periods < currentSeriesNewestFirst.length;
    index++
  ) {
    const current = currentSeriesNewestFirst[index];
    const comparison = currentSeriesNewestFirst[index + periods];
    if (!current || !comparison) continue;

    let continuous = true;
    for (let offset = 0; offset < periods; offset++) {
      const newer = currentSeriesNewestFirst[index + offset];
      const older = currentSeriesNewestFirst[index + offset + 1];
      if (!newer || !older || !isConsecutive(newer.date, older.date, cadence)) {
        continuous = false;
        break;
      }
    }
    if (continuous) {
      changes.push({
        date: current.date,
        value: current.value - comparison.value,
      });
    }
  }
  return changes;
}

export function buildRollingAverageSeries(
  observationsNewestFirst: DatedObservation[],
  windowSize: number,
  cadence: Cadence
): DatedObservation[] {
  if (!Number.isInteger(windowSize) || windowSize < 1) {
    return [];
  }

  const averages: DatedObservation[] = [];
  for (
    let index = 0;
    index + windowSize <= observationsNewestFirst.length;
    index++
  ) {
    const window = observationsNewestFirst.slice(index, index + windowSize);
    const first = window[0];
    if (!first) continue;

    let continuous = true;
    for (let offset = 0; offset < window.length - 1; offset++) {
      const newer = window[offset];
      const older = window[offset + 1];
      if (!newer || !older || !isConsecutive(newer.date, older.date, cadence)) {
        continuous = false;
        break;
      }
    }
    if (!continuous) continue;

    averages.push({
      date: first.date,
      value: window.reduce((sum, observation) => sum + observation.value, 0) /
        windowSize,
    });
  }
  return averages;
}

function calibratedSample(
  datedHistoryNewestFirst: DatedChange[],
  latestDate: string,
  windowYears: number
) {
  const currentDate = new Date(`${latestDate}T00:00:00Z`);
  if (!Number.isFinite(currentDate.getTime())) return [];
  const oldestAllowed = new Date(currentDate);
  oldestAllowed.setUTCFullYear(oldestAllowed.getUTCFullYear() - windowYears);

  return datedHistoryNewestFirst
    .filter((change) => {
      const date = new Date(`${change.date}T00:00:00Z`);
      return (
        Number.isFinite(date.getTime()) &&
        date < currentDate &&
        date >= oldestAllowed &&
        Number.isFinite(change.value)
      );
    })
    .map((change) => change.value);
}

function fallbackMagnitudeScore(
  value: number,
  thresholds: { moderate: number; strong: number }
): -2 | -1 | 0 | 1 | 2 {
  const magnitude = Math.abs(value);
  if (magnitude >= thresholds.strong) return value > 0 ? 2 : -2;
  if (magnitude >= thresholds.moderate) return value > 0 ? 1 : -1;
  return 0;
}

export function calibrateHistoricalMove({
  latestMove,
  latestDate,
  historicalChangesNewestFirst,
  cadence,
  fallbackThresholds,
  macroSignalMultiplier = 1,
}: {
  latestMove: number | null;
  latestDate: string | null;
  historicalChangesNewestFirst: DatedChange[];
  cadence: Cadence;
  fallbackThresholds: { moderate: number; strong: number };
  macroSignalMultiplier?: 1 | -1;
}): LabourCalibrationResult {
  if (
    latestMove === null ||
    !Number.isFinite(latestMove) ||
    !latestDate
  ) {
    return {
      score: null,
      method: "unavailable",
      sampleSize: 0,
      percentileRank: null,
    };
  }

  const sample = calibratedSample(
    historicalChangesNewestFirst,
    latestDate,
    LABOUR_CALIBRATION_CONFIG.windowYears
  ).map((value) => value * macroSignalMultiplier);
  const macroSignalMove = latestMove * macroSignalMultiplier;
  const minimum =
    cadence === "monthly"
      ? LABOUR_CALIBRATION_CONFIG.minimumMonthlyObservations
      : LABOUR_CALIBRATION_CONFIG.minimumWeeklyObservations;

  if (sample.length < minimum) {
    return {
      score: fallbackMagnitudeScore(macroSignalMove, fallbackThresholds),
      method: "fallback",
      sampleSize: sample.length,
      percentileRank: null,
    };
  }

  const below = sample.filter((value) => value < macroSignalMove).length;
  const tied = sample.filter((value) => value === macroSignalMove).length;
  const percentileRank = (below + tied / 2) / sample.length;
  const score =
    percentileRank <= LABOUR_CALIBRATION_CONFIG.unusualLowerPercentile
      ? -2
      : percentileRank <= LABOUR_CALIBRATION_CONFIG.meaningfulLowerPercentile
        ? -1
        : percentileRank >= LABOUR_CALIBRATION_CONFIG.unusualUpperPercentile
          ? 2
          : percentileRank >= LABOUR_CALIBRATION_CONFIG.meaningfulUpperPercentile
            ? 1
            : 0;

  return {
    score,
    method: "historical",
    sampleSize: sample.length,
    percentileRank,
  };
}
