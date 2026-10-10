/**
 * Eurostat Labour Data Fetcher
 * Retrieves official Euro Area employment, unemployment, and wage data
 * Sources: Eurostat (LFSA, EARN, JVS)
 */

export const EUROSTAT_LABOUR_API_BASE =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";

/**
 * Labour data series from Eurostat
 * 
 * - UNR: Unemployment rate (monthly, seasonally adjusted, %)
 *   Dataset: une_rt_m, Unit: PC_ACT, Frequency: Monthly
 * 
 * - EMP: Employment level (annual, thousands of persons, ages 20-64)
 *   Dataset: lfsa_egan2, Unit: THS_PER, Frequency: Annual
 *   CRITICAL: Annual frequency means only YoY changes are valid. Do NOT use for 3M/6M momentum.
 * 
 * - JVR: Job vacancy rate (quarterly, %)
 *   Dataset: jvs_q_r21, Indicator: JVR, Frequency: Quarterly, S_Adj: SA
 *   Euro Area aggregate: NACE_R2_1=B-T; request indic_em=JVR and sizeclas=TOTAL
 * 
 * - WAGE_GROWTH: Labour Cost Index quarterly growth (%)
 *   Dataset: lc_lci_r2_q, Unit: PCH_SM, Frequency: Quarterly, S_Adj: CA
 *   Represents YoY % change in hourly labour cost across all activities
 *   NOTE: This is a cost index, not a wage series. Reflects total compensation including non-wage benefits.
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
  unit: "PC" | "PC_POP" | "PC_STOCK" | "PC_ACT" | "THS_PER" | "PCH_SM_PER" | "PCH_SM"; // Percentage variants, level, YoY change, and percentage point change
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
  unit: "PC" | "PC_POP" | "PC_STOCK" | "PC_ACT" | "THS_PER" | "PCH_SM_PER" | "PCH_SM";
  filters: Record<string, string>;
};

const LABOUR_CONFIG: Record<EurostatLabourSeriesId, SurveyConfig> = {
  // Unemployment Rate - Monthly, Eurostat LFSA series
  // Dataset: une_rt_m
  // Unit: PC_ACT (Percentage of population in the labour force)
  // Frequency: M (monthly), Seasonally Adjusted
  // Geography: EA21 (Euro area 21 countries)
  UNR: {
    id: "UNR",
    dataset: "une_rt_m",
    label: "Unemployment Rate (monthly, seasonally adjusted, %)",
    frequency: "M",
    unit: "PC_ACT",
    filters: {
      freq: "M",
      s_adj: "SA",
      age: "TOTAL",
      sex: "T",
      unit: "PC_ACT",
      geo: "EA21",
    },
  },
  
  // Employment Level - Annual, Eurostat LFSA series
  // Dataset: lfsa_egan2
  // Unit: THS_PER (Thousands of Persons) - absolute level, NOT rate
  // Frequency: A (annual), ages 20-64
  // CRITICAL: This is annual data. Only YoY changes are valid.
  // Do NOT use for 3M/6M momentum calculations - use employment rate or quarterly employment instead.
  EMP: {
    id: "EMP",
    dataset: "lfsa_egan2",
    label: "Employment Level (ages 20-64, annual, thousands of persons)",
    frequency: "A",
    unit: "THS_PER",
    filters: {
      freq: "A",
      sex: "T",
      age: "Y20-64",
      nace_r2: "TOTAL",
      geo: "EA21",
    },
  },

  // Job Vacancy Rate - Quarterly, Eurostat JVS
  // Dataset: jvs_q_r21 (Job Vacancy Statistics by NACE Rev. 2.1 activity)
  // Unit: PC (percentage of total posts)
  // Frequency: Q (quarterly), Not Seasonally Adjusted
  // Geography: EA21 (Euro area aggregate, NACE_R2_1=B-T)
  JVR: {
    id: "JVR",
    dataset: "jvs_q_r21",
    label: "Job Vacancy Rate (quarterly, %)",
    frequency: "Q",
    unit: "PC",
    filters: {
      freq: "Q",
      s_adj: "SA",
      indic_em: "JVR",
      sizeclas: "TOTAL",
      nace_r2_1: "B-T",
      geo: "EA21",
    },
  },

  // Labour Cost Index - Quarterly growth
  // Dataset: lc_lci_r2_q (Labour Cost Index by NACE Rev. 2 activity - quarterly)
  // Unit: PCH_SM (percentage change compared with the same quarter a year earlier)
  // Represents YoY % change in nominal hourly wages and salaries (lcstruct=D11)
  // Frequency: Q (quarterly), Calendar Adjusted
  // Geography: EA21 (Euro area aggregate, NACE_R2=B-S)
  // IMPORTANT: This is a wages-and-salaries hourly cost index, not pay per employee.
  // Employer social contributions are excluded by lcstruct=D11.
  WAGE_GROWTH: {
    id: "WAGE_GROWTH",
    dataset: "lc_lci_r2_q",
    label: "Wages and salaries hourly cost growth (quarterly, YoY %)",
    frequency: "Q",
    unit: "PCH_SM",
    filters: {
      freq: "Q",
      s_adj: "CA",
      nace_r2: "B-S",
      lcstruct: "D11",
      unit: "PCH_SM",
      geo: "EA21",
    },
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
      category?: {
        index?: Record<string, number>;
        label?: Record<string, string>;
      };
    }
  >;
  index?: Record<string, number>;
};

function flatIndexFor(
  dataset: JsonStatDataset,
  coordinateObject: Record<string, string>
): number {
  const ids = dataset.id;
  const sizes = dataset.size;
  const dimensions = dataset.dimension;
  if (!ids || !sizes || !dimensions || ids.length !== sizes.length) {
    throw new Error("Invalid JSON-stat dimension order or sizes");
  }

  let index = 0;
  for (let i = 0; i < ids.length; i += 1) {
    const dimId = ids[i]!;
    const coordinate = coordinateObject[dimId];
    const category = dimensions[dimId]?.category;
    const categoryIndex = category?.index?.[coordinate ?? ""];
    if (coordinate === undefined || typeof categoryIndex !== "number") {
      throw new Error(`Missing Eurostat category ${dimId}=${coordinate ?? "undefined"}`);
    }
    index = index * sizes[i]! + categoryIndex;
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
    const dimensionIds = jsonStat.id ?? Object.keys(dimensions);

    const observations: EurostatLabourObservation[] = [];

    const timeDimension = dimensions.time?.category ?? {};
    // Get actual time values from the label keys, sorted
    const timeCategories = Object.keys(timeDimension.index ?? timeDimension.label ?? {}).sort();

    // Filter by requested dimensions: age=TOTAL, sex=T (total), s_adj=SA
    const requestedFilters = config.filters;

    for (const timeValue of timeCategories) {
      const coordinate: Record<string, string> = { time: timeValue };

      // Set dimensions based on request filters or first available category
      for (const dimId of dimensionIds) {
        if (dimId !== "time" && !coordinate[dimId]) {
          const dimCategory = dimensions[dimId]!.category;
          // Get category values from the label property
          const dimCategories = Object.keys(dimCategory?.index ?? dimCategory?.label ?? {});
          if (dimCategories.length > 0) {
            // Use the requested filter value if it exists, otherwise use first category
            const requestedValue = (requestedFilters as Record<string, string>)[dimId];
            // Never silently substitute a different indicator/geography if a requested code is absent.
            if (requestedValue && !dimCategories.includes(requestedValue)) {
              throw new Error(`Missing requested Eurostat dimension ${dimId}=${requestedValue}`);
            }
            if (!requestedValue && dimCategories.length !== 1) {
              throw new Error(`Ambiguous Eurostat dimension ${dimId}: ${dimCategories.join(", ")}`);
            }
            const chosenValue = requestedValue ?? dimCategories[0]!;
            coordinate[dimId] = chosenValue;
          }
        }
      }

      const flatIndex = flatIndexFor(jsonStat, coordinate);
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
    
    // Handle different date formats: YYYY (annual), YYYY-MM (monthly), YYYY-Qx (quarterly)
    let latestObsDate: Date;
    if (config.frequency === "A") {
      // Annual: treat as end of year (Dec 31)
      latestObsDate = new Date(`${latestDate}-12-31T23:59:59Z`);
    } else if (config.frequency === "Q") {
      // Quarterly: parse Qx to month (Q1=01, Q2=04, Q3=07, Q4=10)
      const [year, quarter] = latestDate.split("-");
      const quarterNum = parseInt(quarter!.replace("Q", ""));
      const month = String((quarterNum - 1) * 3 + 1).padStart(2, "0");
      latestObsDate = new Date(`${year}-${month}-01T00:00:00Z`);
    } else {
      // Monthly: YYYY-MM format
      latestObsDate = new Date(`${latestDate}-01T00:00:00Z`);
    }
    
    const asOfDateObj = new Date(asOfDate + "T00:00:00Z");
    const monthsDiff = Math.round(
      (asOfDateObj.getTime() - latestObsDate.getTime()) /
        (1000 * 60 * 60 * 24 * 30)
    );

    const freshness: "current" | "stale" | "unavailable" =
      config.frequency === "A"
        ? // Annual data: current if <= 4 months, stale if <= 15 months, unavailable if > 15 months
          monthsDiff <= 4
          ? "current"
          : monthsDiff <= 15
            ? "stale"
            : "unavailable"
        : config.frequency === "Q"
          ? // Quarterly data: current if <= 2 months, stale if <= 6 months
            monthsDiff <= 2
            ? "current"
            : monthsDiff <= 6
              ? "stale"
              : "unavailable"
          : // Monthly data: current if <= 1 month, stale if <= 3 months
            monthsDiff <= 1
            ? "current"
            : monthsDiff <= 3
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
