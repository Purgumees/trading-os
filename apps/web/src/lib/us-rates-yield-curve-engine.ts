import type { DatedObservation } from "@/lib/labour-history-calibration";

type DatedChange = {
  date: string;
  value: number;
};

export const US_TREASURY_SERIES = {
  "2Y": "DGS2",
  "5Y": "DGS5",
  "10Y": "DGS10",
  "30Y": "DGS30",
} as const;

export const US_RATES_CALIBRATION_CONFIG = {
  historyLimit: 1600,
  historicalWindowYears: 3,
  minimumDailyObservations: 252,
  meaningfulLowerPercentile: 0.25,
  unusualLowerPercentile: 0.125,
  meaningfulUpperPercentile: 0.75,
  unusualUpperPercentile: 0.875,
  stableCurveChangeBasisPoints: 1,
  fallbackThresholdsBasisPoints: {
    "2Y": {
      oneDay: { moderate: 4, strong: 10 },
      oneWeek: { moderate: 9, strong: 22 },
      oneMonth: { moderate: 15, strong: 36 },
      threeMonths: { moderate: 22, strong: 55 },
    },
    "5Y": {
      oneDay: { moderate: 3, strong: 8 },
      oneWeek: { moderate: 7, strong: 18 },
      oneMonth: { moderate: 12, strong: 30 },
      threeMonths: { moderate: 18, strong: 45 },
    },
    "10Y": {
      oneDay: { moderate: 3, strong: 8 },
      oneWeek: { moderate: 7, strong: 18 },
      oneMonth: { moderate: 12, strong: 32 },
      threeMonths: { moderate: 19, strong: 48 },
    },
    "30Y": {
      oneDay: { moderate: 4, strong: 10 },
      oneWeek: { moderate: 9, strong: 22 },
      oneMonth: { moderate: 15, strong: 38 },
      threeMonths: { moderate: 22, strong: 55 },
    },
  },
} as const;

export type TreasuryMaturity = keyof typeof US_TREASURY_SERIES;
export type YieldHorizon = "oneDay" | "oneWeek" | "oneMonth" | "threeMonths";
export type YieldDirection =
  | "UNUSUALLY LARGE RISE"
  | "RISE"
  | "STABLE"
  | "DECLINE"
  | "UNUSUALLY LARGE DECLINE"
  | "UNAVAILABLE";
export type CurveDirection = "STEEPENING" | "FLATTENING" | "STABLE" | "UNAVAILABLE";

export type YieldObservation = DatedObservation;

type YieldObservationMap = Record<
  TreasuryMaturity,
  YieldObservation[]
>;

type CalibrationMetadata = {
  method: "historical" | "fallback" | "unavailable";
  sampleSize: number;
  percentileRank: number | null;
};

export type YieldChange = {
  changeBasisPoints: number | null;
  comparisonDate: string | null;
  direction: YieldDirection;
  arrow: string;
  calibration: CalibrationMetadata;
};

export type YieldMaturityResult = {
  series: string;
  source: "FRED";
  unit: "%";
  latest: {
    value: number | null;
    date: string | null;
    status: "current" | "stale" | "unavailable";
    ageDays: number | null;
  };
  changes: Record<YieldHorizon, YieldChange>;
};

export type YieldCurveResult = {
  currentSpreadBasisPoints: number | null;
  currentDate: string | null;
  changes: Record<
    Exclude<YieldHorizon, "threeMonths">,
    {
      changeBasisPoints: number | null;
      comparisonDate: string | null;
      direction: CurveDirection;
    }
  >;
};

export type UsRatesYieldCurveResult = {
  source: "FRED";
  unit: "percent yield; changes and spreads in basis points";
  generatedAt: string;
  historyLimitPerSeries: number;
  maturities: Record<TreasuryMaturity, YieldMaturityResult>;
  yieldCurve: {
    "2Y-10Y": YieldCurveResult;
    "2Y-30Y": YieldCurveResult;
    "5Y-30Y": YieldCurveResult;
  };
  summary: {
    frontEndVsLongEnd: string;
    frontEndChangeBasisPoints: number | null;
    tenYearChangeBasisPoints: number | null;
    thirtyYearChangeBasisPoints: number | null;
    longEndChangeBasisPoints: number | null;
    longEndDominates: boolean | null;
    curveDirection: CurveDirection;
    largestMove: {
      maturity: TreasuryMaturity | null;
      changeBasisPoints: number | null;
      horizon: "1D";
    };
  };
};

