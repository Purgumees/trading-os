import { describe, expect, it } from "vitest";
import {
  buildInflationMonthlyHistory,
  calculateInflationState,
  type InflationObservation,
  type InflationSeriesInput,
  type InflationStateInput,
} from "../src/lib/inflation-state-engine";

function series({
  current = 2,
  oneMonth = current,
  threeMonths = current,
  sixMonths = current,
  mom = 0.16,
  annualized3m = 1.95,
  date = "2025-01-01",
  historicalObservations,
}: {
  current?: number;
  oneMonth?: number;
  threeMonths?: number;
  sixMonths?: number;
  mom?: number;
  annualized3m?: number;
  date?: string;
  historicalObservations?: InflationSeriesInput["historicalObservations"];
} = {}): InflationSeriesInput {
  return {
    currentYoY: { value: current, date },
    oneMonthAgoYoY: { value: oneMonth },
    threeMonthsAgoYoY: { value: threeMonths },
    sixMonthsAgoYoY: { value: sixMonths },
    latestMoM: { value: mom },
    annualized3m: { value: annualized3m },
    historicalObservations,
  };
}

const neutralInflation: InflationStateInput = {
  headlineCpi: series(),
  headlinePce: series(),
  coreCpi: series(),
  corePce: series(),
  ismManufacturingPrices: { value: 55, previousValue: 55 },
  ismServicesPrices: { value: 55, previousValue: 55 },
};

function monthlyHistory(count: number, futureMonths = 0) {
  const values: Array<{ date: string; value: number }> = [];
  const end = new Date("2025-01-01T00:00:00Z");
  const monthlyInflation: number[] = [];
  for (let index = 0; index < count + futureMonths; index += 1) {
    monthlyInflation.push(2 + (index % 8) * 0.13);
  }
  let level = 100;
  const oldestToNewest: Array<{ date: string; value: number }> = [];
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - count + 1);
  for (let index = 0; index < count + futureMonths; index += 1) {
    const date = new Date(start);
    date.setUTCMonth(start.getUTCMonth() + index);
    if (index > 0) level *= 1 + monthlyInflation[index - 1]! / 1200;
    oldestToNewest.push({ date: date.toISOString().slice(0, 10), value: level });
  }
  values.push(...oldestToNewest.reverse());
  return values;
}

