import { describe, expect, it } from "vitest";
import { getPolymarketFedExpectations } from "../src/lib/polymarket-fed-expectations";

const now = new Date("2026-10-08T11:30:00.000Z");
const currentPolicy = {
  targetLower: 3.75,
  targetUpper: 4,
  effectiveFedFundsRate: 3.83,
  observedAt: "2026-10-07",
  source: "FRED" as const,
};

const outcomeSpecs = [
  {
    id: "cut50",
    question: "Will the Fed decrease interest rates by 50+ bps after the October 2026 meeting?",
    token: "token-cut50",
    kind: "cut50",
  },
  {
    id: "cut25",
    question: "Will the Fed decrease interest rates by 25 bps after the October 2026 meeting?",
    token: "token-cut25",
    kind: "cut25",
  },
  {
    id: "hold",
    question: "Will there be no change in Fed interest rates after the October 2026 meeting?",
    token: "token-hold",
    kind: "hold",
  },
  {
    id: "hike25",
    question: "Will the Fed increase interest rates by 25 bps after the October 2026 meeting?",
    token: "token-hike25",
    kind: "hike25",
  },
  {
    id: "hike50",
    question: "Will the Fed increase interest rates by 50+ bps after the October 2026 meeting?",
    token: "token-hike50",
    kind: "hike50",
  },
] as const;

const timePoints = {
  now: Math.floor(now.getTime() / 1000),
  oneDayAgo: Math.floor((now.getTime() - 24 * 60 * 60 * 1000) / 1000),
  oneWeekAgo: Math.floor((now.getTime() - 7 * 24 * 60 * 60 * 1000) / 1000),
  oneMonthAgo: Math.floor((now.getTime() - 30 * 24 * 60 * 60 * 1000) / 1000),
};

const valuesByHorizon = {
  now: [0.002, 0.05, 0.2, 0.73, 0.02],
  oneDayAgo: [0.002, 0.05, 0.5, 0.43, 0.02],
  oneWeekAgo: [0.002, 0.05, 0.5, 0.43, 0.02],
  oneMonthAgo: [0.01, 0.1, 0.7, 0.18, 0.012],
};