const HORIZON_SETTINGS: Record<
  YieldHorizon,
  { calendarDays: number; maxLagCalendarDays: number }
> = {
  oneDay: { calendarDays: 0, maxLagCalendarDays: 7 },
  oneWeek: { calendarDays: 7, maxLagCalendarDays: 4 },
  oneMonth: { calendarDays: 30, maxLagCalendarDays: 10 },
  threeMonths: { calendarDays: 90, maxLagCalendarDays: 14 },
};

const CURVE_HORIZONS = ["oneDay", "oneWeek", "oneMonth"] as const;
const YIELD_HORIZONS = ["oneDay", "oneWeek", "oneMonth", "threeMonths"] as const;

function validDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function normalizeObservations(observations: YieldObservation[]) {
  const byDate = new Map<string, number>();
  for (const observation of observations) {
    if (
      validDate(observation.date) &&
      Number.isFinite(observation.value) &&
      !byDate.has(observation.date)
    ) {
      byDate.set(observation.date, observation.value);
    }
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function targetDate(date: string, horizon: YieldHorizon) {
  const parsed = new Date(`${date}T00:00:00Z`);
  const settings = HORIZON_SETTINGS[horizon];
  if (horizon === "oneMonth" || horizon === "threeMonths") {
    const months = horizon === "oneMonth" ? 1 : 3;
    const day = parsed.getUTCDate();
    parsed.setUTCDate(1);
    parsed.setUTCMonth(parsed.getUTCMonth() - months);
    const lastDay = new Date(
      Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)
    ).getUTCDate();
    parsed.setUTCDate(Math.min(day, lastDay));
  } else {
    parsed.setUTCDate(parsed.getUTCDate() - settings.calendarDays);
  }
  return parsed.toISOString().slice(0, 10);
}

function selectObservationAtOrBefore(
  observationsNewestFirst: YieldObservation[],
  target: string,
  maxLagCalendarDays: number
) {
  const selected = observationsNewestFirst.find((item) => item.date <= target);
  if (!selected) return null;
  const lag =
    (new Date(`${target}T00:00:00Z`).getTime() -
      new Date(`${selected.date}T00:00:00Z`).getTime()) /
    86400000;
  return lag <= maxLagCalendarDays ? selected : null;
}

function selectSnapshot(
  observationsNewestFirst: YieldObservation[],
  horizon: YieldHorizon,
  now: Date
) {
  const latest = observationsNewestFirst[0];
  if (!latest) return null;
  const latestAge =
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
      new Date(`${latest.date}T00:00:00Z`).getTime()) /
    86400000;
  if (latestAge > 7) return null;
  if (horizon === "oneDay") {
    const previous = observationsNewestFirst[1] ?? null;
    if (!previous) return null;
    const age =
      (new Date(`${latest.date}T00:00:00Z`).getTime() -
        new Date(`${previous.date}T00:00:00Z`).getTime()) /
      86400000;
    return age <= 7 ? previous : null;
  }
  const target = targetDate(latest.date, horizon);
  const selected = selectObservationAtOrBefore(
    observationsNewestFirst,
    target,
    HORIZON_SETTINGS[horizon].maxLagCalendarDays
  );
  return selected;
}

export function calculateBasisPointChange(
  currentYieldPercent: number | null,
  previousYieldPercent: number | null
) {
  if (
    currentYieldPercent === null ||
    previousYieldPercent === null ||
    !Number.isFinite(currentYieldPercent) ||
    !Number.isFinite(previousYieldPercent)
  ) {
    return null;
  }
  return Number(((currentYieldPercent - previousYieldPercent) * 100).toFixed(2));
}

