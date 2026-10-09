export type FedPolicy = {
  targetLower: number | null;
  targetUpper: number | null;
  effectiveFedFundsRate: number | null;
  observedAt: string | null;
  source: "FRED";
};

export type FedOutcomeKind = "cut" | "hold" | "hike";
export type FedSnapshotHorizon = "now" | "oneDayAgo" | "oneWeekAgo" | "oneMonthAgo";
export type FedDataMode = "live" | "manually-entered" | "unavailable";

export type FedRateOutcome = {
  targetLower: number | null;
  targetUpper: number | null;
  probability: number;
  kind: FedOutcomeKind;
  outcomeId?: string;
};

export type FedPricingSnapshot = {
  provider: string;
  source: string;
  capturedAt: string | null;
  meetingDate: string;
  dataMode: FedDataMode;
  outcomes: FedRateOutcome[];
  expectedPolicyRate: number | null;
  categoryProbabilities?: Record<FedOutcomeKind, number>;
};

export type FedRepricing = {
  state:
    | "STRONGLY HAWKISH"
    | "HAWKISH"
    | "LITTLE / NO REPRICING"
    | "DOVISH"
    | "STRONGLY DOVISH"
    | "UNAVAILABLE";
  arrow: "↑↑" | "↑" | "→" | "↓" | "↓↓" | "";
  expectedRateChangeBasisPoints: number | null;
  outcomeProbabilityChanges: FedRateOutcomeChange[];
  categoryProbabilityChanges: Array<{
    kind: FedOutcomeKind;
    probabilityChangePercentagePoints: number;
  }>;
  fromSnapshot: FedSnapshotHorizon | null;
  explanation: string;
};

export type FedRateOutcomeChange = {
  targetLower: number | null;
  targetUpper: number | null;
  kind: FedOutcomeKind;
  probabilityChangePercentagePoints: number;
  outcomeId?: string;
};

export type FedMeetingPricing = {
  meetingDate: string;
  snapshots: Record<FedSnapshotHorizon, FedPricingSnapshot | null>;
  repricing: Record<"oneDay" | "oneWeek" | "oneMonth", FedRepricing>;
};

export type FedPricingData = {
  status: "available" | "unavailable";
  provider: string | null;
  source: string | null;
  dataMode: FedDataMode;
  reason: string | null;
  currentPolicy: FedPolicy;
  upcomingMeetings: FedMeetingPricing[];
};

export type FedPricingProvider = {
  id: string;
  getUpcomingMeetingPricing(
    currentPolicy: FedPolicy,
    limit: number
  ): Promise<Array<{ meetingDate: string; currentSnapshot: FedPricingSnapshot }>>;
};

export type FedPricingSnapshotStore = {
  save(snapshot: FedPricingSnapshot): Promise<void>;
  getNearest(
    meetingDate: string,
    targetTime: string,
    toleranceMs: number
  ): Promise<FedPricingSnapshot | null>;
};

export const FED_PRICING_THRESHOLDS = {
  outcomeStepPercentagePoints: 0.25,
  littleRepricingBasisPoints: 2,
  strongRepricingBasisPoints: 12.5,
  littleDirectionalProbabilityPoints: 2,
  strongDirectionalProbabilityPoints: 12.5,
} as const;

const HORIZON_OFFSETS = [
  {
    snapshot: "oneDayAgo",
    repricing: "oneDay",
    offsetMs: 24 * 60 * 60 * 1000,
    toleranceMs: 12 * 60 * 60 * 1000,
  },
  {
    snapshot: "oneWeekAgo",
    repricing: "oneWeek",
    offsetMs: 7 * 24 * 60 * 60 * 1000,
    toleranceMs: 36 * 60 * 60 * 1000,
  },
  {
    snapshot: "oneMonthAgo",
    repricing: "oneMonth",
    offsetMs: 30 * 24 * 60 * 60 * 1000,
    toleranceMs: 5 * 24 * 60 * 60 * 1000,
  },
] as const;

function isValidDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function validTimestamp(timestamp: string | null) {
  return timestamp !== null && Number.isFinite(new Date(timestamp).getTime());
}

