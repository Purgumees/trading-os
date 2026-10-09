import type { FedRepricing } from "@/lib/fed-pricing";
import type { YieldChange } from "@/lib/us-rates-yield-curve-engine";

export type ConfirmationState =
  | "STRONG CONFIRMATION"
  | "CONFIRMATION"
  | "MIXED / WEAK"
  | "DIVERGENCE"
  | "STRONG DIVERGENCE"
  | "UNAVAILABLE";

export type OverallConfirmationState =
  | "STRONGLY CONFIRMED"
  | "CONFIRMED"
  | "MIXED"
  | "DIVERGING"
  | "STRONGLY DIVERGING"
  | "INSUFFICIENT DATA";

export const FED_REPRICING_YIELD_CONFIRMATION_CONFIG = {
  horizonWeights: {
    oneDay: 1,
    oneWeek: 3,
    oneMonth: 2,
  },
  overallStrongThreshold: 1.5,
  overallDirectionalThreshold: 0.5,
} as const;

type ConfirmationHorizon = "oneDay" | "oneWeek" | "oneMonth";
type ConfirmationFedRepricing = Pick<FedRepricing, "state" | "arrow">;
type ConfirmationYieldChange = Pick<
  YieldChange,
  "changeBasisPoints" | "direction" | "arrow"
>;

type HorizonResult = {
  horizon: ConfirmationHorizon;
  fedState: FedRepricing["state"];
  fedArrow: FedRepricing["arrow"];
  twoYearChangeBasisPoints: number | null;
  twoYearDirection: YieldChange["direction"];
  twoYearArrow: string;
  state: ConfirmationState;
  explanation: string;
};

export type FedRepricingYieldConfirmation = {
  source: "Polymarket Fed expectations + FRED US 2Y Treasury yield";
  meetingDate: string | null;
  meetingLabel: string | null;
  status: "available" | "unavailable";
  horizons: Record<ConfirmationHorizon, HorizonResult>;
  overall: OverallConfirmationState;
  primaryHorizon: "1W";
  explanation: string;
};

const HORIZON_CONFIG = [
  {
    key: "oneDay",
    label: "1D",
    fedKey: "oneDay" as const,
    ratesKey: "oneDay" as const,
  },
  {
    key: "oneWeek",
    label: "1W",
    fedKey: "oneWeek" as const,
    ratesKey: "oneWeek" as const,
  },
  {
    key: "oneMonth",
    label: "1M",
    fedKey: "oneMonth" as const,
    ratesKey: "oneMonth" as const,
  },
] as const;

function fedDirection(state: FedRepricing["state"]): -1 | 0 | 1 | null {
  if (state === "UNAVAILABLE") return null;
  if (state === "HAWKISH" || state === "STRONGLY HAWKISH") return 1;
  if (state === "DOVISH" || state === "STRONGLY DOVISH") return -1;
  return 0;
}

function fedMagnitude(state: FedRepricing["state"]): "strong" | "ordinary" | "neutral" {
  if (state === "STRONGLY HAWKISH" || state === "STRONGLY DOVISH") return "strong";
  if (state === "HAWKISH" || state === "DOVISH") return "ordinary";
  return "neutral";
}

function yieldDirection(direction: ConfirmationYieldChange["direction"]): -1 | 0 | 1 | null {
  if (direction === "UNAVAILABLE") return null;
  if (direction === "RISE" || direction === "UNUSUALLY LARGE RISE") return 1;
  if (direction === "DECLINE" || direction === "UNUSUALLY LARGE DECLINE") return -1;
  return 0;
}

function yieldMagnitude(
  direction: ConfirmationYieldChange["direction"]
): "strong" | "ordinary" | "neutral" {
  if (
    direction === "UNUSUALLY LARGE RISE" ||
    direction === "UNUSUALLY LARGE DECLINE"
  ) {
    return "strong";
  }
  if (direction === "RISE" || direction === "DECLINE") return "ordinary";
  return "neutral";
}

