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
 * - EMP: Employment rate (quarterly, %)
 * - EMPL_GROWTH: Employment growth QoQ (quarterly, %)
 * - JVR: Job vacancy rate (quarterly, %)
 * - WAGE_GROWTH: Hourly wage/labour cost growth (quarterly, %)
 */
export type EurostatLabourSeriesId =
  | "UNR" // Unemployment Rate
  | "EMP" // Employment Rate
  | "JVR" // Job Vacancy Rate
  | "WAGE_GROWTH"; // Hourly Wage/Labour Cost Growth

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
  frequency: "M" | "Q"; // Monthly or Quarterly
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
  frequency: "M" | "Q";
  unit: "PC" | "PC_POP" | "PC_STOCK";
  filters: Record<string, string>;
};

const LABOUR_CONFIG: Record<EurostatLabourSeriesId, SurveyConfig> = {
  // Unemployment Rate - Monthly, Eurostat LFSA series
  UNR: {
    id: "UNR",
    dataset: "lfsa_unemp",
    label: "Unemployment Rate (seasonally adjusted)",
    frequency: "M",
    unit: "PC",
    filters: { freq: "M", s_adj: "SA", sex: "T", age: "Y15-74", geo: "EA21" },
  },
  // Employment Rate - Quarterly, Eurostat LFSA series
  EMP: {
    id: "EMP",
    dataset: "lfsa_egan2",
    label: "Employment Rate (seasonally adjusted)",
    frequency: "Q",
    unit: "PC",
    filters: { freq: "Q", s_adj: "SA", sex: "T", age: "Y20-64", geo: "EA21" },
  },
  // Job Vacancy Rate - Quarterly, Eurostat JVST
  JVR: {
    id: "JVR",
    dataset: "jvst_annex1",
    label: "Job Vacancy Rate (seasonally adjusted)",
    frequency: "Q",
    unit: "PC_STOCK",
    filters: { freq: "Q", s_adj: "SA", geo: "EA21" },
  },
  // Hourly Wage/Labour Cost Growth - Quarterly, Eurostat EARN
  WAGE_GROWTH: {
    id: "WAGE_GROWTH",
    dataset: "earn_hrl_ind2c",
    label: "Hourly Earnings growth, all NACE sectors",
    frequency: "Q",
    unit: "PC",
    filters: { freq: "Q", nace_r2: "TOTAL", geo: "EA21" },
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
): number {
  let index = 0;
  let multiplier = 1;

  const dimensionIds = Object.keys(dimensions);
  for (let dimIndex = dimensionIds.length - 1; dimIndex >= 0; dimIndex -= 1) {
    const dimensionId = dimensionIds[dimIndex]!;
    const coordinate = coordinateObject[dimensionId];
    const dimension = dimensions[dimensionId]!;
    const categoryIndex =
      dimension.category?.[coordinate ?? ""]?.index?.[coordinate ?? ""] ?? null;

    if (categoryIndex !== null && categoryIndex !== undefined) {
      index += categoryIndex * multiplier;
    }

    const categoryCount = Object.keys(dimension.category ?? {}).length;
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

    const timeDimension =
      dimensions.time?.category ?? {};
    const timeCategories = Object.keys(timeDimension).sort();

    for (const timeValue of timeCategories) {
      const coordinate: Record<string, string> = { time: timeValue };

      // Set other dimensions to their first available category
      for (const dimId of dimensionIds) {
        if (dimId !== "time") {
          const dimCategories = Object.keys(dimensions[dimId]!.category ?? {});
          if (dimCategories.length > 0 && !coordinate[dimId]) {
            coordinate[dimId] = dimCategories[0]!;
          }
        }
      }

      const flatIndex = flatIndexFor(dimensions, coordinate);
      const rawValue = (jsonStat.value as Record<string, unknown>)[flatIndex];

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