function findHistoricalComparison(
  observationsNewestFirst: YieldObservation[],
  currentIndex: number,
  horizon: YieldHorizon
) {
  const current = observationsNewestFirst[currentIndex];
  if (!current) return null;
  if (horizon === "oneDay") return observationsNewestFirst[currentIndex + 1] ?? null;
  const target = targetDate(current.date, horizon);
  return selectObservationAtOrBefore(
    observationsNewestFirst.slice(currentIndex + 1),
    target,
    HORIZON_SETTINGS[horizon].maxLagCalendarDays
  );
}

function historicalChanges(
  observationsNewestFirst: YieldObservation[],
  horizon: YieldHorizon
): DatedChange[] {
  const changes: DatedChange[] = [];
  for (let index = 0; index < observationsNewestFirst.length; index++) {
    const current = observationsNewestFirst[index];
    const previous = findHistoricalComparison(observationsNewestFirst, index, horizon);
    if (!current || !previous) continue;
    const change = calculateBasisPointChange(current.value, previous.value);
    if (change !== null) changes.push({ date: current.date, value: change });
  }
  return changes;
}

function scoreDirection(score: number | null): {
  direction: YieldDirection;
  arrow: string;
} {
  if (score === null) return { direction: "UNAVAILABLE", arrow: "" };
  if (score >= 2) return { direction: "UNUSUALLY LARGE RISE", arrow: "↑↑" };
  if (score === 1) return { direction: "RISE", arrow: "↑" };
  if (score <= -2) return { direction: "UNUSUALLY LARGE DECLINE", arrow: "↓↓" };
  if (score === -1) return { direction: "DECLINE", arrow: "↓" };
  return { direction: "STABLE", arrow: "→" };
}

function classifyCurveChange(change: number | null): CurveDirection {
  if (change === null || !Number.isFinite(change)) return "UNAVAILABLE";
  if (Math.abs(change) <= US_RATES_CALIBRATION_CONFIG.stableCurveChangeBasisPoints) {
    return "STABLE";
  }
  return change > 0 ? "STEEPENING" : "FLATTENING";
}

function calibrateYieldMove(
  latestMove: number,
  latestDate: string,
  historicalChangesNewestFirst: DatedChange[],
  fallbackThresholds: { moderate: number; strong: number }
) {
  const asOf = new Date(`${latestDate}T00:00:00Z`);
  const oldestDate = new Date(asOf);
  oldestDate.setUTCFullYear(
    oldestDate.getUTCFullYear() - US_RATES_CALIBRATION_CONFIG.historicalWindowYears
  );
  const sample = historicalChangesNewestFirst
    .filter((change) => {
      const date = new Date(`${change.date}T00:00:00Z`);
      return (
        date < asOf &&
        date >= oldestDate &&
        Number.isFinite(change.value)
      );
    })
    .map((change) => change.value);

  if (sample.length < US_RATES_CALIBRATION_CONFIG.minimumDailyObservations) {
    const magnitude = Math.abs(latestMove);
    const score: -2 | -1 | 0 | 1 | 2 =
      magnitude >= fallbackThresholds.strong
        ? latestMove > 0
          ? 2
          : -2
        : magnitude >= fallbackThresholds.moderate
          ? latestMove > 0
            ? 1
            : -1
          : 0;
    return {
      score,
      method: "fallback" as const,
      sampleSize: sample.length,
      percentileRank: null,
    };
  }

  const below = sample.filter((value) => value < latestMove).length;
  const tied = sample.filter((value) => value === latestMove).length;
  const percentileRank = (below + tied / 2) / sample.length;
  const score: -2 | -1 | 0 | 1 | 2 =
    percentileRank <= US_RATES_CALIBRATION_CONFIG.unusualLowerPercentile
      ? -2
      : percentileRank <= US_RATES_CALIBRATION_CONFIG.meaningfulLowerPercentile
        ? -1
        : percentileRank >= US_RATES_CALIBRATION_CONFIG.unusualUpperPercentile
          ? 2
          : percentileRank >= US_RATES_CALIBRATION_CONFIG.meaningfulUpperPercentile
            ? 1
            : 0;
  return {
    score,
    method: "historical" as const,
    sampleSize: sample.length,
    percentileRank,
  };
}

