export const EUROSTAT_GROWTH_API_BASE =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
export const EUROSTAT_GROWTH_SINCE = "2020-01";

export type EurostatGrowthSeriesId =
  | "B1GQ"
  | "P31_S14_S15"
  | "INDUSTRIAL_PRODUCTION"
  | "RETAIL_VOLUME";

export type EurostatGrowthObservation = {
  date: string;
  value: number;
  flag: string | null;
};

export type EurostatGrowthSeries = {
  id: EurostatGrowthSeriesId;
  dataset: string;
  label: string;
  source: "Eurostat";
  sourceUrl: string;
  geo: string;
  unit: string;
  frequency: "Q" | "M";
  filters: Record<string, string>;
  lastUpdated: string | null;
  freshness: "current" | "stale";
  latestObservationDate: string | null;
  observations: EurostatGrowthObservation[];
};

type DatasetConfig = {
  id: EurostatGrowthSeriesId;
  dataset: string;
  label: string;
  frequency: "Q" | "M";
  filters: Record<string, string>;
  dimensions: Record<string, { code: string; labelStartsWith: string }>;
  maximumAge: number;
};

const SERIES_CONFIG: Record<EurostatGrowthSeriesId, DatasetConfig> = {
  B1GQ: {
    id: "B1GQ",
    dataset: "namq_10_gdp",
    label: "Real GDP",
    frequency: "Q",
    filters: {
      freq: "Q",
      unit: "CLV20_MEUR",
      s_adj: "SCA",
      na_item: "B1GQ",
      geo: "EA",
      sinceTimePeriod: "2020-Q1",
    },
    dimensions: {
      freq: { code: "Q", labelStartsWith: "Quarterly" },
      unit: { code: "CLV20_MEUR", labelStartsWith: "Chain linked volumes (2020)" },
      s_adj: { code: "SCA", labelStartsWith: "Seasonally and calendar adjusted" },
      na_item: { code: "B1GQ", labelStartsWith: "Gross domestic product at market prices" },
      geo: { code: "EA", labelStartsWith: "Euro area" },
    },
    maximumAge: 2,
  },
  P31_S14_S15: {
    id: "P31_S14_S15",
    dataset: "namq_10_gdp",
    label: "Household and NPISH final consumption expenditure (real)",
    frequency: "Q",
    filters: {
      freq: "Q",
      unit: "CLV20_MEUR",
      s_adj: "SCA",
      na_item: "P31_S14_S15",
      geo: "EA",
      sinceTimePeriod: "2020-Q1",
    },
    dimensions: {
      freq: { code: "Q", labelStartsWith: "Quarterly" },
      unit: { code: "CLV20_MEUR", labelStartsWith: "Chain linked volumes (2020)" },
      s_adj: { code: "SCA", labelStartsWith: "Seasonally and calendar adjusted" },
      na_item: { code: "P31_S14_S15", labelStartsWith: "Household and NPISH final consumption" },
      geo: { code: "EA", labelStartsWith: "Euro area" },
    },
    maximumAge: 2,
  },
  INDUSTRIAL_PRODUCTION: {
    id: "INDUSTRIAL_PRODUCTION",
    dataset: "sts_inpr_m",
    label: "Industrial production (volume)",
    frequency: "M",
    filters: {
      freq: "M",
      indic_bt: "PRD",
      nace_r2: "B-D",
      s_adj: "SCA",
      unit: "I21",
      geo: "EA21",
      sinceTimePeriod: EUROSTAT_GROWTH_SINCE,
    },
    dimensions: {
      freq: { code: "M", labelStartsWith: "Monthly" },
      indic_bt: { code: "PRD", labelStartsWith: "Production (volume)" },
      nace_r2: { code: "B-D", labelStartsWith: "Mining and quarrying; manufacturing" },
      s_adj: { code: "SCA", labelStartsWith: "Seasonally and calendar adjusted" },
      unit: { code: "I21", labelStartsWith: "Index, 2021=100" },
      geo: { code: "EA21", labelStartsWith: "Euro area" },
    },
    maximumAge: 2,
  },
  RETAIL_VOLUME: {
    id: "RETAIL_VOLUME",
    dataset: "sts_trtu_m",
    label: "Retail trade volume",
    frequency: "M",
    filters: {
      freq: "M",
      indic_bt: "VOL_SLS",
      nace_r2: "G47",
      s_adj: "SCA",
      unit: "I21",
      geo: "EA21",
      sinceTimePeriod: EUROSTAT_GROWTH_SINCE,
    },
    dimensions: {
      freq: { code: "M", labelStartsWith: "Monthly" },
      indic_bt: { code: "VOL_SLS", labelStartsWith: "Volume of sales" },
      nace_r2: { code: "G47", labelStartsWith: "Retail trade" },
      s_adj: { code: "SCA", labelStartsWith: "Seasonally and calendar adjusted" },
      unit: { code: "I21", labelStartsWith: "Index, 2021=100" },
      geo: { code: "EA21", labelStartsWith: "Euro area" },
    },
    maximumAge: 2,
  },
};

type JsonStatDataset = {
  id?: string[];
  size?: number[];
  updated?: unknown;
  value?: Record<string, unknown> | unknown[];
  status?: Record<string, unknown>;
  dimension?: Record<
    string,
    { category?: { index?: Record<string, number>; label?: Record<string, string> } }
  >;
};

