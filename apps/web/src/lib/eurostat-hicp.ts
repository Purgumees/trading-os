export const EUROSTAT_HICP_DATASET = "prc_hicp_minr";
export const EUROSTAT_HICP_GEO = "EA";
export const EUROSTAT_HICP_UNIT = "I25";
export const EUROSTAT_HICP_FREQUENCY = "M";
export const EUROSTAT_HICP_SINCE = "2020-01";
export const EUROSTAT_API_BASE =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";

export type EurostatHicpSeriesId = "TOTAL" | "TOT_X_NRG_FOOD";

export type EurostatHicpObservation = {
  date: string;
  index: number;
  flag: string | null;
};

export type EurostatHicpSeries = {
  dataset: typeof EUROSTAT_HICP_DATASET;
  code: EurostatHicpSeriesId;
  label: string;
  geo: typeof EUROSTAT_HICP_GEO;
  unit: typeof EUROSTAT_HICP_UNIT;
  frequency: typeof EUROSTAT_HICP_FREQUENCY;
  source: "Eurostat";
  sourceUrl: string;
  lastUpdated: string | null;
  observations: EurostatHicpObservation[];
};

type JsonStatDataset = {
  label?: unknown;
  updated?: unknown;
  value?: Record<string, unknown> | unknown[];
  status?: Record<string, unknown>;
  dimension?: {
    coicop18?: { category?: { label?: Record<string, string> } };
    geo?: { category?: { label?: Record<string, string> } };
    time?: { category?: { index?: Record<string, number> } };
  };
};

export const EUROSTAT_HICP_SERIES: Record<
  EurostatHicpSeriesId,
  { label: string; coicopLabel: string }
> = {
  TOTAL: {
    label: "Headline HICP",
    coicopLabel: "Total",
  },
  TOT_X_NRG_FOOD: {
    label: "Core HICP (excluding energy, food, alcohol and tobacco)",
    coicopLabel: "Overall index excluding energy, food, alcohol and tobacco",
  },
};

export function buildEurostatHicpUrl(code: EurostatHicpSeriesId) {
  const params = new URLSearchParams({
    freq: EUROSTAT_HICP_FREQUENCY,
    unit: EUROSTAT_HICP_UNIT,
    coicop18: code,
    geo: EUROSTAT_HICP_GEO,
    sinceTimePeriod: EUROSTAT_HICP_SINCE,
    lang: "en",
  });
  return `${EUROSTAT_API_BASE}/${EUROSTAT_HICP_DATASET}?${params.toString()}`;
}

export function parseEurostatHicpDataset(
  dataset: JsonStatDataset,
  code: EurostatHicpSeriesId,
  sourceUrl: string
): EurostatHicpSeries {
  const timeIndex = dataset.dimension?.time?.category?.index;
  if (!timeIndex || !dataset.value || Array.isArray(dataset.value)) {
    throw new Error(`Eurostat returned an unsupported JSON-stat shape for ${code}.`);
  }

  const categories = dataset.dimension?.coicop18?.category?.label;
  const observedCategory = categories?.[code];
  if (observedCategory !== EUROSTAT_HICP_SERIES[code].coicopLabel) {
    throw new Error(
      `Eurostat COICOP 2018 filter ${code} returned unexpected category "${observedCategory ?? "missing"}".`
    );
  }
  const geoLabel = dataset.dimension?.geo?.category?.label?.[EUROSTAT_HICP_GEO];
  if (!geoLabel?.startsWith("Euro area")) {
    throw new Error(
      `Eurostat geography filter ${EUROSTAT_HICP_GEO} returned unexpected category "${geoLabel ?? "missing"}".`
    );
  }

  const indexedMonths = Object.entries(timeIndex)
    .map(([date, index]) => ({ date, index }))
    .sort((left, right) => left.index - right.index);
  const values = dataset.value as Record<string, unknown>;
  const observations: EurostatHicpObservation[] = [];
  for (const month of indexedMonths) {
    const raw = values[String(month.index)];
    if (raw === null || raw === undefined) continue;
    const indexValue = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(indexValue)) {
      throw new Error(`Eurostat returned a non-numeric HICP observation for ${code} at ${month.date}.`);
    }
    observations.push({
      date: month.date,
      index: indexValue,
      flag: typeof dataset.status?.[String(month.index)] === "string"
        ? String(dataset.status[String(month.index)])
        : null,
    });
  }

  return {
    dataset: EUROSTAT_HICP_DATASET,
    code,
    label: EUROSTAT_HICP_SERIES[code].label,
    geo: EUROSTAT_HICP_GEO,
    unit: EUROSTAT_HICP_UNIT,
    frequency: EUROSTAT_HICP_FREQUENCY,
    source: "Eurostat",
    sourceUrl,
    lastUpdated: typeof dataset.updated === "string" ? dataset.updated : null,
    observations,
  };
}

export async function fetchEurostatHicpSeries(
  code: EurostatHicpSeriesId
): Promise<EurostatHicpSeries> {
  const sourceUrl = buildEurostatHicpUrl(code);
  const response = await fetch(sourceUrl, { next: { revalidate: 3600 } });
  if (!response.ok) {
    throw new Error(`Eurostat HICP request ${code} failed with HTTP ${response.status}.`);
  }
  const dataset = (await response.json()) as JsonStatDataset;
  return parseEurostatHicpDataset(dataset, code, sourceUrl);
}
