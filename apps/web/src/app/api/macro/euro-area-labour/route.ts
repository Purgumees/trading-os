import { NextResponse } from "next/server";
import { calculateEuroAreaLabourState } from "@/lib/euro-area-labour-state-engine";
import {
  fetchEurostatLabourSeries,
  type EurostatLabourSeriesId,
} from "@/lib/eurostat-labour";

// Only fetch series that have publicly available Eurostat datasets
// JVR and WAGE_GROWTH do not have accessible public datasets as of 2026
const LABOUR_SERIES_IDS: EurostatLabourSeriesId[] = [
  "UNR",
  "EMP",
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
      jobVacanciesSeries: null, // Not available from public Eurostat API
      wageGrowthSeries: null, // Not available from public Eurostat API
      errors,
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
