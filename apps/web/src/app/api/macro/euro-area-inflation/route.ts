import { NextResponse } from "next/server";
import { calculateEuroAreaInflationState } from "@/lib/euro-area-inflation-state-engine";
import { fetchEurostatHicpSeries } from "@/lib/eurostat-hicp";

export async function GET() {
  try {
    const [headlineResult, coreResult] = await Promise.allSettled([
      fetchEurostatHicpSeries("TOTAL"),
      fetchEurostatHicpSeries("TOT_X_NRG_FOOD"),
    ]);
    const headlineSeries =
      headlineResult.status === "fulfilled" ? headlineResult.value : null;
    const coreSeries = coreResult.status === "fulfilled" ? coreResult.value : null;
    const headlineError =
      headlineResult.status === "rejected"
        ? headlineResult.reason instanceof Error
          ? headlineResult.reason.message
          : "Unknown Eurostat request failure for TOTAL."
        : null;
    const coreError =
      coreResult.status === "rejected"
        ? coreResult.reason instanceof Error
          ? coreResult.reason.message
          : "Unknown Eurostat request failure for TOT_X_NRG_FOOD."
        : null;

    if (headlineError) console.error(`Euro Area headline HICP unavailable: ${headlineError}`);
    if (coreError) console.error(`Euro Area core HICP unavailable: ${coreError}`);

    const euroAreaInflation = calculateEuroAreaInflationState({
      headlineSeries,
      coreSeries,
      headlineError,
      coreError,
    });
    return NextResponse.json({
      status: euroAreaInflation.status,
      euroAreaInflation,
    });
  } catch (error) {
    console.error("Euro Area inflation calculation failed", error);
    return NextResponse.json(
      {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unknown Euro Area inflation calculation error.",
      },
      { status: 500 }
    );
  }
}
