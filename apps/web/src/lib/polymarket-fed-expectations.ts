import {
  calculateExpectedPolicyRate,
  calculateFedRepricing,
  type FedPolicy,
  type FedRateOutcome,
  type FedRepricing,
  type FedSnapshotHorizon,
} from "@/lib/fed-pricing";

const GAMMA_SEARCH_URL = "https://gamma-api.polymarket.com/public-search";
const CLOB_BASE_URL = "https://clob.polymarket.com";
const MAX_RAW_PROBABILITY_SUM_DEVIATION = 0.05;
const MAX_CURRENT_PRICE_AGE_MS = 30 * 60 * 1000;

type PolymarketOutcomeId =
  | "cut50"
  | "cut25"
  | "hold"
  | "hike25"
  | "hike50";

type GammaMarket = {
  question?: string;
  description?: string;
  clobTokenIds?: string | string[];
  active?: boolean;
  closed?: boolean;
};

type GammaEvent = {
  slug?: string;
  title?: string;
  description?: string;
  active?: boolean;
  closed?: boolean;
  endDate?: string;
  markets?: GammaMarket[];
};

type HistoricalPoint = {
  t: number;
  p: number;
};

type RawMarketOutcome = {
  id: PolymarketOutcomeId;
  question: string;
  tokenId: string;
  kind: "cut" | "hold" | "hike";
  targetOffset: -0.5 | -0.25 | 0 | 0.25 | null;
};

export type FedPolicyObservation = {
  date: string;
  targetLower: number;
  targetUpper: number;
};

export type PolymarketRawOutcome = {
  outcomeId: PolymarketOutcomeId;
  question: string;
  yesPrice: number;
};

export type PolymarketFedSnapshot = {
  provider: "Polymarket";
  source: "Polymarket Gamma API + CLOB API";
  dataMode: "live";
  meetingDate: string;
  capturedAt: string;
  freshnessSeconds: number;
  rawOutcomes: PolymarketRawOutcome[];
  rawProbabilitySum: number;
  normalizedProbabilities: {
    cut: number;
    hold: number;
    hike: number;
  };
  rateOutcomes: FedRateOutcome[];
  expectedPolicyRate: number | null;
};

export type PolymarketFedMeeting = {
  meetingDate: string;
  meetingLabel: string;
  eventSlug: string;
  status: "available" | "unavailable";
  reason: string | null;
  rawCurrentOutcomes: PolymarketRawOutcome[];
  rawCurrentProbabilitySum: number | null;
  snapshots: Record<FedSnapshotHorizon, PolymarketFedSnapshot | null>;
  repricing: Record<"oneDay" | "oneWeek" | "oneMonth", FedRepricing>;
};

export type PolymarketFedExpectations = {
  status: "available" | "unavailable";
  provider: "Polymarket" | null;
  source: "Polymarket Gamma API + CLOB API" | null;
  dataMode: "live" | "unavailable";
  generatedAt: string;
  reason: string | null;
  normalizationPolicy: string;
  upcomingMeetings: PolymarketFedMeeting[];
};

type FetchLike = typeof fetch;

const HORIZONS = [
  {
    key: "now",
    offsetMs: 0,
    toleranceMs: MAX_CURRENT_PRICE_AGE_MS,
    repricingKey: null,
  },
  {
    key: "oneDayAgo",
    offsetMs: 24 * 60 * 60 * 1000,
    toleranceMs: 12 * 60 * 60 * 1000,
    repricingKey: "oneDay",
  },
  {
    key: "oneWeekAgo",
    offsetMs: 7 * 24 * 60 * 60 * 1000,
    toleranceMs: 36 * 60 * 60 * 1000,
    repricingKey: "oneWeek",
  },
  {
    key: "oneMonthAgo",
    offsetMs: 30 * 24 * 60 * 60 * 1000,
    toleranceMs: 5 * 24 * 60 * 60 * 1000,
    repricingKey: "oneMonth",
  },
] as const;

function parseArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function parseMeetingDate(event: GammaEvent, firstMarket: GammaMarket): string | null {
  const description = firstMarket.description ?? event.description ?? "";
  const scheduled = description.match(
    /meeting scheduled for\s+([A-Za-z]+)\s+(\d{1,2})-(\d{1,2}),?\s*(\d{4})/i
  );
  if (scheduled) {
    const [, monthName, , meetingDay, year] = scheduled;
    const month = new Date(`${monthName} 1, ${year}`).getMonth();
    if (Number.isInteger(month)) {
      const date = new Date(Date.UTC(Number(year), month, Number(meetingDay)));
      return date.toISOString().slice(0, 10);
    }
  }

  const singleDay = description.match(
    /meeting scheduled for\s+([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/i
  );
  if (singleDay) {
    const [, monthName, day, year] = singleDay;
    const month = new Date(`${monthName} 1, ${year}`).getMonth();
    if (Number.isInteger(month)) {
      return new Date(Date.UTC(Number(year), month, Number(day)))
        .toISOString()
        .slice(0, 10);
    }
  }
  return null;
}

function parseOutcome(market: GammaMarket): RawMarketOutcome | null {
  const question = market.question?.trim();
  const tokens = parseArray(market.clobTokenIds);
  if (!question || tokens.length !== 2 || !tokens[0]) return null;
  const normalized = question.toLowerCase();

  let id: PolymarketOutcomeId;
  let kind: RawMarketOutcome["kind"];
  let targetOffset: RawMarketOutcome["targetOffset"];
  if (
    /\b(?:decrease|cut|lower)\b/.test(normalized) &&
    /\b50\s*\+?\s*(?:bps|basis points)\b/.test(normalized)
  ) {
    id = "cut50";
    kind = "cut";
    targetOffset = null;
  } else if (
    /\b(?:decrease|cut|lower)\b/.test(normalized) &&
    /\b25\s*(?:bps|basis points)\b/.test(normalized)
  ) {
    id = "cut25";
    kind = "cut";
    targetOffset = -0.25;
  } else if (/\b(?:no change|hold|unchanged)\b/.test(normalized)) {
    id = "hold";
    kind = "hold";
    targetOffset = 0;
  } else if (
    /\b(?:increase|hike|raise|higher)\b/.test(normalized) &&
    /\b50\s*\+?\s*(?:bps|basis points)\b/.test(normalized)
  ) {
    id = "hike50";
    kind = "hike";
    targetOffset = null;
  } else if (
    /\b(?:increase|hike|raise|higher)\b/.test(normalized) &&
    /\b25\s*(?:bps|basis points)\b/.test(normalized)
  ) {
    id = "hike25";
    kind = "hike";
    targetOffset = 0.25;
  } else {
    return null;
  }

  return {
    id,
    question,
    tokenId: tokens[0],
    kind,
    targetOffset,
  };
}

function mapMarkets(event: GammaEvent) {
  const markets = (event.markets ?? []).filter(
    (market) => market.active === true && market.closed !== true
  );
  const mapped: Partial<Record<PolymarketOutcomeId, RawMarketOutcome>> = {};
  for (const market of markets) {
    const parsed = parseOutcome(market);
    if (!parsed) return { outcomes: null, reason: "An active outcome could not be mapped unambiguously." };
    if (mapped[parsed.id]) {
      return { outcomes: null, reason: `Duplicate active ${parsed.id} outcome market.` };
    }
    mapped[parsed.id] = parsed;
  }

  const required: PolymarketOutcomeId[] = [
    "cut50",
    "cut25",
    "hold",
    "hike25",
    "hike50",
  ];
  if (required.some((id) => !mapped[id])) {
    return { outcomes: null, reason: "One or more required Cut / Hold / Hike outcome markets are missing." };
  }
  return {
    outcomes: required.map((id) => mapped[id]!),
    reason: null,
  };
}

async function getJson<T>(url: string, fetcher: FetchLike): Promise<T> {
  const response = await fetcher(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Polymarket API request failed (${response.status}) for ${new URL(url).pathname}.`);
  }
  return (await response.json()) as T;
}

function getPointAtOrBefore(
  points: HistoricalPoint[],
  targetTimeSeconds: number,
  toleranceMs: number
): HistoricalPoint | null {
  const targetMs = targetTimeSeconds * 1000;
  const point = points
    .filter(
      (candidate) =>
        Number.isFinite(candidate.t) &&
        Number.isFinite(candidate.p) &&
        candidate.t * 1000 <= targetMs
    )
    .sort((a, b) => b.t - a.t)[0];
  return point && targetMs - point.t * 1000 <= toleranceMs ? point : null;
}

function createSnapshot({
  meetingDate,
  outcomes,
  points,
  targetTime,
  currentPolicy,
  policyHistory,
  now,
}: {
  meetingDate: string;
  outcomes: RawMarketOutcome[];
  points: Map<PolymarketOutcomeId, HistoricalPoint>;
  targetTime: number;
  currentPolicy: FedPolicy;
  policyHistory: FedPolicyObservation[];
  now: Date;
}): PolymarketFedSnapshot | null {
  if (points.size !== outcomes.length) return null;
  const rows: PolymarketRawOutcome[] = [];
  for (const outcome of outcomes) {
    const point = points.get(outcome.id);
    if (!point || !Number.isFinite(point.p) || point.p < 0 || point.p > 1) {
      return null;
    }
    rows.push({
      outcomeId: outcome.id,
      question: outcome.question,
      yesPrice: point.p,
    });
  }

  const rawProbabilitySum = rows.reduce((sum, row) => sum + row.yesPrice, 0);
  if (
    rawProbabilitySum <= 0 ||
    Math.abs(rawProbabilitySum - 1) > MAX_RAW_PROBABILITY_SUM_DEVIATION
  ) {
    return null;
  }

  const capturedAtMs = Math.min(...[...points.values()].map((point) => point.t * 1000));
  const capturedAt = new Date(capturedAtMs).toISOString();
  if (capturedAtMs > targetTime * 1000 || capturedAtMs > now.getTime()) return null;
  const policyDate = capturedAt.slice(0, 10);
  const historicalPolicy = policyHistory
    .filter((observation) => observation.date <= policyDate)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const policyAtSnapshot =
    historicalPolicy ??
    (currentPolicy.observedAt && currentPolicy.observedAt <= policyDate
      ? {
          date: currentPolicy.observedAt,
          targetLower: currentPolicy.targetLower,
          targetUpper: currentPolicy.targetUpper,
        }
      : null);

  const categoryTotals = { cut: 0, hold: 0, hike: 0 };
  const engineOutcomes: FedRateOutcome[] = [];
  for (const row of rows) {
    const mappedOutcome = outcomes.find((outcome) => outcome.id === row.outcomeId)!;
    const normalizedProbability = (row.yesPrice / rawProbabilitySum) * 100;
    categoryTotals[mappedOutcome.kind] += normalizedProbability;

    if (
      mappedOutcome.targetOffset === null &&
      normalizedProbability > 0.0001
    ) {
      engineOutcomes.push({
        outcomeId: mappedOutcome.id,
        targetLower: null,
        targetUpper: null,
        probability: normalizedProbability,
        kind: mappedOutcome.kind,
      });
    } else if (normalizedProbability > 0.0001) {
      const offset = mappedOutcome.targetOffset!;
      if (
        policyAtSnapshot?.targetLower === null ||
        policyAtSnapshot?.targetLower === undefined ||
        policyAtSnapshot.targetUpper === null ||
        policyAtSnapshot.targetUpper === undefined
      ) {
        engineOutcomes.push({
          outcomeId: mappedOutcome.id,
          targetLower: null,
          targetUpper: null,
          probability: normalizedProbability,
          kind: mappedOutcome.kind,
        });
      } else {
        engineOutcomes.push({
          outcomeId: mappedOutcome.id,
          targetLower: policyAtSnapshot.targetLower + offset,
          targetUpper: policyAtSnapshot.targetUpper + offset,
          probability: normalizedProbability,
          kind: mappedOutcome.kind,
        });
      }
    }
  }
  const expectedPolicyRate = calculateExpectedPolicyRate(engineOutcomes);

  return {
    provider: "Polymarket",
    source: "Polymarket Gamma API + CLOB API",
    dataMode: "live",
    meetingDate,
    capturedAt,
    freshnessSeconds: Math.max(0, Math.floor((now.getTime() - capturedAtMs) / 1000)),
    rawOutcomes: rows,
    rawProbabilitySum,
    normalizedProbabilities: categoryTotals,
    rateOutcomes: engineOutcomes,
    expectedPolicyRate,
  };
}

function toFedPricingSnapshot(snapshot: PolymarketFedSnapshot) {
  return {
    provider: snapshot.provider,
    source: snapshot.source,
    capturedAt: snapshot.capturedAt,
    meetingDate: snapshot.meetingDate,
    dataMode: snapshot.dataMode,
    outcomes: snapshot.rateOutcomes,
    expectedPolicyRate: snapshot.expectedPolicyRate,
  };
}

function unavailableRepricing(
  fromSnapshot: FedSnapshotHorizon
): FedRepricing {
  return {
    state: "UNAVAILABLE",
    arrow: "",
    expectedRateChangeBasisPoints: null,
    outcomeProbabilityChanges: [],
    categoryProbabilityChanges: [],
    fromSnapshot,
    explanation: "Comparable Polymarket price history is not available.",
  };
}

function emptyMeeting(
  event: GammaEvent,
  meetingDate: string,
  reason: string
): PolymarketFedMeeting {
  return {
    meetingDate,
    meetingLabel: event.title ?? `FOMC ${meetingDate}`,
    eventSlug: event.slug ?? "",
    status: "unavailable",
    reason,
    rawCurrentOutcomes: [],
    rawCurrentProbabilitySum: null,
    snapshots: {
      now: null,
      oneDayAgo: null,
      oneWeekAgo: null,
      oneMonthAgo: null,
    },
    repricing: {
      oneDay: unavailableRepricing("oneDayAgo"),
      oneWeek: unavailableRepricing("oneWeekAgo"),
      oneMonth: unavailableRepricing("oneMonthAgo"),
    },
  };
}

export async function getPolymarketFedExpectations({
  currentPolicy,
  policyHistory = [],
  now = new Date(),
  fetcher = fetch,
}: {
  currentPolicy: FedPolicy;
  policyHistory?: FedPolicyObservation[];
  now?: Date;
  fetcher?: FetchLike;
}): Promise<PolymarketFedExpectations> {
  const normalizationPolicy =
    "All five active, uniquely mapped outcome markets required; proportional normalization only when raw YES-price total is within 5 percentage points of 100%.";
  try {
    const searchUrl = new URL(GAMMA_SEARCH_URL);
    searchUrl.searchParams.set("q", "Fed Decision");
    const search = await getJson<{ events?: GammaEvent[] }>(
      searchUrl.toString(),
      fetcher
    );
    const candidates = (search.events ?? [])
      .filter(
        (event) =>
          event.active === true &&
          event.closed !== true &&
          /fed decision in/i.test(event.title ?? "") &&
          (event.markets?.length ?? 0) > 0
      )
      .map((event) => ({
        event,
        meetingDate: parseMeetingDate(event, event.markets![0]!),
      }))
      .filter(
        (item): item is { event: GammaEvent; meetingDate: string } =>
          item.meetingDate !== null && item.meetingDate >= now.toISOString().slice(0, 10)
      )
      .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate))
      .slice(0, 3);

    if (candidates.length === 0) {
      return {
        status: "unavailable",
        provider: null,
        source: null,
        dataMode: "unavailable",
        generatedAt: now.toISOString(),
        reason: "No active upcoming Polymarket FOMC decision markets were found.",
        normalizationPolicy,
        upcomingMeetings: [],
      };
    }

    const meetings = await Promise.all(
      candidates.map(async ({ event, meetingDate }) => {
        const mapped = mapMarkets(event);
        if (!mapped.outcomes) {
          return emptyMeeting(event, meetingDate, mapped.reason!);
        }
        const outcomes = mapped.outcomes;
        try {
          const histories = await Promise.all(
            outcomes.map(async (outcome) => {
              const historyUrl = new URL(`${CLOB_BASE_URL}/prices-history`);
              historyUrl.searchParams.set("market", outcome.tokenId);
              historyUrl.searchParams.set("interval", "all");
              historyUrl.searchParams.set("fidelity", "60");
              const response = await getJson<{ history?: HistoricalPoint[] }>(
                historyUrl.toString(),
                fetcher
              );
              const points = (response.history ?? []).filter(
                (point) =>
                  Number.isFinite(point.t) &&
                  Number.isFinite(point.p) &&
                  point.p >= 0 &&
                  point.p <= 1
              );
              return { id: outcome.id, points };
            })
          );
          const pointMap = new Map(
            histories.map((history) => [history.id, history.points])
          );
          const currentTargetTime = now.getTime() / 1000;
          const rawCurrentOutcomes = outcomes.flatMap((outcome) => {
            const point = getPointAtOrBefore(
              pointMap.get(outcome.id) ?? [],
              currentTargetTime,
              MAX_CURRENT_PRICE_AGE_MS
            );
            return point
              ? [
                  {
                    outcomeId: outcome.id,
                    question: outcome.question,
                    yesPrice: point.p,
                  },
                ]
              : [];
          });
          const rawCurrentProbabilitySum =
            rawCurrentOutcomes.length === outcomes.length
              ? rawCurrentOutcomes.reduce((sum, outcome) => sum + outcome.yesPrice, 0)
              : null;
          const snapshots: PolymarketFedMeeting["snapshots"] = {
            now: null,
            oneDayAgo: null,
            oneWeekAgo: null,
            oneMonthAgo: null,
          };

          for (const horizon of HORIZONS) {
            const targetTime = (now.getTime() - horizon.offsetMs) / 1000;
            const selectedPoints = new Map<PolymarketOutcomeId, HistoricalPoint>();
            for (const outcome of outcomes) {
              const points = pointMap.get(outcome.id) ?? [];
              const point = getPointAtOrBefore(
                points,
                targetTime,
                horizon.toleranceMs
              );
              if (point) selectedPoints.set(outcome.id, point);
            }
            const snapshot = createSnapshot({
              meetingDate,
              outcomes,
              points: selectedPoints,
              targetTime,
              currentPolicy,
              policyHistory,
              now,
            });
            snapshots[horizon.key] = snapshot;
          }

          const repricing = {
            oneDay: snapshots.now && snapshots.oneDayAgo
              ? calculateFedRepricing(
                  toFedPricingSnapshot(snapshots.now),
                  toFedPricingSnapshot(snapshots.oneDayAgo),
                  "oneDayAgo"
                )
              : unavailableRepricing("oneDayAgo"),
            oneWeek: snapshots.now && snapshots.oneWeekAgo
              ? calculateFedRepricing(
                  toFedPricingSnapshot(snapshots.now),
                  toFedPricingSnapshot(snapshots.oneWeekAgo),
                  "oneWeekAgo"
                )
              : unavailableRepricing("oneWeekAgo"),
            oneMonth: snapshots.now && snapshots.oneMonthAgo
              ? calculateFedRepricing(
                  toFedPricingSnapshot(snapshots.now),
                  toFedPricingSnapshot(snapshots.oneMonthAgo),
                  "oneMonthAgo"
                )
              : unavailableRepricing("oneMonthAgo"),
          };
          const status = snapshots.now ? "available" : "unavailable";
          const currentReason = snapshots.now
            ? null
            : rawCurrentOutcomes.length !== outcomes.length
              ? "One or more current outcome prices are missing or stale."
              : "Current raw YES-price total falls outside the accepted normalization tolerance; distribution was rejected.";
          return {
            meetingDate,
            meetingLabel: event.title ?? `FOMC ${meetingDate}`,
            eventSlug: event.slug ?? "",
            status,
            reason: currentReason,
            rawCurrentOutcomes,
            rawCurrentProbabilitySum,
            snapshots,
            repricing,
          } satisfies PolymarketFedMeeting;
        } catch (error) {
          return emptyMeeting(
            event,
            meetingDate,
            error instanceof Error
              ? error.message
              : "Could not retrieve Polymarket outcome history."
          );
        }
      })
    );

    const hasCurrent = meetings.some((meeting) => meeting.snapshots.now !== null);
    return {
      status: hasCurrent ? "available" : "unavailable",
      provider: hasCurrent ? "Polymarket" : null,
      source: hasCurrent ? "Polymarket Gamma API + CLOB API" : null,
      dataMode: hasCurrent ? "live" : "unavailable",
      generatedAt: now.toISOString(),
      reason: hasCurrent ? null : "No valid current Polymarket probability distributions were available.",
      normalizationPolicy,
      upcomingMeetings: meetings,
    };
  } catch (error) {
    return {
      status: "unavailable",
      provider: null,
      source: null,
      dataMode: "unavailable",
      generatedAt: now.toISOString(),
      reason:
        error instanceof Error
          ? error.message
          : "Could not retrieve Polymarket Fed expectations.",
      normalizationPolicy,
      upcomingMeetings: [],
    };
  }
}