function currentPeriod(asOfDate: string, frequency: "Q" | "M") {
  const [year, month] = asOfDate.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) {
    throw new Error(`Invalid as-of date for Eurostat growth data: ${asOfDate}.`);
  }
  if (frequency === "M") return `${year}-${String(month).padStart(2, "0")}`;
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

function periodAge(current: string, observed: string, frequency: "Q" | "M") {
  if (frequency === "M") {
    const [currentYear, currentMonth] = current.split("-").map(Number);
    const [observedYear, observedMonth] = observed.split("-").map(Number);
    return (currentYear! - observedYear!) * 12 + currentMonth! - observedMonth!;
  }
  const [currentYear, currentQuarter] = current.split("-Q").map(Number);
  const [observedYear, observedQuarter] = observed.split("-Q").map(Number);
  return (currentYear! - observedYear!) * 4 + currentQuarter! - observedQuarter!;
}

export function buildEurostatGrowthUrl(id: EurostatGrowthSeriesId) {
  const config = SERIES_CONFIG[id];
  const params = new URLSearchParams({ ...config.filters, lang: "en" });
  return `${EUROSTAT_GROWTH_API_BASE}/${config.dataset}?${params.toString()}`;
}

export function parseEurostatGrowthDataset(
  dataset: JsonStatDataset,
  id: EurostatGrowthSeriesId,
  sourceUrl: string,
  asOfDate: string
): EurostatGrowthSeries {
  const config = SERIES_CONFIG[id];
  const ids = dataset.id;
  const sizes = dataset.size;
  const dimensions = dataset.dimension;
  const timeIndex = dimensions?.time?.category?.index;
  const values = dataset.value;
  if (!ids || !sizes || !dimensions || !timeIndex || !values || sizes.length !== ids.length) {
    throw new Error(`Eurostat returned an unsupported JSON-stat shape for ${id}.`);
  }

  const dimensionIndexes: Record<string, number> = {};
  for (const [dimensionId, expected] of Object.entries(config.dimensions)) {
    const dimension = dimensions[dimensionId];
    const labels = dimension?.category?.label;
    const categoryIndex = dimension?.category?.index;
    const observedLabel = labels?.[expected.code];
    const index = categoryIndex?.[expected.code];
    if (
      index === undefined ||
      !observedLabel?.startsWith(expected.labelStartsWith) ||
      sizes[ids.indexOf(dimensionId)] !== 1
    ) {
      throw new Error(
        `Eurostat ${config.dataset} filter ${dimensionId}=${expected.code} returned unexpected category "${observedLabel ?? "missing"}".`
      );
    }
    dimensionIndexes[dimensionId] = index;
  }

  const timeDimensionPosition = ids.indexOf("time");
  if (timeDimensionPosition < 0) {
    throw new Error(`Eurostat ${config.dataset} response for ${id} has no time dimension.`);
  }
  const orderedMonths = Object.entries(timeIndex).sort((left, right) => left[1] - right[1]);
  const observations: EurostatGrowthObservation[] = [];
  for (const [date, timePosition] of orderedMonths) {
    let flatIndex = 0;
    for (let position = 0; position < ids.length; position += 1) {
      const dimensionId = ids[position]!;
      const categoryPosition =
        dimensionId === "time" ? timePosition : dimensionIndexes[dimensionId];
      if (categoryPosition === undefined) {
        throw new Error(`Eurostat response for ${id} contains an unexpected dimension "${dimensionId}".`);
      }
      flatIndex = flatIndex * sizes[position]! + categoryPosition;
    }
    const rawValue = Array.isArray(values)
      ? values[flatIndex]
      : (values as Record<string, unknown>)[String(flatIndex)];
    if (rawValue === null || rawValue === undefined) continue;
    const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (!Number.isFinite(value)) {
      throw new Error(`Eurostat returned a non-numeric ${id} observation at ${date}.`);
    }
    const rawFlag = dataset.status?.[String(flatIndex)];
    observations.push({
      date,
      value,
      flag: typeof rawFlag === "string" ? rawFlag : null,
    });
  }

  const latestObservationDate = observations.at(-1)?.date ?? null;
  if (!latestObservationDate) {
    throw new Error(`Eurostat returned no observations for ${id}.`);
  }
  const age = periodAge(
    currentPeriod(asOfDate, config.frequency),
    latestObservationDate,
    config.frequency
  );

  return {
    id,
    dataset: config.dataset,
    label: config.label,
    source: "Eurostat",
    sourceUrl,
    geo: config.filters.geo!,
    unit: config.filters.unit!,
    frequency: config.frequency,
    filters: { ...config.filters },
    lastUpdated: typeof dataset.updated === "string" ? dataset.updated : null,
    freshness: age >= 0 && age <= config.maximumAge ? "current" : "stale",
    latestObservationDate,
    observations,
  };
}

export async function fetchEurostatGrowthSeries(
  id: EurostatGrowthSeriesId,
  asOfDate = new Date().toISOString().slice(0, 10)
): Promise<EurostatGrowthSeries> {
  const sourceUrl = buildEurostatGrowthUrl(id);
  const response = await fetch(sourceUrl, { next: { revalidate: 3600 } });
  if (!response.ok) {
    throw new Error(
      `Eurostat ${SERIES_CONFIG[id].dataset} request for ${id} failed with HTTP ${response.status}.`
    );
  }
  const dataset = (await response.json()) as JsonStatDataset;
  return parseEurostatGrowthDataset(dataset, id, sourceUrl, asOfDate);
}