describe("Inflation State Engine", () => {
  it("weights core inflation more heavily without suppressing a hot headline reading", () => {
    const result = calculateInflationState({
      ...neutralInflation,
      headlineCpi: series({ current: 8 }),
      headlinePce: series({ current: 8 }),
    });

    expect(result.current.core).toBe("NEAR TARGET");
    expect(result.current.headline).toBe("VERY HIGH");
    expect(result.current.overall).toBe("MODERATELY ABOVE TARGET");
  });

  it("preserves divergent headline heating and core cooling", () => {
    const result = calculateInflationState({
      ...neutralInflation,
      headlineCpi: series({
        current: 4.2,
        oneMonth: 3.7,
        threeMonths: 3.3,
        sixMonths: 3,
        mom: 0.45,
        annualized3m: 5,
      }),
      headlinePce: series({
        current: 4,
        oneMonth: 3.6,
        threeMonths: 3.2,
        sixMonths: 2.9,
        mom: 0.4,
        annualized3m: 4.5,
      }),
      coreCpi: series({
        current: 2.6,
        oneMonth: 2.7,
        threeMonths: 3,
        sixMonths: 3.2,
        mom: 0.1,
        annualized3m: 1.3,
      }),
      corePce: series({
        current: 2.5,
        oneMonth: 2.6,
        threeMonths: 2.9,
        sixMonths: 3.1,
        mom: 0.1,
        annualized3m: 1.3,
      }),
    });

    expect(result.momentum.headline).toContain("HEATING");
    expect(result.momentum.core).toContain("COOLING");
    expect(result.momentum.divergence).toContain("while");
  });

  it("uses 3- and 6-month context so one hot month cannot dominate momentum", () => {
    const result = calculateInflationState({
      ...neutralInflation,
      coreCpi: series({
        current: 3,
        oneMonth: 2.5,
        threeMonths: 3,
        sixMonths: 3,
        mom: 0.17,
        annualized3m: 2.05,
      }),
      corePce: series({
        current: 3,
        oneMonth: 2.5,
        threeMonths: 3,
        sixMonths: 3,
        mom: 0.16,
        annualized3m: 1.95,
      }),
    });

    expect(result.momentum.series.coreCpi.state).not.toBe("HEATING RAPIDLY");
    expect(result.momentum.core).not.toBe("HEATING RAPIDLY");
  });

  it("reports short-term reacceleration separately from medium-term cooling", () => {
    const result = calculateInflationState({
      ...neutralInflation,
      headlineCpi: series({
        current: 3,
        oneMonth: 2.8,
        threeMonths: 3.5,
        sixMonths: 3.8,
        mom: 0.35,
        annualized3m: 4.5,
      }),
      headlinePce: series({
        current: 3,
        oneMonth: 2.8,
        threeMonths: 3.5,
        sixMonths: 3.8,
        mom: 0.35,
        annualized3m: 4.5,
      }),
    });

    expect(result.momentum.shortTerm.headline).toBe("HEATING");
    expect(result.momentum.mediumTerm.headline).toBe("COOLING RAPIDLY");
    expect(result.momentum.shortMediumDivergence).toContain(
      "Headline is medium-term cooling, short-term reaccelerating."
    );
  });

  it("builds six consecutive chronological months without interpolating gaps", () => {
    const observations: InflationObservation[] = [
      ["2024-08-01", 121],
      ["2024-07-01", 120],
      ["2024-06-01", 119],
      ["2024-05-01", 118],
      ["2024-04-01", 117],
      ["2024-03-01", 116],
      ["2024-02-01", 115],
      ["2023-08-01", 110],
      ["2023-07-01", 109],
      ["2023-06-01", 108],
      ["2023-05-01", 107],
      ["2023-04-01", 106],
      ["2023-03-01", 105],
      ["2023-02-01", 104],
    ].map(([date, value]) => ({
      date: String(date),
      value: Number(value),
    }));

    const history = buildInflationMonthlyHistory(observations);

    expect(history.map((item) => item.date)).toEqual([
      "2024-03-01",
      "2024-04-01",
      "2024-05-01",
      "2024-06-01",
      "2024-07-01",
      "2024-08-01",
    ]);
    expect(history.map((item) => item.yoy)).toEqual([10.48, 10.38, 10.28, 10.19, 10.09, 10]);
    expect(history.map((item) => item.mom)).toEqual([
      0.87,
      0.86,
      0.85,
      0.85,
      0.84,
      0.83,
    ]);
  });

  it("leaves a missing monthly index comparison blank instead of filling it", () => {
    const observations: InflationObservation[] = [
      { date: "2024-08-01", value: 121 },
      { date: "2024-07-01", value: 120 },
      { date: "2024-06-01", value: 119 },
      { date: "2024-05-01", value: 118 },
      { date: "2024-04-01", value: 117 },
      { date: "2024-03-01", value: 116 },
      { date: "2024-02-01", value: 115 },
      { date: "2023-08-01", value: 110 },
      { date: "2023-07-01", value: 109 },
      { date: "2023-06-01", value: 108 },
      { date: "2023-04-01", value: 106 },
      { date: "2023-03-01", value: 105 },
      { date: "2023-02-01", value: 104 },
    ];

    const history = buildInflationMonthlyHistory(observations);
    const may = history.find((item) => item.date === "2024-05-01");

    expect(may).toEqual({ date: "2024-05-01", yoy: null, mom: 0.85 });
  });

  it("treats a sharp manufacturing survey price jump as surging pressure", () => {
    const result = calculateInflationState({
      ...neutralInflation,
      ismManufacturingPrices: { value: 77.9, previousValue: 71.1 },
      ismServicesPrices: { value: 55, previousValue: 55 },
    });

    expect(result.forwardPricePressure.state).toBe("SURGING");
    expect(result.forwardPricePressure.strongestDriver).toBe("Manufacturing prices");
  });

  it("uses prior-only historical calibration for outliers and ignores future observations", () => {
    const history = monthlyHistory(61);
    const historyWithFuture = monthlyHistory(61, 2);
    const base = series({
      current: 3.5,
      oneMonth: 3,
      threeMonths: 2.8,
      sixMonths: 2.6,
      mom: 0.5,
      annualized3m: 5,
      historicalObservations: history,
    });
    const withFuture = {
      ...base,
      historicalObservations: historyWithFuture,
    };
    const result = calculateInflationState({
      ...neutralInflation,
      corePce: base,
    });
    const futureResult = calculateInflationState({
      ...neutralInflation,
      corePce: withFuture,
    });

    expect(result.momentum.series.corePce.calibration).toBe("historical");
    expect(futureResult.momentum.series.corePce.calibration).toBe("historical");
    expect(result.momentum.series.corePce.oneMonthCalibrationScore).toBe(2);
    expect(futureResult.momentum.series.corePce.oneMonthCalibrationScore).toBe(
      result.momentum.series.corePce.oneMonthCalibrationScore,
    );
    expect(futureResult.momentum.series.corePce.state).toBe(result.momentum.series.corePce.state);
  });

  it("uses series-specific fallback thresholds when historical calibration is insufficient", () => {
    const result = calculateInflationState({
      ...neutralInflation,
      corePce: series({ current: 3, oneMonth: 2.74 }),
      headlineCpi: series({ current: 3, oneMonth: 2.74 }),
    });

    expect(result.momentum.series.corePce.calibration).toBe("fallback");
    expect(result.momentum.series.headlineCpi.calibration).toBe("fallback");
    expect(result.momentum.series.corePce.oneMonthCalibrationScore).toBe(2);
    expect(result.momentum.series.headlineCpi.oneMonthCalibrationScore).toBe(1);
  });

  it("does not mistake missing readings for stable inflation", () => {
    const unavailable = {
      currentYoY: { value: null, date: null },
      oneMonthAgoYoY: { value: null },
      threeMonthsAgoYoY: { value: null },
      sixMonthsAgoYoY: { value: null },
      latestMoM: { value: null },
      annualized3m: { value: null },
    };
    const result = calculateInflationState({
      headlineCpi: unavailable,
      headlinePce: unavailable,
      coreCpi: unavailable,
      corePce: unavailable,
      ismManufacturingPrices: null,
      ismServicesPrices: null,
    });

    expect(result.current.overall).toBe("UNAVAILABLE");
    expect(result.momentum.core).toBe("UNAVAILABLE");
    expect(result.forwardPricePressure.state).toBe("UNAVAILABLE");
  });
});