export function calculateMeetingMonthPostMeetingEffectiveRate({
  futuresPrice,
  meetingDate,
  preMeetingEffectiveRate,
  effectiveRateToTargetMidpointOffset,
}: {
  futuresPrice: number;
  meetingDate: string;
  preMeetingEffectiveRate: number;
  effectiveRateToTargetMidpointOffset: number;
}) {
  if (
    !Number.isFinite(futuresPrice) ||
    !Number.isFinite(preMeetingEffectiveRate) ||
    !Number.isFinite(effectiveRateToTargetMidpointOffset) ||
    !isValidDate(meetingDate)
  ) {
    return null;
  }

  const date = new Date(`${meetingDate}T00:00:00Z`);
  const daysInMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const daysAtPreMeetingRate = date.getUTCDate() - 1;
  const daysAtPostMeetingRate = daysInMonth - daysAtPreMeetingRate;
  if (daysAtPostMeetingRate <= 0) return null;

  const impliedMonthlyAverageRate = 100 - futuresPrice;
  const postMeetingEffectiveRate =
    (impliedMonthlyAverageRate * daysInMonth -
      preMeetingEffectiveRate * daysAtPreMeetingRate) /
    daysAtPostMeetingRate;

  return Number.isFinite(postMeetingEffectiveRate)
    ? postMeetingEffectiveRate + effectiveRateToTargetMidpointOffset
    : null;
}

export function distributeExpectedPolicyRate({
  expectedPolicyRate,
  currentTargetMidpoint,
  possibleTargetMidpoints,
}: {
  expectedPolicyRate: number;
  currentTargetMidpoint: number;
  possibleTargetMidpoints: number[];
}): FedRateOutcome[] {
  if (
    !Number.isFinite(expectedPolicyRate) ||
    !Number.isFinite(currentTargetMidpoint) ||
    possibleTargetMidpoints.length === 0 ||
    possibleTargetMidpoints.some((rate) => !Number.isFinite(rate))
  ) {
    return [];
  }

  const rates = [...new Set(possibleTargetMidpoints)].sort((a, b) => a - b);
  if (
    rates.some(
      (rate, index) =>
        index > 0 &&
        Math.abs(
          rate -
            rates[index - 1]! -
            FED_PRICING_THRESHOLDS.outcomeStepPercentagePoints
        ) > 0.0001
    )
  ) {
    return [];
  }

  const lower = [...rates].reverse().find((rate) => rate <= expectedPolicyRate);
  const upper = rates.find((rate) => rate >= expectedPolicyRate);
  if (lower === undefined || upper === undefined) return [];

  const probabilities = new Map<number, number>();
  if (lower === upper) {
    probabilities.set(lower, 1);
  } else {
    const upperProbability = (expectedPolicyRate - lower) / (upper - lower);
    probabilities.set(lower, 1 - upperProbability);
    probabilities.set(upper, upperProbability);
  }

  const step = FED_PRICING_THRESHOLDS.outcomeStepPercentagePoints;
  return [...probabilities.entries()]
    .filter(([, probability]) => probability > 0)
    .map(([midpoint, probability]) => ({
      targetLower: Number((midpoint - step / 2).toFixed(4)),
      targetUpper: Number((midpoint + step / 2).toFixed(4)),
      probability: Number((probability * 100).toFixed(2)),
      kind:
        midpoint < currentTargetMidpoint - step / 2
          ? "cut"
          : midpoint > currentTargetMidpoint + step / 2
            ? "hike"
            : "hold",
    }));
}

