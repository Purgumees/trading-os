import { describe, expect, it } from "vitest";
import {
  calculateLabourState,
  type LabourStateInput,
} from "../src/lib/labour-state-engine";

const metric = (value: number | null) => ({ value, date: "2026-01-01" });

const steadyLabour: LabourStateInput = {
  unemploymentRate: {
    latest: metric(4.5),
    previousMonth: metric(4.5),
  },
  nonfarmPayrollEmployment: {
    latestMonthlyChange: metric(180),
    previousMonthlyChange: metric(180),
    averageMonthlyChange3m: metric(180),
    averageMonthlyChange6m: metric(180),
  },
  initialJoblessClaims: {
    latest: metric(250_000),
    previousWeek: metric(250_000),
    average4Week: metric(250_000),
  },
  joltsJobOpenings: {
    latest: metric(6500),
    previousMonth: metric(6500),
    threeMonthsAgo: metric(6500),
    sixMonthsAgo: metric(6500),
  },
  averageHourlyEarnings: {
    latestMoM: metric(0.25),
    previousMoM: metric(0.25),
    latestYoY: metric(3.5),
    annualized3m: metric(3.5),
  },
};

describe("Labour State Engine", () => {
  it("classifies a sharp NFP drop as deteriorating momentum", () => {
    const result = calculateLabourState({
      ...steadyLabour,
      nonfarmPayrollEmployment: {
        ...steadyLabour.nonfarmPayrollEmployment,
        latestMonthlyChange: metric(55),
        previousMonthlyChange: metric(190),
      },
    });

    expect(result.momentum).toBe("DETERIORATING");
    expect(result.momentumArrow).toBe("↓↓");
    expect(result.negativeDrivers).toContain("Jobs added slowing");
  });

  it("treats a moderate NFP decline less severely than a sharp one", () => {
    const result = calculateLabourState({
      ...steadyLabour,
      nonfarmPayrollEmployment: {
        ...steadyLabour.nonfarmPayrollEmployment,
        latestMonthlyChange: metric(170),
        previousMonthlyChange: metric(190),
      },
    });

    expect(result.momentum).toBe("COOLING");
    expect(result.momentum).not.toBe("DETERIORATING");
  });

  it("does not let a small NFP change erase a stronger medium-term trend", () => {
    const result = calculateLabourState({
      ...steadyLabour,
      nonfarmPayrollEmployment: {
        latestMonthlyChange: metric(170),
        previousMonthlyChange: metric(190),
        averageMonthlyChange3m: metric(240),
        averageMonthlyChange6m: metric(150),
      },
    });

    expect(result.momentum).toBe("STABLE");
  });

  it("treats rising unemployment and claims as weakening labour signals", () => {
    const result = calculateLabourState({
      ...steadyLabour,
      unemploymentRate: {
        latest: metric(4.8),
        previousMonth: metric(4.5),
      },
      initialJoblessClaims: {
        latest: metric(290_000),
        previousWeek: metric(250_000),
        average4Week: metric(280_000),
      },
    });

    expect(result.negativeDrivers).toContain(
      "Unemployment rate rising (labour weakening)"
    );
    expect(result.negativeDrivers).toContain(
      "Weekly jobless claims rising (labour weakening)"
    );
  });

  it("keeps wage pressure separate from current labour strength", () => {
    const baseline = calculateLabourState(steadyLabour);
    const highWagePressure = calculateLabourState({
      ...steadyLabour,
      averageHourlyEarnings: {
        latestMoM: metric(0.5),
        previousMoM: metric(0.3),
        latestYoY: metric(5.5),
        annualized3m: metric(5.8),
      },
    });

    expect(highWagePressure.state).toBe(baseline.state);
    expect(highWagePressure.wagePressure).toBe("RISING");
    expect(highWagePressure.wagePressureArrow).toBe("↑↑");
  });

  it("does not let one strong indicator determine the overall state", () => {
    const result = calculateLabourState({
      ...steadyLabour,
      unemploymentRate: {
        latest: metric(4.5),
        previousMonth: metric(4.5),
      },
      nonfarmPayrollEmployment: {
        latestMonthlyChange: metric(250),
        previousMonthlyChange: metric(250),
        averageMonthlyChange3m: metric(100),
        averageMonthlyChange6m: metric(100),
      },
      initialJoblessClaims: {
        latest: metric(250_000),
        previousWeek: metric(250_000),
        average4Week: metric(275_000),
      },
      joltsJobOpenings: {
        latest: metric(6000),
        previousMonth: metric(6000),
        threeMonthsAgo: metric(6000),
        sixMonthsAgo: metric(6000),
      },
    });

    expect(result.state).not.toBe("VERY STRONG");
  });

  it("requires at least two independent core indicator groups for a state", () => {
    const result = calculateLabourState({
      ...steadyLabour,
      unemploymentRate: {
        latest: metric(3.2),
        previousMonth: metric(3.3),
      },
      nonfarmPayrollEmployment: {
        latestMonthlyChange: metric(null),
        previousMonthlyChange: metric(null),
        averageMonthlyChange3m: metric(null),
        averageMonthlyChange6m: metric(null),
      },
      initialJoblessClaims: {
        latest: metric(null),
        previousWeek: metric(null),
        average4Week: metric(null),
      },
      joltsJobOpenings: {
        latest: metric(null),
        previousMonth: metric(null),
        threeMonthsAgo: metric(null),
        sixMonthsAgo: metric(null),
      },
    });

    expect(result.state).toBe("UNAVAILABLE");
  });

  it("reports unavailable classifications when required observations are missing", () => {
    const result = calculateLabourState({
      unemploymentRate: {
        latest: metric(null),
        previousMonth: metric(null),
      },
      nonfarmPayrollEmployment: {
        latestMonthlyChange: metric(null),
        previousMonthlyChange: metric(null),
        averageMonthlyChange3m: metric(null),
        averageMonthlyChange6m: metric(null),
      },
      initialJoblessClaims: {
        latest: metric(null),
        previousWeek: metric(null),
        average4Week: metric(null),
      },
      joltsJobOpenings: {
        latest: metric(null),
        previousMonth: metric(null),
        threeMonthsAgo: metric(null),
        sixMonthsAgo: metric(null),
      },
      averageHourlyEarnings: {
        latestMoM: metric(null),
        previousMoM: metric(null),
        latestYoY: metric(null),
        annualized3m: metric(null),
      },
    });

    expect(result.state).toBe("UNAVAILABLE");
    expect(result.momentum).toBe("UNAVAILABLE");
    expect(result.wagePressure).toBe("UNAVAILABLE");
  });

  it("classifies the latest Labour observations independently from wage pressure", () => {
    const result = calculateLabourState({
      unemploymentRate: {
        latest: metric(4.2),
        previousMonth: metric(4.1),
      },
      nonfarmPayrollEmployment: {
        latestMonthlyChange: metric(29),
        previousMonthlyChange: metric(133),
        averageMonthlyChange3m: metric(50.67),
        averageMonthlyChange6m: metric(65.67),
      },
      initialJoblessClaims: {
        latest: metric(197_000),
        previousWeek: metric(198_000),
        average4Week: metric(200_000),
      },
      joltsJobOpenings: {
        latest: metric(7079),
        previousMonth: metric(7335),
        threeMonthsAgo: metric(7537),
        sixMonthsAgo: metric(6922),
      },
      averageHourlyEarnings: {
        latestMoM: metric(0.13),
        previousMoM: metric(0.32),
        latestYoY: metric(3.02),
        annualized3m: metric(2.36),
      },
    });

    expect(result.state).toBe("RESILIENT");
    expect(result.momentum).toBe("DETERIORATING");
    expect(result.wagePressure).toBe("COOLING");
    expect(result.strongestPositiveDriver).toBe("Low 4-week jobless claims");
    expect(result.strongestNegativeDriver).toBe("Jobs added slowing");
    expect(result.positiveDrivers).toEqual([
      "Low 4-week jobless claims",
      "High job openings",
    ]);
    expect(result.negativeDrivers).toEqual([
      "Jobs added slowing",
      "Weak 3-month hiring",
      "Weak 6-month hiring",
      "Unemployment rate rising (labour weakening)",
    ]);
  });
});
