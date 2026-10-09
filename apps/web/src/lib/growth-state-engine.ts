export type GrowthDirection = "up" | "down" | "flat";

export type GrowthStateInput = {
  gdp: {
    latest: { qoqAnnualized: number | null };
    recentHistory: Array<{ qoqAnnualized: number | null }>;
  };
  realPce: {
    latest: { yoy: number | null };
    direction3m: GrowthDirection;
    direction6m: GrowthDirection;
  };
  industrialProduction: {
    latest: { yoy: number | null };
    direction3m: GrowthDirection;
    direction6m: GrowthDirection;
  };
  retailSales: {
    latest: { yoy: number | null };
    direction3m: GrowthDirection;
    direction6m: GrowthDirection;
  };
  ismManufacturing: {
    components: {
      manufacturingPmi: { value: number | null; previousValue: number | null };
      newOrders: { value: number | null; previousValue: number | null };
    };
  } | null;
  ismServices: {
    components: {
      servicesPmi: { value: number | null; previousValue: number | null };
      businessActivity: { value: number | null; previousValue: number | null };
      newOrders: { value: number | null; previousValue: number | null };
    };
  } | null;
};

export type GrowthAssessment = {
  state:
    | "STRONG EXPANSION"
    | "EXPANSION"
    | "WEAK EXPANSION"
    | "STAGNATION"
    | "CONTRACTION"
    | "UNAVAILABLE";
  momentum: "ACCELERATING" | "IMPROVING" | "STABLE" | "SLOWING" | "DETERIORATING";
  momentumArrow: "↑↑" | "↑" | "→" | "↓" | "↓↓";
  forwardGrowth: "STRONGLY POSITIVE" | "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "STRONGLY NEGATIVE";
  forwardArrow: "↑" | "→" | "↓";
  explanations: {
    state: string;
    momentum: string;
    forwardGrowth: string;
  };
  positiveDrivers: string[];
  negativeDrivers: string[];
};

export const GROWTH_ENGINE_THRESHOLDS = {
  state: {
    strongExpansion: 1.5,
    expansion: 0.45,
    weakExpansion: 0.12,
    stagnation: -0.3,
    strongExpansionSignalScore: 2,
    strongExpansionMinimumSignals: 3,
  },
  momentum: {
    accelerating: 0.72,
    improving: 0.22,
    slowing: -0.12,
    deteriorating: -0.72,
  },
  forwardGrowth: {
    stronglyPositive: 0.85,
    positive: 0.25,
    negative: -0.25,
    stronglyNegative: -0.85,
  },
} as const;

export const GROWTH_ENGINE_WEIGHTS = {
  state: {
    gdp: 2.5,
    realPce: 1.5,
    industrialProduction: 1,
    retailSales: 1,
    manufacturingPmi: 1,
    servicesPmi: 1.5,
  },
  momentum: {
    gdp: 2,
    realPce3m: 1.5,
    realPce6m: 0.75,
    industrialProduction3m: 1.25,
    industrialProduction6m: 0.75,
    retailSales3m: 1.25,
    retailSales6m: 0.75,
    manufacturingPmi: 1,
    servicesPmi: 1.25,
    servicesBusinessActivity: 0.75,
  },
  forwardGrowth: {
    manufacturingNewOrders: 2,
    servicesNewOrders: 2,
    manufacturingPmiDirection: 1,
    servicesPmiDirection: 1.25,
    servicesBusinessActivity: 1,
  },
} as const;

type Signal = { label: string; score: number; weight: number };

function weightedScore(signals: Signal[]) {
  const available = signals.filter((signal) => Number.isFinite(signal.score));
  const totalWeight = available.reduce((sum, signal) => sum + signal.weight, 0);
  if (!totalWeight) return null;
  return available.reduce((sum, signal) => sum + signal.score * signal.weight, 0) / totalWeight;
}