export function calculateExpectedPolicyRate(outcomes: FedRateOutcome[]): number | null {
  if (
    outcomes.length === 0 ||
    outcomes.some(
      (outcome) =>
        !Number.isFinite(outcome.probability) ||
        outcome.probability < 0 ||
        outcome.probability > 100 ||
        ((outcome.targetLower === null || outcome.targetUpper === null) &&
          outcome.probability > 0) ||
        (outcome.targetLower !== null && !Number.isFinite(outcome.targetLower)) ||
        (outcome.targetUpper !== null && !Number.isFinite(outcome.targetUpper)) ||
        (outcome.targetLower !== null &&
          outcome.targetUpper !== null &&
          outcome.targetUpper <= outcome.targetLower) ||
        ((outcome.targetLower === null) !== (outcome.targetUpper === null)) ||
        !["cut", "hold", "hike"].includes(outcome.kind)
    )
  ) {
    return null;
  }

  const uniqueOutcomes = new Set(
    outcomes.map(
      (outcome) =>
        outcome.outcomeId ??
        `${outcome.targetLower ?? "unknown"}:${outcome.targetUpper ?? "unknown"}`
    )
  );
  if (uniqueOutcomes.size !== outcomes.length) return null;

  const totalProbability = outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  if (Math.abs(totalProbability - 100) > 0.01) return null;

  const expected = outcomes.reduce(
    (sum, outcome) => {
      if (outcome.probability === 0) return sum;
      if (outcome.targetLower === null || outcome.targetUpper === null) {
        return Number.NaN;
      }
      return (
        sum +
        ((outcome.targetLower + outcome.targetUpper) / 2) *
          (outcome.probability / 100)
      );
    },
    0
  );
  return Number.isFinite(expected) ? Number(expected.toFixed(4)) : null;
}

export function calculateFedRepricing(
  current: FedPricingSnapshot | null,
  previous: FedPricingSnapshot | null,
  fromSnapshot: FedSnapshotHorizon
): FedRepricing {
  const unavailable: FedRepricing = {
    state: "UNAVAILABLE",
    arrow: "",
    expectedRateChangeBasisPoints: null,
    outcomeProbabilityChanges: [],
    categoryProbabilityChanges: [],
    fromSnapshot: null,
    explanation: "Comparable market-pricing history is not available.",
  };
  if (
    !isValidFedPricingSnapshot(current) ||
    !isValidFedPricingSnapshot(previous) ||
    current.meetingDate !== previous.meetingDate
  ) {
    return unavailable;
  }

  const currentExpected = calculateExpectedPolicyRate(current.outcomes);
  const previousExpected = calculateExpectedPolicyRate(previous.outcomes);
  const hasExpectedRates = currentExpected !== null && previousExpected !== null;
  const expectedRateChangeBasisPoints = hasExpectedRates
    ? (currentExpected - previousExpected) * 100
    : null;
  const directionalChange = hasExpectedRates
    ? expectedRateChangeBasisPoints!
    : getDirectionalProbabilityScore(current.outcomes) -
      getDirectionalProbabilityScore(previous.outcomes);
  const absChange = Math.abs(directionalChange);
  const direction = Math.sign(directionalChange);
  const littleThreshold = hasExpectedRates
    ? FED_PRICING_THRESHOLDS.littleRepricingBasisPoints
    : FED_PRICING_THRESHOLDS.littleDirectionalProbabilityPoints;
  const strongThreshold = hasExpectedRates
    ? FED_PRICING_THRESHOLDS.strongRepricingBasisPoints
    : FED_PRICING_THRESHOLDS.strongDirectionalProbabilityPoints;
  const state =
    absChange < littleThreshold
      ? "LITTLE / NO REPRICING"
      : direction > 0
        ? absChange >= strongThreshold
          ? "STRONGLY HAWKISH"
          : "HAWKISH"
        : absChange >= strongThreshold
          ? "STRONGLY DOVISH"
          : "DOVISH";
  const arrows = {
    "STRONGLY HAWKISH": "↑↑",
    HAWKISH: "↑",
    "LITTLE / NO REPRICING": "→",
    DOVISH: "↓",
    "STRONGLY DOVISH": "↓↓",
    UNAVAILABLE: "",
  } as const;

  const previousOutcomes = new Map(
    previous.outcomes.map((outcome) => [
      outcome.outcomeId ??
        `${outcome.targetLower ?? "unknown"}:${outcome.targetUpper ?? "unknown"}`,
      outcome,
    ])
  );
  const currentOutcomes = new Map(
    current.outcomes.map((outcome) => [
      outcome.outcomeId ??
        `${outcome.targetLower ?? "unknown"}:${outcome.targetUpper ?? "unknown"}`,
      outcome,
    ])
  );
  const outcomeKeys = new Set([
    ...previousOutcomes.keys(),
    ...currentOutcomes.keys(),
  ]);
  const outcomeProbabilityChanges = [...outcomeKeys].map((key) => {
    const currentOutcome = currentOutcomes.get(key);
    const previousOutcome = previousOutcomes.get(key);
    return {
      targetLower: currentOutcome?.targetLower ?? previousOutcome?.targetLower ?? null,
      targetUpper: currentOutcome?.targetUpper ?? previousOutcome?.targetUpper ?? null,
      kind: currentOutcome?.kind ?? previousOutcome!.kind,
      outcomeId: currentOutcome?.outcomeId ?? previousOutcome?.outcomeId,
      probabilityChangePercentagePoints: Number(
        ((currentOutcome?.probability ?? 0) - (previousOutcome?.probability ?? 0)).toFixed(2)
      ),
    };
  });
  const currentCategories = getCategoryProbabilities(current.outcomes);
  const previousCategories = getCategoryProbabilities(previous.outcomes);
  const categoryProbabilityChanges = (["cut", "hold", "hike"] as const).map(
    (kind) => ({
      kind,
      probabilityChangePercentagePoints: Number(
        (currentCategories[kind] - previousCategories[kind]).toFixed(2)
      ),
    })
  );

  return {
    state,
    arrow: arrows[state],
    expectedRateChangeBasisPoints:
      expectedRateChangeBasisPoints === null
        ? null
        : Number(expectedRateChangeBasisPoints.toFixed(2)),
    outcomeProbabilityChanges,
    categoryProbabilityChanges,
    fromSnapshot,
    explanation:
      state === "LITTLE / NO REPRICING"
        ? hasExpectedRates
          ? "Probability-weighted expected policy rate changed little."
          : "Net probability shift between higher-rate and lower-rate outcomes was small."
        : hasExpectedRates
          ? `Expected policy rate repriced ${direction > 0 ? "higher (hawkish)" : "lower (dovish)"}.`
          : `Probability shifted toward ${direction > 0 ? "higher-rate (hawkish)" : "lower-rate (dovish)"} outcomes; exact expected rate is unavailable for open-ended outcomes.`,
  };
}

