import { describe, expect, it } from "vitest";
import { calculateGrowthState, type GrowthStateInput } from "../src/lib/growth-state-engine";

const steadyGrowth: GrowthStateInput = {
  gdp: {
    latest: { qoqAnnualized: 2.2 },
    recentHistory: [{ qoqAnnualized: 2.2 }, { qoqAnnualized: 2.5 }],
  },
  realPce: {
    latest: { yoy: 3.2 },
    direction3m: "flat",
    direction6m: "flat",
  },
  industrialProduction: {
    latest: { yoy: 1.8 },
    direction3m: "flat",
    direction6m: "flat",
  },
  retailSales: {
    latest: { yoy: 2.4 },
    direction3m: "flat",
    direction6m: "flat",
  },
  ismManufacturing: {
    components: {
      manufacturingPmi: { value: 50, previousValue: 50 },
      newOrders: { value: 56, previousValue: 54 },
    },
  },
  ismServices: {
    components: {
      servicesPmi: { value: 50, previousValue: 50 },
      businessActivity: { value: 51, previousValue: 51 },
      newOrders: { value: 56, previousValue: 54 },
    },
  },
};

describe("Growth State Engine", () => {
  it("keeps positive GDP in expansion while showing slowing momentum", () => {
    const result = calculateGrowthState(steadyGrowth);

    expect(result.state).toBe("EXPANSION");
    expect(result.momentum).toBe("SLOWING");
    expect(result.forwardGrowth).toBe("STRONGLY POSITIVE");
  });

  it("does not classify moderate broad growth as strong expansion", () => {
    const result = calculateGrowthState({
      ...steadyGrowth,
      gdp: {
        latest: { qoqAnnualized: 2.22 },
        recentHistory: [
          { qoqAnnualized: 2.22 },
          { qoqAnnualized: 2.5 },
        ],
      },
      realPce: {
        ...steadyGrowth.realPce,
        latest: { yoy: 2.19 },
      },
      industrialProduction: {
        ...steadyGrowth.industrialProduction,
        latest: { yoy: 1.8 },
      },
      retailSales: {
        ...steadyGrowth.retailSales,
        latest: { yoy: 2.4 },
      },
      ismManufacturing: {
        components: {
          ...steadyGrowth.ismManufacturing!.components,
          manufacturingPmi: { value: 54.5, previousValue: 53.8 },
        },
      },
      ismServices: {
        components: {
          ...steadyGrowth.ismServices!.components,
          servicesPmi: { value: 54.9, previousValue: 54.2 },
        },
      },
    });

    expect(result.state).toBe("EXPANSION");
  });

  it("requires strong confirmation across GDP, real activity, and surveys", () => {
    const strongGrowth: GrowthStateInput = {
      ...steadyGrowth,
      gdp: {
        latest: { qoqAnnualized: 4 },
        recentHistory: [
          { qoqAnnualized: 4 },
          { qoqAnnualized: 3.8 },
        ],
      },
      realPce: {
        ...steadyGrowth.realPce,
        latest: { yoy: 5.2 },
      },
      industrialProduction: {
        ...steadyGrowth.industrialProduction,
        latest: { yoy: 5.1 },
      },
      retailSales: {
        ...steadyGrowth.retailSales,
        latest: { yoy: 5.2 },
      },
      ismManufacturing: {
        components: {
          ...steadyGrowth.ismManufacturing!.components,
          manufacturingPmi: { value: 55.3, previousValue: 54.8 },
        },
      },
      ismServices: {
        components: {
          ...steadyGrowth.ismServices!.components,
          servicesPmi: { value: 55.4, previousValue: 54.9 },
        },
      },
    };

    expect(calculateGrowthState(strongGrowth).state).toBe("STRONG EXPANSION");

    const oneStrongSignal = calculateGrowthState({
      ...strongGrowth,
      realPce: {
        ...strongGrowth.realPce,
        latest: { yoy: null },
      },
      industrialProduction: {
        ...strongGrowth.industrialProduction,
        latest: { yoy: null },
      },
      retailSales: {
        ...strongGrowth.retailSales,
        latest: { yoy: null },
      },
      ismManufacturing: {
        components: {
          ...strongGrowth.ismManufacturing!.components,
          manufacturingPmi: { value: null, previousValue: null },
        },
      },
      ismServices: {
        components: {
          ...strongGrowth.ismServices!.components,
          servicesPmi: { value: null, previousValue: null },
        },
      },
    });

    expect(oneStrongSignal.state).toBe("EXPANSION");
  });

  it("keeps forward orders separate from the current growth state", () => {
    const result = calculateGrowthState({
      ...steadyGrowth,
      ismManufacturing: {
        components: {
          manufacturingPmi: { value: 48, previousValue: 49 },
          newOrders: { value: 58, previousValue: 55 },
        },
      },
      ismServices: {
        components: {
          servicesPmi: { value: 49, previousValue: 50 },
          businessActivity: { value: 49, previousValue: 51 },
          newOrders: { value: 57, previousValue: 54 },
        },
      },
    });

    expect(result.state).not.toBe(result.forwardGrowth);
    expect(result.forwardGrowth).toBe("POSITIVE");
    expect(result.explanations.state).not.toContain("Manufacturing new orders");
    expect(result.explanations.state).not.toContain("Services new orders");
  });

  it("reports current state as unavailable when current signals are missing", () => {
    const result = calculateGrowthState({
      ...steadyGrowth,
      gdp: { latest: { qoqAnnualized: null }, recentHistory: [] },
      realPce: { ...steadyGrowth.realPce, latest: { yoy: null } },
      industrialProduction: {
        ...steadyGrowth.industrialProduction,
        latest: { yoy: null },
      },
      retailSales: { ...steadyGrowth.retailSales, latest: { yoy: null } },
      ismManufacturing: {
        components: {
          manufacturingPmi: { value: null, previousValue: null },
          newOrders: { value: null, previousValue: null },
        },
      },
      ismServices: {
        components: {
          servicesPmi: { value: null, previousValue: null },
          businessActivity: { value: null, previousValue: null },
          newOrders: { value: null, previousValue: null },
        },
      },
    });

    expect(result.state).toBe("UNAVAILABLE");
    expect(result.explanations.state).toContain("unavailable");
  });
});