function createFetcher({
  markets = outcomeSpecs.map((spec) => ({
    question: spec.question,
    clobTokenIds: JSON.stringify([spec.token, `no-${spec.token}`]),
    active: true,
    closed: false,
  })),
  probabilities = valuesByHorizon.now,
  includeOneMonthHistory = true,
  probabilitiesByHorizon = {},
}: {
  markets?: Array<Record<string, unknown>>;
  probabilities?: number[];
  includeOneMonthHistory?: boolean;
  probabilitiesByHorizon?: Partial<Record<keyof typeof valuesByHorizon, number[]>>;
} = {}) {
  const historyValues = {
    ...valuesByHorizon,
    ...probabilitiesByHorizon,
    now: probabilitiesByHorizon.now ?? probabilities,
  };
  const series = new Map<string, Array<{ t: number; p: number }>>();
  outcomeSpecs.forEach((spec, outcomeIndex) => {
    series.set(
      spec.token,
      [
        ...(includeOneMonthHistory
          ? [
              {
                t: timePoints.oneMonthAgo,
                p: historyValues.oneMonthAgo![outcomeIndex]!,
              },
            ]
          : []),
        { t: timePoints.oneWeekAgo, p: historyValues.oneWeekAgo![outcomeIndex]! },
        { t: timePoints.oneDayAgo, p: historyValues.oneDayAgo![outcomeIndex]! },
        { t: timePoints.now, p: historyValues.now![outcomeIndex]! },
      ]
    );
  });

  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "gamma-api.polymarket.com") {
      return new Response(
        JSON.stringify({
          events: [
            {
              slug: "fed-decision-in-october-test",
              title: "Fed Decision in October?",
              active: true,
              closed: false,
              markets: markets as never,
              description: "The FOMC meeting scheduled for October 27-28, 2026.",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const token = url.searchParams.get("market");
    const history = token ? series.get(token) : undefined;
    return new Response(
      JSON.stringify({ history: history ?? [] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };
  return fetcher;
}

describe("Polymarket Fed expectations adapter", () => {
  it("maps five Polymarket outcomes into a normalized CUT / HOLD / HIKE distribution and preserves raw data", async () => {
    const result = await getPolymarketFedExpectations({
      currentPolicy,
      now,
      fetcher: createFetcher(),
    });
    const snapshot = result.upcomingMeetings[0]?.snapshots.now;

    expect(result.status).toBe("available");
    expect(result.provider).toBe("Polymarket");
    expect(result.source).toContain("Polymarket");
    expect(result.upcomingMeetings[0]?.meetingDate).toBe("2026-10-28");
    expect(snapshot?.rawOutcomes).toHaveLength(5);
    expect(snapshot?.rawOutcomes[0]).toMatchObject({
      outcomeId: "cut50",
      yesPrice: 0.002,
    });
    expect(snapshot?.rawProbabilitySum).toBeCloseTo(1.002);
    expect(snapshot?.normalizedProbabilities.cut).toBeGreaterThan(0);
    expect(
      snapshot!.normalizedProbabilities.cut +
        snapshot!.normalizedProbabilities.hold +
        snapshot!.normalizedProbabilities.hike
    ).toBeCloseTo(100, 8);
    expect(snapshot?.expectedPolicyRate).toBeNull();
  });

  it("rejects missing and ambiguous outcome mappings", async () => {
    const missing = await getPolymarketFedExpectations({
      currentPolicy,
      now,
      fetcher: createFetcher({
        markets: outcomeSpecs.slice(0, 4).map((spec) => ({
          question: spec.question,
          clobTokenIds: JSON.stringify([spec.token, `no-${spec.token}`]),
          active: true,
          closed: false,
        })),
      }),
    });
    expect(missing.status).toBe("unavailable");
    expect(missing.upcomingMeetings[0]?.snapshots.now).toBeNull();
    expect(missing.upcomingMeetings[0]?.reason).toMatch(/missing/i);

    const ambiguousMarkets = [
      ...outcomeSpecs.map((spec) => ({
        question: spec.question,
        clobTokenIds: JSON.stringify([spec.token, `no-${spec.token}`]),
        active: true,
        closed: false,
      })),
      {
        question: outcomeSpecs[3].question,
        clobTokenIds: JSON.stringify(["duplicate-hike", "duplicate-no"]),
        active: true,
        closed: false,
      },
    ];
    const ambiguous = await getPolymarketFedExpectations({
      currentPolicy,
      now,
      fetcher: createFetcher({ markets: ambiguousMarkets }),
    });
    expect(ambiguous.status).toBe("unavailable");
    expect(ambiguous.upcomingMeetings[0]?.reason).toMatch(/duplicate/i);
  });

  it("does not normalize a raw probability total outside the accepted tolerance", async () => {
    const result = await getPolymarketFedExpectations({
      currentPolicy,
      now,
      fetcher: createFetcher({
        probabilities: [0.02, 0.1, 0.5, 0.5, 0.08],
      }),
    });

    expect(result.status).toBe("unavailable");
    expect(result.upcomingMeetings[0]?.snapshots.now).toBeNull();
    expect(result.upcomingMeetings[0]?.rawCurrentOutcomes).toHaveLength(5);
    expect(result.upcomingMeetings[0]?.rawCurrentProbabilitySum).toBeCloseTo(1.2);
  });

  it("loads real historical horizons and classifies the full-distribution move", async () => {
    const result = await getPolymarketFedExpectations({
      currentPolicy,
      now,
      fetcher: createFetcher(),
    });
    const meeting = result.upcomingMeetings[0]!;

    expect(meeting.snapshots.now?.capturedAt).toBe(now.toISOString());
    expect(meeting.snapshots.oneDayAgo?.capturedAt).toBe(
      new Date(timePoints.oneDayAgo * 1000).toISOString()
    );
    expect(meeting.snapshots.oneWeekAgo?.capturedAt).toBe(
      new Date(timePoints.oneWeekAgo * 1000).toISOString()
    );
    expect(meeting.snapshots.oneMonthAgo?.capturedAt).toBe(
      new Date(timePoints.oneMonthAgo * 1000).toISOString()
    );
    expect(meeting.repricing.oneWeek.state).toBe("STRONGLY HAWKISH");
    expect(meeting.repricing.oneWeek.arrow).toBe("↑↑");
    expect(meeting.repricing.oneWeek.categoryProbabilityChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "hike",
          probabilityChangePercentagePoints: expect.any(Number),
        }),
      ])
    );
    expect(meeting.repricing.oneWeek.expectedRateChangeBasisPoints).toBeNull();
  });

  it("leaves missing historical snapshots unavailable without affecting current prices", async () => {
    const result = await getPolymarketFedExpectations({
      currentPolicy,
      now,
      fetcher: createFetcher({ includeOneMonthHistory: false }),
    });
    const meeting = result.upcomingMeetings[0]!;

    expect(result.status).toBe("available");
    expect(meeting.snapshots.now).not.toBeNull();
    expect(meeting.snapshots.oneMonthAgo).toBeNull();
    expect(meeting.repricing.oneMonth.state).toBe("UNAVAILABLE");
  });

  it("uses the policy range prevailing at each historical snapshot for expected-rate repricing", async () => {
    const finiteOutcomes = [0, 0.1, 0.6, 0.3, 0];
    const result = await getPolymarketFedExpectations({
      currentPolicy,
      policyHistory: [
        { date: "2026-10-08", targetLower: 3.75, targetUpper: 4 },
        { date: "2026-10-07", targetLower: 3.75, targetUpper: 4 },
        { date: "2026-10-01", targetLower: 3.5, targetUpper: 3.75 },
        { date: "2026-09-08", targetLower: 3.5, targetUpper: 3.75 },
      ],
      now,
      fetcher: createFetcher({
        probabilitiesByHorizon: {
          now: finiteOutcomes,
          oneDayAgo: finiteOutcomes,
          oneWeekAgo: finiteOutcomes,
          oneMonthAgo: finiteOutcomes,
        },
      }),
    });
    const meeting = result.upcomingMeetings[0]!;

    expect(meeting.snapshots.now?.expectedPolicyRate).toBe(3.925);
    expect(meeting.snapshots.oneWeekAgo?.expectedPolicyRate).toBe(3.675);
    expect(meeting.repricing.oneWeek.expectedRateChangeBasisPoints).toBe(25);
  });
});
