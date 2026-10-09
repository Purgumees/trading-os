import { NextResponse } from "next/server";
import { calculateEuroAreaGrowthState } from "@/lib/euro-area-growth-state-engine";
import {
  fetchEurostatGrowthSeries,
  type EurostatGrowthSeriesId,
} from "@/lib/eurostat-growth";
import {
  fetchEurostatEcSurveySeries,
  type EurostatEcSurveyId,
} from "@/lib/eurostat-ec-surveys";

const SERIES_IDS: EurostatGrowthSeriesId[] = [
  "B1GQ",
  "P31_S14_S15",
  "INDUSTRIAL_PRODUCTION",
  "RETAIL_VOLUME",
];

const SURVEY_IDS: EurostatEcSurveyId[] = ["BS-IOB", "BS-IPE", "BS-SAEM"];

export async function GET() {
  try {
    const asOfDate = new Date().toISOString().slice(0, 10);
    const results = await Promise.allSettled(
      SERIES_IDS.map((id) => fetchEurostatGrowthSeries(id, asOfDate))
    );
    const surveyResults = await Promise.allSettled(
      SURVEY_IDS.map((id) => fetchEurostatEcSurveySeries(id, asOfDate))
    );
    const series: Partial<
      Record<EurostatGrowthSeriesId, Awaited<ReturnType<typeof fetchEurostatGrowthSeries>>>
    > = {};
    const errors: Partial<Record<EurostatGrowthSeriesId, string>> = {};
    const surveys: Partial<
      Record<EurostatEcSurveyId, Awaited<ReturnType<typeof fetchEurostatEcSurveySeries>>>
    > = {};
    const surveyErrors: Partial<Record<EurostatEcSurveyId, string>> = {};

    for (const [index, result] of results.entries()) {
      const id = SERIES_IDS[index]!;
      if (result.status === "fulfilled") {
        series[id] = result.value;
      } else {
        const message =
          result.reason instanceof Error ? result.reason.message : "Unknown Eurostat request failure.";
        errors[id] = message;
        console.error(`Euro Area growth series ${id} unavailable: ${message}`);
      }
    }

    for (const [index, result] of surveyResults.entries()) {
      const id = SURVEY_IDS[index]!;
      if (result.status === "fulfilled") {
        surveys[id] = result.value;
      } else {
        const message =
          result.reason instanceof Error ? result.reason.message : "Unknown Eurostat EC survey request failure.";
        surveyErrors[id] = message;
        console.error(`Euro Area forward survey ${id} unavailable: ${message}`);
      }
    }

    const euroAreaGrowth = calculateEuroAreaGrowthState({
      gdpSeries: series.B1GQ ?? null,
      householdConsumptionSeries: series.P31_S14_S15 ?? null,
      industrialProductionSeries: series.INDUSTRIAL_PRODUCTION ?? null,
      retailSalesSeries: series.RETAIL_VOLUME ?? null,
      manufacturingOrderBooks: surveys["BS-IOB"] ?? null,
      manufacturingProductionExpectations: surveys["BS-IPE"] ?? null,
      servicesDemandExpectations: surveys["BS-SAEM"] ?? null,
      errors,
      surveyErrors,
    });

    return NextResponse.json({
      status: euroAreaGrowth.status,
      euroAreaGrowth,
    });
  } catch (error) {
    console.error("Euro Area growth calculation failed", error);
    return NextResponse.json(
      {
        status: "error",
        message:
          error instanceof Error ? error.message : "Unknown Euro Area growth calculation error.",
      },
      { status: 500 }
    );
  }
}
