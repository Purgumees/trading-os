/**
 * Eurostat Labour Data Fetcher
 * Retrieves official Euro Area employment, unemployment, and wage data
 * Sources: Eurostat (LFSA, EARN, JVS)
 */

export const EUROSTAT_LABOUR_API_BASE =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";

/**
 * Labour data series from Eurostat
 * - UNR: Unemployment rate (monthly, %)
 * - EMP: Employment rate (annual, %)
 * - JVR: Job vacancy rate - NOT AVAILABLE (no public dataset)
 * - WAGE_GROWTH: Hourly wage/labour cost growth - NOT AVAILABLE (no public dataset)
 * 
 * Note: JVR and WAGE_GROWTH do not have accessible public Eurostat API endpoints
 * as of 2026. Job vacancy data is published by national statistics offices but not
 * aggregated to Euro Area level in real-time. Wage data (LCI) exists but requires
 * different access patterns. These components will be marked unavailable in the engine.
 */
export type EurostatLabourSeriesId = "UNR" | "EMP" | "JVR" | "WAGE_GROWTH";

export type EurostatLabourObservation = {
  date: string; // YYYY-MM (monthly) or YYYY-Q# (quarterly)
  value: number;
  flag: string | null;
};

export type EurostatLabourSeries = {
  id: EurostatLabourSeriesId;
  dataset: string;
  label: string;
  source: "Eurostat";
  sourceUrl: string;
  geo: "EA21" | "EUR";
  unit: "PC" | "PC_POP" | "PC_STOCK"; // Percentage variants
  frequency: "M" | "Q" | "A"; // Monthly, Quarterly, or Annual
  filters: Record<string, string>;
  lastUpdated: string | null;
  freshness: "current" | "stale" | "unavailable";
  latestObservationDate: string;
  observations: EurostatLabourObservation[];
};

type SurveyConfig = {
  id: EurostatLabourSeriesId;
  dataset: string;
  label: string;
  frequency: "M" | "Q" | "A";
  unit: "PC" | "PC_POP" | "PC_STOCK";
  filters: Record<string, string>;
};

const LABOUR_CONFIG: Record<EurostatLabourSeriesId, SurveyConfig> = {
  // Unemployment Rate - Monthly, Eurostat UNE series (une_rt_m)
  // Filters for total, both sexes, all age groups
  UNR: {
    id: "UNR",
    dataset: "une_rt_m",
    label: "Unemployment Rate (monthly, seasonally adjusted)",
    frequency: "M",
    unit: "PC",
    filters: { freq: "M", s_adj: "SA", age: "TOTAL", sex: "T", geo: "EA21" },
  },
  // Employment Rate - Annual, Eurostat LFSA series (lfsa_egan2)
  EMP: {
    id: "EMP",
    dataset: "lfsa_egan2",
    label: "Employment Rate (annual)",
    frequency: "A",
    unit: "PC",
    filters: { freq: "A", sex: "T", age: "Y20-64", geo: "EA21" },
  },
  // Job Vacancy Rate - NOT AVAILABLE (no public Eurostat API dataset)
  JVR: {
    id: "JVR",
    dataset: "",
    label: "Job Vacancy Rate (not available)",
    frequency: "Q",
    unit: "PC",
    filters: { geo: "EA21" },
  },
  // Wage Growth - NOT AVAILABLE (no public Eurostat API dataset)
  WAGE_GROWTH: {
    id: "WAGE_GROWTH",
    dataset: "",
    label: "Wage / Labour Cost Growth (not available)",
    frequency: "Q",
    unit: "PC",
    filters: { geo: "EA21" },
  },
};

function buildEurostatLabourUrl(
  seriesId: EurostatLabourSeriesId,
  asOfDate: string
): string {
  const config = LABOUR_CONFIG[seriesId];
  if (!config) throw new Error(`Unknown labour series: ${seriesId}`);

  const params = new URLSearchParams({
    ...config.filters,
    lang: "en",
  });

  return `${EUROSTAT_LABOUR_API_BASE}/${config.dataset}?${params.toString()}`;
}

type JsonStatDataset = {
  id?: string[];
  size?: number[];
  updated?: unknown;
  value?: Record<string, unknown> | unknown[];
  dimension?: Record<
    string,
    {
      label?: string;
      category?: Record<string, { index?: Record<string, number>; label: string }>;
    }
  >;
  index?: Record<string, number>;
};

