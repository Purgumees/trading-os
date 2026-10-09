import type { HistoricalDataDisplayProps, HistoricalObservation } from "@/components/HistoricalDataDisplay";
import type { EuroHicpSeriesResult } from "@/lib/euro-area-inflation-state-engine";
import type { EuroAreaLabourIndicator } from "@/lib/euro-area-labour-state-engine";

/**
 * Transform Eurostat HICP series data into HistoricalDataDisplay format
 */
export function transformHicpToHistoricalDisplay(
  series: EuroHicpSeriesResult
): HistoricalDataDisplayProps {
  const observations: HistoricalObservation[] = (series.rawObservations || []).map(
    (obs: { date: string; index: number | null; flag: string | null }) => ({
      date: obs.date,
      value: obs.index,
      flag: obs.flag,
    })
  );

  return {
    label: series.label,
    currentValue: series.latest?.yoy?.value ?? null,
    previousValue: null,
    latestDate: series.latest?.yoy?.date ?? null,
    unit: "% YoY",
    frequency: "M",
    observations,
    source: series.source,
    sourceUrl: series.sourceUrl ?? undefined,
    freshness: series.freshness,
    trend:
      series.momentum?.shortTerm === "COOLING" ||
      series.momentum?.shortTerm === "COOLING RAPIDLY"
        ? "down"
        : series.momentum?.shortTerm === "HEATING" ||
            series.momentum?.shortTerm === "HEATING RAPIDLY"
          ? "up"
          : "flat",
  };
}

/**
 * Transform Labour indicator data into HistoricalDataDisplay format
 */
export function transformLabourToHistoricalDisplay(
  indicator: EuroAreaLabourIndicator,
  label: string
): HistoricalDataDisplayProps {
  const observations: HistoricalObservation[] = (indicator.rawObservations || []).map(
    (obs: { date: string; value: number | null }) => ({
      date: obs.date,
      value: obs.value,
    })
  );

  const latestValue = indicator.latest?.value ?? null;
  const previousValue = indicator.previous?.value ?? null;

  return {
    label,
    currentValue: latestValue,
    previousValue,
    latestDate: indicator.latest?.date ?? null,
    unit: indicator.unit ?? "%",
    frequency: (indicator.frequency || "M") as "M" | "Q" | "A" | "W" | "D",
    observations,
    source: indicator.source ?? "Eurostat",
    sourceUrl: indicator.sourceUrl ?? undefined,
    freshness: indicator.freshness,
    trend:
      indicator.direction6m === "down"
        ? "down"
        : indicator.direction6m === "up"
          ? "up"
          : "flat",
  };
}

/**
 * Extract latest observations based on frequency
 */
export function getObservationsByFrequency(
  observations: HistoricalObservation[],
  frequency: string
): HistoricalObservation[] {
  const limits: Record<string, number> = {
    D: 20,
    W: 8,
    M: 6,
    Q: 6,
    A: 5,
  };
  const limit = limits[frequency] || 6;
  return observations.slice(0, limit);
}
