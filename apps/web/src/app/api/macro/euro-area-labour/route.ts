import { NextResponse } from "next/server";
import { calculateEuroAreaLabourState } from "@/lib/euro-area-labour-state-engine";
import {
  fetchEurostatLabourSeries,
  type EurostatLabourSeriesId,
} from "@/lib/eurostat-labour";

// Fetch all available labour series
// WAGE_GROWTH: Not available from public Eurostat API as of 2026
// JVR (Job Vacancy Rate): Not available from public Eurostat API as of 2026
const LABOUR_SERIES_IDS: EurostatLabourSeriesId[] = [
  "UNR",
  "EMP",
  // "WAGE_GROWTH", // Not available
  // "JVR", // Not available
];

export async function GET() {
  try {
    const asOfDate = new Date().toISOString().slice(0, 10);
    const results = await Promise.allSettled(
      LABOUR_SERIES_IDS.map((id) => fetchEurostatLabourSeries(id, asOfDate))
    );

    const series: Partial<
      Record<EurostatLabourSeriesId, Awaited<ReturnType<typeof fetchEurostatLabourSeries>>>
    > = {};
    const errors: Partial<Record<EurostatLabourSeriesId, string>> = {};

    for (const [index, result] of results.entries()) {
      const id = LABOUR_SERIES_IDS[index]!;
      if (result.status === "fulfilled") {
        series[id] = result.value;
      } else {
        const message =
          result.reason instanceof Error ? result.reason.message : "Unknown Eurostat request failure.";
        errors[id] = message;
        console.error(`Euro Area labour series ${id} unavailable: ${message}`);
      }
    }

    const euroAreaLabour = calculateEuroAreaLabourState({
      unemploymentSeries: series.UNR ?? null,
      employmentSeries: series.EMP ?? null,
      jobVacanciesSeries: null, // Not available from public Eurostat API as of 2026
      wageGrowthSeries: null, // Not available from public Eurostat API as of 2026
      errors: {
        ...errors,
        WAGE_GROWTH:
          "Wage growth not available from public Eurostat dissemination API as of 2026. Structure of Earnings Survey (SES) is annual and discontinued; national accounts compensation per employee is not accessible.",
        JVR: "Job Vacancy Rate not available from public Eurostat dissemination API as of 2026.",
      },
    });

    return NextResponse.json({
      status: euroAreaLabour.status,
      euroAreaLabour,
    });
  } catch (error) {
    console.error("Euro Area labour calculation failed", error);
    return NextResponse.json(
      {
        status: "error",
        message:
          error instanceof Error ? error.message : "Unknown Euro Area labour calculation error.",
      },
      { status: 500 }
    );
  }
}