function getCategoryProbabilities(
  outcomes: FedRateOutcome[]
): Record<FedOutcomeKind, number> {
  return outcomes.reduce(
    (totals, outcome) => {
      totals[outcome.kind] += outcome.probability;
      return totals;
    },
    { cut: 0, hold: 0, hike: 0 }
  );
}

function getDirectionalProbabilityScore(outcomes: FedRateOutcome[]) {
  const categories = getCategoryProbabilities(outcomes);
  return categories.hike - categories.cut;
}

export function isValidFedPricingSnapshot(
  snapshot: FedPricingSnapshot | null
): snapshot is FedPricingSnapshot {
  if (
    !snapshot ||
    !snapshot.provider.trim() ||
    !snapshot.source.trim() ||
    !validTimestamp(snapshot.capturedAt) ||
    !isValidDate(snapshot.meetingDate) ||
    snapshot.dataMode === "unavailable" ||
    !["live", "manually-entered"].includes(snapshot.dataMode) ||
    snapshot.outcomes.length === 0
  ) {
    return false;
  }

  const totalProbability = snapshot.outcomes.reduce(
    (sum, outcome) => sum + outcome.probability,
    0
  );
  if (Math.abs(totalProbability - 100) > 0.01) return false;

  const expectedPolicyRate = calculateExpectedPolicyRate(snapshot.outcomes);
  if (expectedPolicyRate === null) {
    return snapshot.expectedPolicyRate === null;
  }
  return (
    snapshot.expectedPolicyRate !== null &&
    Number.isFinite(snapshot.expectedPolicyRate) &&
    Math.abs(expectedPolicyRate - snapshot.expectedPolicyRate) <= 0.001
  );
}