function buildCurveDateSeries(observations: YieldObservationMap) {
  const seriesMaps = Object.fromEntries(
    Object.entries(observations).map(([maturity, rows]) => [
      maturity,
      new Map(rows.map((observation) => [observation.date, observation.value])),
    ])
  ) as Record<TreasuryMaturity, Map<string, number>>;
  const commonDates = [...seriesMaps["2Y"].keys()]
    .filter((date) => Object.values(seriesMaps).every((series) => series.has(date)))
    .sort((a, b) => b.localeCompare(a));
  return commonDates.map((date) => ({
    date,
    values: {
      "2Y": seriesMaps["2Y"].get(date)!,
      "5Y": seriesMaps["5Y"].get(date)!,
      "10Y": seriesMaps["10Y"].get(date)!,
      "30Y": seriesMaps["30Y"].get(date)!,
    },
  }));
}

function buildCurveResult(
  curveDates: ReturnType<typeof buildCurveDateSeries>,
  shortMaturity: "2Y" | "5Y",
  longMaturity: "10Y" | "30Y"
): YieldCurveResult {
  const latest = curveDates[0];
  const currentSpread = latest
    ? calculateBasisPointChange(
        latest.values[longMaturity],
        latest.values[shortMaturity]
      )
    : null;
  const changes = {} as YieldCurveResult["changes"];
  for (const horizon of CURVE_HORIZONS) {
    let comparison = null;
    if (latest) {
      if (horizon === "oneDay") {
        comparison = curveDates[1] ?? null;
      } else {
        const target = targetDate(latest.date, horizon);
        comparison = selectObservationAtOrBefore(
          curveDates.map((row) => ({ date: row.date, value: 0 })),
          target,
          HORIZON_SETTINGS[horizon].maxLagCalendarDays
        );
        if (comparison) {
          comparison = curveDates.find((row) => row.date === comparison!.date) ?? null;
        }
      }
    }
    const priorSpread =
      comparison === null
        ? null
        : calculateBasisPointChange(
            comparison.values[longMaturity],
            comparison.values[shortMaturity]
          );
    const change =
      currentSpread === null || priorSpread === null
        ? null
        : Number((currentSpread - priorSpread).toFixed(2));
    changes[horizon] = {
      changeBasisPoints: change,
      comparisonDate: comparison?.date ?? null,
      direction: classifyCurveChange(change),
    };
  }
  return {
    currentSpreadBasisPoints: currentSpread,
    currentDate: latest?.date ?? null,
    changes,
  };
}

function unavailableChange(): YieldChange {
  return {
    changeBasisPoints: null,
    comparisonDate: null,
    direction: "UNAVAILABLE",
    arrow: "",
    calibration: { method: "unavailable", sampleSize: 0, percentileRank: null },
  };
}