function flatIndexFor(
  dimensions: Record<string, { label?: string; category?: Record<string, any> }>,
  coordinateObject: Record<string, string>
): number | string {
  // Try using the index property first (which maps coordinate values to flat indices)
  // If the value is provided directly as a keyed number, use that instead
  const dimIds = Object.keys(dimensions);
  
  // Build the flat index based on the order of dimensions
  let index = 0;
  let multiplier = 1;

  for (let dimIndex = dimIds.length - 1; dimIndex >= 0; dimIndex -= 1) {
    const dimensionId = dimIds[dimIndex]!;
    const coordinate = coordinateObject[dimensionId];
    const dimension = dimensions[dimensionId]!;
    
    // Get the index for this coordinate from the dimension's category indices
    const categoryIndex =
      dimension.category?.index?.[coordinate ?? ""] ?? null;

    if (categoryIndex !== null && categoryIndex !== undefined) {
      index += categoryIndex * multiplier;
    }

    const categoryCount = Object.keys(dimension.category?.label ?? {}).length;
    multiplier *= categoryCount;
  }

  return index;
}

export async function fetchEurostatLabourSeries(
  seriesId: EurostatLabourSeriesId,
  asOfDate: string
): Promise<EurostatLabourSeries> {
  const url = buildEurostatLabourUrl(seriesId, asOfDate);
  const config = LABOUR_CONFIG[seriesId];

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Eurostat API error ${response.status}: ${response.statusText}`
      );
    }

    const jsonStat = (await response.json()) as JsonStatDataset;

    if (!jsonStat.dimension || !jsonStat.value) {
      throw new Error("Invalid JSON-stat response from Eurostat");
    }

    const dimensions = jsonStat.dimension;
    const dimensionIds = Object.keys(dimensions);

    const observations: EurostatLabourObservation[] = [];

    const timeDimension = dimensions.time?.category ?? {};
    // Get actual time values from the label keys, sorted
    const timeCategories = Object.keys(timeDimension.label ?? {}).sort();

    // Filter by requested dimensions: age=TOTAL, sex=T (total), s_adj=SA
    const requestedFilters = config.filters;

    for (const timeValue of timeCategories) {
      const coordinate: Record<string, string> = { time: timeValue };

      // Set dimensions based on request filters or first available category
      for (const dimId of dimensionIds) {
        if (dimId !== "time" && !coordinate[dimId]) {
          const dimCategory = dimensions[dimId]!.category;
          // Get category values from the label property
          const dimCategories = Object.keys(dimCategory?.label ?? {});
          if (dimCategories.length > 0) {
            // Use the requested filter value if it exists, otherwise use first category
            const requestedValue = (requestedFilters as Record<string, string>)[dimId];
            const chosenValue = requestedValue || dimCategories[0]!;
            coordinate[dimId] = chosenValue;
          }
        }
      }

      const flatIndex = flatIndexFor(dimensions, coordinate);
      const rawValue = (jsonStat.value as Record<string | number, unknown>)[flatIndex];

      if (rawValue !== null && rawValue !== undefined) {
        const numValue = Number(rawValue);
        if (!Number.isNaN(numValue)) {
          observations.push({
            date: timeValue,
            value: numValue,
            flag: null,
          });
        }
      }
    }

    if (observations.length === 0) {
      throw new Error(
        `No observations found for labour series ${seriesId}`
      );
    }

    const latestDate = observations[observations.length - 1]!.date;
    const latestObsDate = new Date(latestDate + "-01");
    const asOfDateObj = new Date(asOfDate + "T00:00:00Z");
    const monthsDiff = Math.round(
      (asOfDateObj.getTime() - latestObsDate.getTime()) /
        (1000 * 60 * 60 * 24 * 30)
    );

    const freshness: "current" | "stale" | "unavailable" =
      monthsDiff <= (config.frequency === "M" ? 1 : 2)
        ? "current"
        : monthsDiff <= (config.frequency === "M" ? 3 : 6)
          ? "stale"
          : "unavailable";

    return {
      id: seriesId,
      dataset: config.dataset,
      label: config.label,
      source: "Eurostat",
      sourceUrl: url,
      geo: "EA21",
      unit: config.unit,
      frequency: config.frequency,
      filters: config.filters,
      lastUpdated: new Date().toISOString(),
      freshness,
      latestObservationDate: latestDate,
      observations,
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch labour series ${seriesId}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