function describeFed(state: FedRepricing["state"]) {
  switch (state) {
    case "STRONGLY HAWKISH":
      return "Polymarket Fed expectations repriced strongly hawkishly";
    case "HAWKISH":
      return "Polymarket Fed expectations repriced hawkishly";
    case "STRONGLY DOVISH":
      return "Polymarket Fed expectations repriced strongly dovishly";
    case "DOVISH":
      return "Polymarket Fed expectations repriced dovishly";
    case "LITTLE / NO REPRICING":
      return "Polymarket Fed expectations showed little or no repricing";
    case "UNAVAILABLE":
      return "Polymarket Fed repricing is unavailable";
  }
}

function describeYield(change: ConfirmationYieldChange) {
  if (change.direction === "UNAVAILABLE" || change.changeBasisPoints === null) {
    return "the US 2Y move is unavailable";
  }
  if (change.direction === "STABLE") return "the US 2Y yield was essentially stable";
  return `the US 2Y yield ${change.changeBasisPoints > 0 ? "rose" : "declined"} ${Math.abs(change.changeBasisPoints)} bp`;
}

function classifyHorizon(
  horizon: ConfirmationHorizon,
  repricing: ConfirmationFedRepricing,
  twoYear: ConfirmationYieldChange
): HorizonResult {
  const fedTrend = fedDirection(repricing.state);
  const yieldTrend = yieldDirection(twoYear.direction);
  let state: ConfirmationState = "UNAVAILABLE";
  if (fedTrend !== null && yieldTrend !== null) {
    if (fedTrend === 0 || yieldTrend === 0) {
      state = "MIXED / WEAK";
    } else if (fedTrend === yieldTrend) {
      state =
        fedMagnitude(repricing.state) === "strong" &&
        yieldMagnitude(twoYear.direction) === "strong"
          ? "STRONG CONFIRMATION"
          : "CONFIRMATION";
    } else {
      state =
        fedMagnitude(repricing.state) === "strong" &&
        yieldMagnitude(twoYear.direction) === "strong"
          ? "STRONG DIVERGENCE"
          : "DIVERGENCE";
    }
  }

  let explanation: string;
  if (state === "UNAVAILABLE") {
    explanation = `${describeFed(repricing.state)}; ${describeYield(twoYear)}. Confirmation is unavailable because both inputs are required.`;
  } else if (state === "MIXED / WEAK") {
    explanation = `${describeFed(repricing.state)}; ${describeYield(twoYear)}. One side is neutral, so this is mixed or weak rather than forced confirmation or divergence.`;
  } else if (state === "CONFIRMATION" || state === "STRONG CONFIRMATION") {
    explanation = `${describeFed(repricing.state)} and ${describeYield(twoYear)} over the same horizon. Front-end rates confirm the prediction-market repricing.`;
  } else {
    explanation = `${describeFed(repricing.state)}, but ${describeYield(twoYear)} over the same horizon. Front-end rates diverge from the prediction-market repricing.`;
  }
  return {
    horizon,
    fedState: repricing.state,
    fedArrow: repricing.arrow,
    twoYearChangeBasisPoints: twoYear.changeBasisPoints,
    twoYearDirection: twoYear.direction,
    twoYearArrow: twoYear.arrow,
    state,
    explanation,
  };
}

function horizonScore(state: ConfirmationState) {
  switch (state) {
    case "STRONG CONFIRMATION":
      return 2;
    case "CONFIRMATION":
      return 1;
    case "DIVERGENCE":
      return -1;
    case "STRONG DIVERGENCE":
      return -2;
    case "MIXED / WEAK":
    case "UNAVAILABLE":
      return 0;
  }
}

