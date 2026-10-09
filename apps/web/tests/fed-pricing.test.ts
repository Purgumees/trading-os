import { describe, expect, it } from "vitest";
import {
  calculateExpectedPolicyRate,
  calculateFedRepricing,
  calculateMeetingMonthPostMeetingEffectiveRate,
  createUnavailableFedPricing,
  distributeExpectedPolicyRate,
  type FedPricingSnapshot,
  type FedRateOutcome,
} from "../src/lib/fed-pricing";

const currentPolicy = {
  targetLower: 3.75,
  targetUpper: 4,
  effectiveFedFundsRate: 3.83,
  observedAt: "2026-09-01",
  source: "FRED" as const,
};

const outcome = (
  targetLower: number,
  targetUpper: number,
  probability: number,
  kind: FedRateOutcome["kind"]
): FedRateOutcome => ({ targetLower, targetUpper, probability, kind });

const snapshot = (
  capturedAt: string,
  outcomes: FedRateOutcome[]
): FedPricingSnapshot => ({
  provider: "mock-provider",
  source: "synthetic-test-fixture",
  capturedAt,
  meetingDate: "2026-10-28",
  dataMode: "live",
  outcomes,
  expectedPolicyRate: calculateExpectedPolicyRate(outcomes),
});

describe("Fed Pricing data layer", () => {
  it("keeps live market pricing unavailable rather than fabricating probabilities", () => {
    const pricing = createUnavailableFedPricing(currentPolicy);

    expect(pricing.status).toBe("unavailable");
    expect(pricing.currentPolicy).toEqual(currentPolicy);
    expect(pricing.upcomingMeetings).toEqual([]);
    expect(pricing.dataMode).toBe("unavailable");
  });

  it("day-weights the FOMC month contract to estimate the post-meeting policy rate", () => {
    const rate = calculateMeetingMonthPostMeetingEffectiveRate({
      futuresPrice: 95.95,
      meetingDate: "2026-10-27",
      preMeetingEffectiveRate: 4,
      effectiveRateToTargetMidpointOffset: 0.05,
    });

    expect(rate).toBeCloseTo(4.36, 2);
    expect(
      calculateMeetingMonthPostMeetingEffectiveRate({
        futuresPrice: 95.95,
        meetingDate: "2026-02-31",
        preMeetingEffectiveRate: 4,
        effectiveRateToTargetMidpointOffset: 0.05,
      })
    ).toBeNull();
  });

  it("distributes an implied rate across adjacent 25bp outcomes", () => {
    const outcomes = distributeExpectedPolicyRate({
      expectedPolicyRate: 3.875,
      currentTargetMidpoint: 4,
      possibleTargetMidpoints: [3.75, 4, 4.25],
    });

    expect(outcomes).toEqual([
      {
        targetLower: 3.625,
        targetUpper: 3.875,
        probability: 50,
        kind: "cut",
      },
      {
        targetLower: 3.875,
        targetUpper: 4.125,
        probability: 50,
        kind: "hold",
      },
    ]);
    expect(calculateExpectedPolicyRate(outcomes)).toBeCloseTo(3.875, 4);
  });

  it("rejects incomplete or invalid outcome distributions", () => {
    expect(
      calculateExpectedPolicyRate([
        outcome(3.75, 4, 60, "hold"),
      ])
    ).toBeNull();
    expect(
      distributeExpectedPolicyRate({
        expectedPolicyRate: 3.5,
        currentTargetMidpoint: 4,
        possibleTargetMidpoints: [3.75, 4, 4.5],
      })
    ).toEqual([]);
  });

  it("calculates expected rate from the entire outcome distribution", () => {
    const outcomes = [
      outcome(3.75, 4, 25, "cut"),
      outcome(4, 4.25, 50, "hold"),
      outcome(4.25, 4.5, 25, "hike"),
    ];

    expect(calculateExpectedPolicyRate(outcomes)).toBe(4.125);
  });

  it("reports outcome-probability changes in percentage points", () => {
    const previous = snapshot("2026-10-07T12:00:00Z", [
      outcome(3.75, 4, 50, "cut"),
      outcome(4, 4.25, 28.4, "hold"),
      outcome(4.25, 4.5, 21.6, "hike"),
    ]);
    const current = snapshot("2026-10-08T12:00:00Z", [
      outcome(3.75, 4, 0, "cut"),
      outcome(4, 4.25, 30, "hold"),
      outcome(4.25, 4.5, 70, "hike"),
    ]);

    const repricing = calculateFedRepricing(current, previous, "oneDayAgo");
    expect(repricing.outcomeProbabilityChanges).toContainEqual({
      targetLower: 4.25,
      targetUpper: 4.5,
      kind: "hike",
      probabilityChangePercentagePoints: 48.4,
    });
  });

  it("classifies a 70% to 21.6% hike-probability move as strongly dovish", () => {
    const previous = snapshot("2026-10-07T12:00:00Z", [
      outcome(3.75, 4, 50, "cut"),
      outcome(4, 4.25, 28.4, "hold"),
      outcome(4.25, 4.5, 21.6, "hike"),
    ]);
    const current = snapshot("2026-10-08T12:00:00Z", [
      outcome(3.75, 4, 0, "cut"),
      outcome(4, 4.25, 30, "hold"),
      outcome(4.25, 4.5, 70, "hike"),
    ]);
    const repricing = calculateFedRepricing(previous, current, "oneDayAgo");

    expect(repricing.state).toBe("STRONGLY DOVISH");
    expect(repricing.arrow).toBe("↓↓");
    expect(repricing.expectedRateChangeBasisPoints).toBeCloseTo(-24.6, 1);
  });

  it("returns unavailable without comparable snapshots", () => {
    expect(calculateFedRepricing(null, null, "oneWeekAgo").state).toBe(
      "UNAVAILABLE"
    );
  });
});