function growthRateScore(value: number | null, unit: "quarterly" | "annual"): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (unit === "quarterly") {
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

function pmiLevelScore(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  if (value >= 55) return 2;
  if (value >= 52) return 1;
  if (value >= 50) return 0.5;
  if (value >= 48) return 0;
  if (value >= 45) return -1;
  return -2;
}

function changeScore(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  const change = current - previous;
  if (change >= 1.5) return 2;
  if (change >= 0.25) return 1;
  if (change <= -1.5) return -2;
  if (change <= -0.25) return -1;
  return 0;
}

function directionScore(direction: GrowthDirection): number {
  return direction === "up" ? 1 : direction === "down" ? -1 : 0;
}

function classifyDirection(signals: Signal[], cutoffs: { upper: number; middle: number }) {
  const score = weightedScore(signals);
  if (score === null) return { score: 0, available: false };
  return {
    score,
    available: true,
    category: score >= cutoffs.upper ? "up" : score >= cutoffs.middle ? "flat" : "down",
  };
}

function leadingDrivers(signals: Signal[]) {
  const scored = signals
    .filter((signal) => signal.score !== 0 && Number.isFinite(signal.score))
    .map((signal) => ({ ...signal, impact: signal.score * signal.weight }));
  return {
    positive: scored
      .filter((signal) => signal.impact > 0)
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 2)
      .map((signal) => signal.label),
    negative: scored
      .filter((signal) => signal.impact < 0)
      .sort((a, b) => a.impact - b.impact)
      .slice(0, 2)
      .map((signal) => signal.label),
  };
}