function aggregateOverall(horizons: Record<ConfirmationHorizon, HorizonResult>) {
  const available = HORIZON_CONFIG.filter(
    ({ key }) => horizons[key].state !== "UNAVAILABLE"
  );
  if (available.length === 0) return "INSUFFICIENT DATA" as const;

  const weekState = horizons.oneWeek.state;
  const otherHorizons = [horizons.oneDay.state, horizons.oneMonth.state];
  const strongOpposition =
    (weekState === "STRONG CONFIRMATION" &&
      otherHorizons.includes("STRONG DIVERGENCE")) ||
    (weekState === "STRONG DIVERGENCE" &&
      otherHorizons.includes("STRONG CONFIRMATION"));
  if (!strongOpposition && weekState === "STRONG CONFIRMATION") {
    return "STRONGLY CONFIRMED" as const;
  }
  if (!strongOpposition && weekState === "STRONG DIVERGENCE") {
    return "STRONGLY DIVERGING" as const;
  }

  const totalWeight = available.reduce(
    (sum, { key }) => sum + FED_REPRICING_YIELD_CONFIRMATION_CONFIG.horizonWeights[key],
    0
  );
  const weightedScore = available.reduce(
    (sum, { key }) =>
      sum +
      horizonScore(horizons[key].state) *
        FED_REPRICING_YIELD_CONFIRMATION_CONFIG.horizonWeights[key],
    0
  );
  const average = weightedScore / totalWeight;
  if (average >= FED_REPRICING_YIELD_CONFIRMATION_CONFIG.overallStrongThreshold) {
    return "STRONGLY CONFIRMED" as const;
  }
  if (average >= FED_REPRICING_YIELD_CONFIRMATION_CONFIG.overallDirectionalThreshold) {
    return "CONFIRMED" as const;
  }
  if (average <= -FED_REPRICING_YIELD_CONFIRMATION_CONFIG.overallStrongThreshold) {
    return "STRONGLY DIVERGING" as const;
  }
  if (average <= -FED_REPRICING_YIELD_CONFIRMATION_CONFIG.overallDirectionalThreshold) {
    return "DIVERGING" as const;
  }
  return "MIXED" as const;
}

export function calculateFedRepricingYieldConfirmation({
  polymarket,
  rates,
}: {
  polymarket: {
    upcomingMeetings: Array<{
      meetingDate: string;
      meetingLabel: string;
      repricing: Record<ConfirmationHorizon, ConfirmationFedRepricing>;
    }>;
  };
  rates: {
    maturities: {
      "2Y": {
        changes: Record<ConfirmationHorizon, ConfirmationYieldChange>;
      };
    };
  };
}): FedRepricingYieldConfirmation {
  const meeting = polymarket.upcomingMeetings[0] ?? null;
  const horizons = {} as Record<ConfirmationHorizon, HorizonResult>;
  for (const config of HORIZON_CONFIG) {
    const repricing = meeting?.repricing[config.fedKey];
    const twoYear = rates.maturities["2Y"].changes[config.ratesKey];
    horizons[config.key] = classifyHorizon(
      config.key,
      repricing ?? {
        state: "UNAVAILABLE",
        arrow: "",
      },
      twoYear
    );
  }

  const overall = aggregateOverall(horizons);
  const primary = horizons.oneWeek;
  const explanation =
    overall === "INSUFFICIENT DATA"
      ? "Insufficient matched-horizon Polymarket repricing and US 2Y yield data to assess confirmation."
      : `Using the next FOMC meeting’s Polymarket-based repricing, the primary 1W comparison is ${primary.state.toLowerCase()}: ${primary.explanation}`;
  return {
    source: "Polymarket Fed expectations + FRED US 2Y Treasury yield",
    meetingDate: meeting?.meetingDate ?? null,
    meetingLabel: meeting?.meetingLabel ?? null,
    status: overall === "INSUFFICIENT DATA" ? "unavailable" : "available",
    horizons,
    overall,
    primaryHorizon: "1W",
    explanation,
  };
}