export function calculateUsRatesYieldCurve({
  observations,
  now = new Date(),
}: {
  observations: Record<TreasuryMaturity, YieldObservation[]>;
  now?: Date;
}): UsRatesYieldCurveResult {
  const asOfDate = now.toISOString().slice(0, 10);
  const normalized = Object.fromEntries(
    (Object.keys(US_TREASURY_SERIES) as TreasuryMaturity[]).map((maturity) => [
      maturity,
      normalizeObservations(observations[maturity] ?? []).filter(
        (observation) => observation.date <= asOfDate
      ),
    ])
  ) as YieldObservationMap;

  const maturities = {} as UsRatesYieldCurveResult["maturities"];
  for (const maturity of Object.keys(US_TREASURY_SERIES) as TreasuryMaturity[]) {
    const series = normalized[maturity];
    const latest = series[0] ?? null;
    const ageDays = latest
      ? Math.floor(
          (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
            new Date(`${latest.date}T00:00:00Z`).getTime()) /
            86400000
        )
      : null;
    const changes = {} as Record<YieldHorizon, YieldChange>;
    for (const horizon of YIELD_HORIZONS) {
      const comparison = selectSnapshot(series, horizon, now);
      const changeBasisPoints = calculateBasisPointChange(
        latest?.value ?? null,
        comparison?.value ?? null
      );
      if (changeBasisPoints === null || !latest || !comparison) {
        changes[horizon] = unavailableChange();
        continue;
      }
      const calibration = calibrateYieldMove(
        changeBasisPoints,
        latest.date,
        historicalChanges(series, horizon),
        US_RATES_CALIBRATION_CONFIG.fallbackThresholdsBasisPoints[maturity][horizon]
      );
      const classified = scoreDirection(calibration.score);
      changes[horizon] = {
        changeBasisPoints,
        comparisonDate: comparison.date,
        direction: classified.direction,
        arrow: classified.arrow,
        calibration: {
          method: calibration.method,
          sampleSize: calibration.sampleSize,
          percentileRank: calibration.percentileRank,
        },
      };
    }
    maturities[maturity] = {
      series: US_TREASURY_SERIES[maturity],
      source: "FRED",
      unit: "%",
      latest: {
        value: latest?.value ?? null,
        date: latest?.date ?? null,
        status:
          latest === null
            ? "unavailable"
            : ageDays !== null && ageDays > 7
              ? "stale"
              : "current",
        ageDays,
      },
      changes,
    };
  }

  const curveDates = buildCurveDateSeries(normalized);
  const yieldCurve = {
    "2Y-10Y": buildCurveResult(curveDates, "2Y", "10Y"),
    "2Y-30Y": buildCurveResult(curveDates, "2Y", "30Y"),
    "5Y-30Y": buildCurveResult(curveDates, "5Y", "30Y"),
  };

  const front = maturities["2Y"].changes.oneDay.changeBasisPoints;
  const tenYear = maturities["10Y"].changes.oneDay.changeBasisPoints;
  const thirtyYear = maturities["30Y"].changes.oneDay.changeBasisPoints;
  const longEnd =
    tenYear === null || thirtyYear === null
      ? null
      : Number(((tenYear + thirtyYear) / 2).toFixed(2));
  let frontEndVsLongEnd = "Front-end or long-end movement unavailable.";
  if (front !== null && tenYear !== null) {
    const frontDirection = Math.sign(front);
    const tenYearDirection = Math.sign(tenYear);
    if (frontDirection > 0 && tenYearDirection > 0) {
      frontEndVsLongEnd = "2Y ↑ / 10Y ↑";
    } else if (frontDirection < 0 && tenYearDirection < 0) {
      frontEndVsLongEnd = "2Y ↓ / 10Y ↓";
    } else if (frontDirection < 0 && tenYearDirection > 0) {
      frontEndVsLongEnd = "2Y ↓ / 10Y ↑";
    } else if (frontDirection > 0 && tenYearDirection < 0) {
      frontEndVsLongEnd = "2Y ↑ / 10Y ↓";
    } else {
      frontEndVsLongEnd = "2Y / 10Y mixed or stable.";
    }
  }
  const dailyMoves = (Object.keys(US_TREASURY_SERIES) as TreasuryMaturity[])
    .map((maturity) => ({
      maturity,
      change: maturities[maturity].changes.oneDay.changeBasisPoints,
    }))
    .filter(
      (entry): entry is { maturity: TreasuryMaturity; change: number } =>
        entry.change !== null
    );
  const largest = dailyMoves.sort(
    (a, b) => Math.abs(b.change) - Math.abs(a.change)
  )[0];

  return {
    source: "FRED",
    unit: "percent yield; changes and spreads in basis points",
    generatedAt: now.toISOString(),
    historyLimitPerSeries: US_RATES_CALIBRATION_CONFIG.historyLimit,
    maturities,
    yieldCurve,
    summary: {
      frontEndVsLongEnd,
      frontEndChangeBasisPoints: front,
      tenYearChangeBasisPoints: tenYear,
      thirtyYearChangeBasisPoints: thirtyYear,
      longEndChangeBasisPoints: longEnd,
      longEndDominates:
        front === null || longEnd === null
          ? null
          : tenYear === null || thirtyYear === null
            ? null
            : (Math.abs(tenYear) + Math.abs(thirtyYear)) / 2 > Math.abs(front),
      curveDirection: yieldCurve["2Y-10Y"].changes.oneDay.direction,
      largestMove: {
        maturity: largest?.maturity ?? null,
        changeBasisPoints: largest?.change ?? null,
        horizon: "1D",
      },
    },
  };
}