export function calculateGrowthState(growth: GrowthStateInput): GrowthAssessment {
  const weights = GROWTH_ENGINE_WEIGHTS;
  const manufacturing = growth.ismManufacturing?.components;
  const services = growth.ismServices?.components;
  const gdpCurrent = growth.gdp.latest.qoqAnnualized;
  const gdpPrevious = growth.gdp.recentHistory[1]?.qoqAnnualized ?? null;

  const stateSignals: Signal[] = [
    {
      label: "Real GDP",
      score: growthRateScore(gdpCurrent, "quarterly") ?? 0,
      weight: weights.state.gdp,
    },
    {
      label: "Real consumer spending",
      score: growthRateScore(growth.realPce.latest.yoy, "annual") ?? 0,
      weight: weights.state.realPce,
    },
    {
      label: "Industrial production",
      score: growthRateScore(growth.industrialProduction.latest.yoy, "annual") ?? 0,
      weight: weights.state.industrialProduction,
    },
    {
      label: "Retail sales",
      score: growthRateScore(growth.retailSales.latest.yoy, "annual") ?? 0,
      weight: weights.state.retailSales,
    },
    {
      label: "Manufacturing PMI",
      score: pmiLevelScore(manufacturing?.manufacturingPmi.value ?? null) ?? 0,
      weight: weights.state.manufacturingPmi,
    },
    {
      label: "Services PMI",
      score: pmiLevelScore(services?.servicesPmi.value ?? null) ?? 0,
      weight: weights.state.servicesPmi,
    },
  ].filter((signal) => {
    const values: Record<string, number | null> = {
      "Real GDP": gdpCurrent,
      "Real consumer spending": growth.realPce.latest.yoy,
      "Industrial production": growth.industrialProduction.latest.yoy,
      "Retail sales": growth.retailSales.latest.yoy,
      "Manufacturing PMI": manufacturing?.manufacturingPmi.value ?? null,
      "Services PMI": services?.servicesPmi.value ?? null,
    };
    return values[signal.label] !== null;
  });
  const stateScore = weightedScore(stateSignals);
  const strongExpansionSignalLabels = new Set(
    stateSignals
      .filter(
        (signal) =>
          signal.score >=
          GROWTH_ENGINE_THRESHOLDS.state.strongExpansionSignalScore
      )
      .map((signal) => signal.label)
  );
  const hasStrongGdp =
    strongExpansionSignalLabels.has("Real GDP");
  const hasStrongRealActivity = [
    "Real consumer spending",
    "Industrial production",
    "Retail sales",
  ].some((label) => strongExpansionSignalLabels.has(label));
  const hasStrongSurvey = [
    "Manufacturing PMI",
    "Services PMI",
  ].some((label) => strongExpansionSignalLabels.has(label));
  const hasBroadStrongConfirmation =
    strongExpansionSignalLabels.size >=
      GROWTH_ENGINE_THRESHOLDS.state.strongExpansionMinimumSignals &&
    hasStrongGdp &&
    hasStrongRealActivity &&
    hasStrongSurvey;
  const state =
    stateScore === null
      ? "UNAVAILABLE"
      : stateScore >= GROWTH_ENGINE_THRESHOLDS.state.strongExpansion &&
          hasBroadStrongConfirmation
        ? "STRONG EXPANSION"
        : stateScore >= GROWTH_ENGINE_THRESHOLDS.state.expansion
          ? "EXPANSION"
          : stateScore >= GROWTH_ENGINE_THRESHOLDS.state.weakExpansion
            ? "WEAK EXPANSION"
            : stateScore > GROWTH_ENGINE_THRESHOLDS.state.stagnation
              ? "STAGNATION"
              : "CONTRACTION";

  const momentumSignals: Signal[] = [
    {
      label: "GDP growth rate",
      score: changeScore(gdpCurrent, gdpPrevious) ?? 0,
      weight: weights.momentum.gdp,
    },
    {
      label: "Real consumer spending (3M)",
      score: directionScore(growth.realPce.direction3m),
      weight: weights.momentum.realPce3m,
    },
    {
      label: "Real consumer spending (6M)",
      score: directionScore(growth.realPce.direction6m),
      weight: weights.momentum.realPce6m,
    },
    {
      label: "Industrial production (3M)",
      score: directionScore(growth.industrialProduction.direction3m),
      weight: weights.momentum.industrialProduction3m,
    },
    {
      label: "Industrial production (6M)",
      score: directionScore(growth.industrialProduction.direction6m),
      weight: weights.momentum.industrialProduction6m,
    },
    {
      label: "Retail sales (3M)",
      score: directionScore(growth.retailSales.direction3m),
      weight: weights.momentum.retailSales3m,
    },
    {
      label: "Retail sales (6M)",
      score: directionScore(growth.retailSales.direction6m),
      weight: weights.momentum.retailSales6m,
    },
    {
      label: "Manufacturing PMI change",
      score:
        changeScore(
          manufacturing?.manufacturingPmi.value ?? null,
          manufacturing?.manufacturingPmi.previousValue ?? null,
        ) ?? 0,
      weight: weights.momentum.manufacturingPmi,
    },
    {
      label: "Services PMI change",
      score:
        changeScore(
          services?.servicesPmi.value ?? null,
          services?.servicesPmi.previousValue ?? null,
        ) ?? 0,
      weight: weights.momentum.servicesPmi,
    },
    {
      label: "Services business activity change",
      score:
        changeScore(
          services?.businessActivity.value ?? null,
          services?.businessActivity.previousValue ?? null,
        ) ?? 0,
      weight: weights.momentum.servicesBusinessActivity,
    },
  ];
  const momentumResult = classifyDirection(momentumSignals, {
    upper: GROWTH_ENGINE_THRESHOLDS.momentum.improving,
    middle: GROWTH_ENGINE_THRESHOLDS.momentum.slowing,
  });
  const momentum = !momentumResult.available
    ? "STABLE"
    : momentumResult.score >= GROWTH_ENGINE_THRESHOLDS.momentum.accelerating
      ? "ACCELERATING"
      : momentumResult.score >= GROWTH_ENGINE_THRESHOLDS.momentum.improving
        ? "IMPROVING"
        : momentumResult.score > GROWTH_ENGINE_THRESHOLDS.momentum.slowing
          ? "STABLE"
          : momentumResult.score > GROWTH_ENGINE_THRESHOLDS.momentum.deteriorating
            ? "SLOWING"
            : "DETERIORATING";
  const momentumArrow = {
    ACCELERATING: "↑↑",
    IMPROVING: "↑",
    STABLE: "→",
    SLOWING: "↓",
    DETERIORATING: "↓↓",
  }[momentum] as GrowthAssessment["momentumArrow"];

  const forwardSignals: Signal[] = [
    {
      label: "Manufacturing new orders",
      score: pmiLevelScore(manufacturing?.newOrders.value ?? null) ?? 0,
      weight: weights.forwardGrowth.manufacturingNewOrders,
    },
    {
      label: "Services new orders",
      score: pmiLevelScore(services?.newOrders.value ?? null) ?? 0,
      weight: weights.forwardGrowth.servicesNewOrders,
    },
    {
      label: "Manufacturing PMI direction",
      score:
        changeScore(
          manufacturing?.manufacturingPmi.value ?? null,
          manufacturing?.manufacturingPmi.previousValue ?? null,
        ) ?? 0,
      weight: weights.forwardGrowth.manufacturingPmiDirection,
    },
    {
      label: "Services PMI direction",
      score:
        changeScore(
          services?.servicesPmi.value ?? null,
          services?.servicesPmi.previousValue ?? null,
        ) ?? 0,
      weight: weights.forwardGrowth.servicesPmiDirection,
    },
    {
      label: "Services business activity",
      score:
        changeScore(
          services?.businessActivity.value ?? null,
          services?.businessActivity.previousValue ?? null,
        ) ?? 0,
      weight: weights.forwardGrowth.servicesBusinessActivity,
    },
  ].filter((signal) => {
    const valid = new Set([
      ...(manufacturing?.newOrders.value == null ? [] : ["Manufacturing new orders"]),
      ...(services?.newOrders.value == null ? [] : ["Services new orders"]),
      ...(manufacturing?.manufacturingPmi.value == null ||
      manufacturing.manufacturingPmi.previousValue == null
        ? []
        : ["Manufacturing PMI direction"]),
      ...(services?.servicesPmi.value == null || services.servicesPmi.previousValue == null
        ? []
        : ["Services PMI direction"]),
      ...(services?.businessActivity.value == null ||
      services.businessActivity.previousValue == null
        ? []
        : ["Services business activity"]),
    ]);
    return valid.has(signal.label);
  });
  const forwardScore = weightedScore(forwardSignals) ?? 0;
  const forwardGrowth =
    forwardScore >= GROWTH_ENGINE_THRESHOLDS.forwardGrowth.stronglyPositive
      ? "STRONGLY POSITIVE"
      : forwardScore >= GROWTH_ENGINE_THRESHOLDS.forwardGrowth.positive
        ? "POSITIVE"
        : forwardScore > GROWTH_ENGINE_THRESHOLDS.forwardGrowth.negative
          ? "NEUTRAL"
          : forwardScore > GROWTH_ENGINE_THRESHOLDS.forwardGrowth.stronglyNegative
            ? "NEGATIVE"
            : "STRONGLY NEGATIVE";
  const forwardArrow = forwardGrowth.includes("POSITIVE")
    ? "↑"
    : forwardGrowth.includes("NEGATIVE")
      ? "↓"
      : "→";
  const stateDrivers = leadingDrivers(stateSignals);
  const momentumDrivers = leadingDrivers(momentumSignals);
  const forwardDrivers = leadingDrivers(forwardSignals);

  return {
    state,
    momentum,
    momentumArrow,
    forwardGrowth,
    forwardArrow,
    explanations: {
      state:
        stateScore === null
          ? "Current growth state is unavailable because no current-state indicators are available."
          : `${state} reflects the balance of current GDP, consumer spending, production, retail activity, and PMI levels.${stateDrivers.positive[0] ? ` Strongest positive: ${stateDrivers.positive[0]}.` : ""}${stateDrivers.negative[0] ? ` Strongest negative: ${stateDrivers.negative[0]}.` : ""}`,
      momentum: `${momentum} reflects recent changes across GDP, 3M/6M activity trends, and PMI movement.${momentumDrivers.positive[0] ? ` Improving: ${momentumDrivers.positive[0]}.` : ""}${momentumDrivers.negative[0] ? ` Weakening: ${momentumDrivers.negative[0]}.` : ""}`,
      forwardGrowth: `${forwardGrowth} is led by new orders and current survey direction.${forwardDrivers.positive[0] ? ` Strongest positive: ${forwardDrivers.positive[0]}.` : ""}${forwardDrivers.negative[0] ? ` Strongest negative: ${forwardDrivers.negative[0]}.` : ""}`,
    },
    positiveDrivers: [...new Set([...stateDrivers.positive, ...forwardDrivers.positive])].slice(
      0,
      3,
    ),
    negativeDrivers: [...new Set([...stateDrivers.negative, ...forwardDrivers.negative])].slice(
      0,
      3,
    ),
  };
}