export async function buildFedPricingData(
  currentPolicy: FedPolicy,
  provider: FedPricingProvider | null,
  snapshotStore: FedPricingSnapshotStore | null,
  now = new Date()
): Promise<FedPricingData> {
  if (!provider) return createUnavailableFedPricing(currentPolicy);

  const providerMeetings = await provider.getUpcomingMeetingPricing(currentPolicy, 3);
  const meetings: FedMeetingPricing[] = [];

  for (const item of providerMeetings.slice(0, 3)) {
    if (
      !isValidDate(item.meetingDate) ||
      !isValidFedPricingSnapshot(item.currentSnapshot) ||
      item.currentSnapshot.meetingDate !== item.meetingDate
    ) {
      continue;
    }

    const currentSnapshot = item.currentSnapshot;
    if (snapshotStore) await snapshotStore.save(currentSnapshot);
    const snapshots: FedMeetingPricing["snapshots"] = {
      now: currentSnapshot,
      oneDayAgo: null,
      oneWeekAgo: null,
      oneMonthAgo: null,
    };
    const repricing: FedMeetingPricing["repricing"] = {
      oneDay: calculateFedRepricing(currentSnapshot, null, "oneDayAgo"),
      oneWeek: calculateFedRepricing(currentSnapshot, null, "oneWeekAgo"),
      oneMonth: calculateFedRepricing(currentSnapshot, null, "oneMonthAgo"),
    };

    if (snapshotStore) {
      const historical = await Promise.all(
        HORIZON_OFFSETS.map(async (horizon) => {
          const targetTime = new Date(now.getTime() - horizon.offsetMs);
          const candidate = await snapshotStore.getNearest(
            item.meetingDate,
            targetTime.toISOString(),
            horizon.toleranceMs
          );
          if (
            !isValidFedPricingSnapshot(candidate) ||
            candidate.meetingDate !== item.meetingDate ||
            Math.abs(
              new Date(candidate.capturedAt!).getTime() - targetTime.getTime()
            ) > horizon.toleranceMs ||
            new Date(candidate.capturedAt!).getTime() > now.getTime()
          ) {
            return { horizon, snapshot: null };
          }
          return { horizon, snapshot: candidate };
        })
      );

      for (const { horizon, snapshot } of historical) {
        snapshots[horizon.snapshot] = snapshot;
        repricing[horizon.repricing] = calculateFedRepricing(
          currentSnapshot,
          snapshot,
          horizon.snapshot
        );
      }
    }

    meetings.push({
      meetingDate: item.meetingDate,
      snapshots,
      repricing,
    });
  }

  const anyPricing = meetings.some((meeting) =>
    Object.values(meeting.snapshots).some(isValidFedPricingSnapshot)
  );
  const firstSnapshot = meetings.find((meeting) => meeting.snapshots.now)?.snapshots.now;
  return {
    status: anyPricing ? "available" : "unavailable",
    provider: anyPricing ? provider.id : null,
    source: anyPricing ? firstSnapshot?.source ?? null : null,
    dataMode: anyPricing ? firstSnapshot?.dataMode ?? "unavailable" : "unavailable",
    reason: anyPricing ? null : "No valid Fed funds futures pricing is available.",
    currentPolicy,
    upcomingMeetings: meetings,
  };
}

export function createUnavailableFedPricing(currentPolicy: FedPolicy): FedPricingData {
  const unavailable = (fromSnapshot: FedSnapshotHorizon): FedRepricing => ({
    state: "UNAVAILABLE",
    arrow: "",
    expectedRateChangeBasisPoints: null,
    outcomeProbabilityChanges: [],
    categoryProbabilityChanges: [],
    fromSnapshot,
    explanation: "Comparable market-pricing history is not available.",
  });

  return {
    status: "unavailable",
    provider: null,
    source: null,
    dataMode: "unavailable",
    reason: "Fed funds futures pricing provider is not connected.",
    currentPolicy,
    upcomingMeetings: [],
  };
}
