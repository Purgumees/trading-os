export const EUROSTAT_EC_SURVEY_API_BASE =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";

export type EurostatEcSurveyId = "BS-IOB" | "BS-IPE" | "BS-SAEM";

export type EurostatEcSurveyObservation = {
  date: string;
  value: number;
  flag: string | null;
};

export type EurostatEcSurveySeries = {
  id: EurostatEcSurveyId;
  dataset: "ei_bsin_m_r2" | "ei_bsse_m_r2";
  label: string;
  source: "European Commission DG ECFIN via Eurostat";
  sourceUrl: string;
  geo: "EA21";
  unit: "BAL";
  frequency: "M";
  filters: Record<string, string>;
  lastUpdated: string | null;
  freshness: "current" | "stale";
  latestObservationDate: string;
  observations: EurostatEcSurveyObservation[];
};

type SurveyConfig = {
  id: EurostatEcSurveyId;
  dataset: EurostatEcSurveySeries["dataset"];
  label: string;
  start: string;
};

const SURVEY_CONFIG: Record<EurostatEcSurveyId, SurveyConfig> = {
  "BS-IOB": {
    id: "BS-IOB",
    dataset: "ei_bsin_m_r2",
    label: "Manufacturing order-book assessment",
    start: "1980-01",
  },
  "BS-IPE": {
    id: "BS-IPE",
    dataset: "ei_bsin_m_r2",
    label: "Manufacturing production expectations (next 3 months)",
    start: "1980-01",
  },
  "BS-SAEM": {
    id: "BS-SAEM",
    dataset: "ei_bsse_m_r2",
    label: "Services demand expectations (next 3 months)",
    start: "1995-01",
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

function monthAge(asOfDate: string, observationDate: string) {
  const [year, month] = asOfDate.slice(0, 7).split("-").map(Number);
  const [observationYear, observationMonth] = observationDate.split("-").map(Number);
  return (year! - observationYear!) * 12 + month! - observationMonth!;
}

export function buildEurostatEcSurveyUrl(id: EurostatEcSurveyId) {
  const config = SURVEY_CONFIG[id];
  const params = new URLSearchParams({
    freq: "M",
    indic: id,
    s_adj: "SA",
    unit: "BAL",
    geo: "EA21",
    sinceTimePeriod: config.start,
    lang: "en",
  });
  return `${EUROSTAT_EC_SURVEY_API_BASE}/${config.dataset}?${params.toString()}`;
}

export function parseEurostatEcSurveyDataset(
  dataset: JsonStatDataset,
  id: EurostatEcSurveyId,
  sourceUrl: string,
  asOfDate: string
): EurostatEcSurveySeries {
  const config = SURVEY_CONFIG[id];
  const ids = dataset.id;
  const sizes = dataset.size;
  const dimensions = dataset.dimension;
  const valueCube = dataset.value;
  const timeIndex = dimensions?.time?.category?.index;
  if (!ids || !sizes || !dimensions || !valueCube || !timeIndex || sizes.length !== ids.length) {
    throw new Error(`Eurostat returned an unsupported JSON-stat shape for ${id}.`);
  }

  const expected: Record<string, { code: string; label: string }> = {
    freq: { code: "M", label: "Monthly" },
    indic: {
      code: id,
      label:
        id === "BS-IOB"
          ? "Assessment of order-book levels"
          : id === "BS-IPE"
            ? "Production expectations over the next 3 months"
            : "Expectation of the demand over the next 3 months",
    },
    s_adj: { code: "SA", label: "Seasonally adjusted data, not calendar adjusted data" },
    unit: { code: "BAL", label: "Balance" },
    geo: { code: "EA21", label: "Euro area – 21 countries (from 2026)" },
  };

  const selectedIndexes: Record<string, number> = {};
  for (const [dimensionId, selection] of Object.entries(expected)) {
    const dimension = dimensions[dimensionId];
    const categoryIndex = dimension?.category?.index?.[selection.code];
    const label = dimension?.category?.label?.[selection.code];
    if (
      categoryIndex === undefined ||
      label !== selection.label ||
      sizes[ids.indexOf(dimensionId)] !== 1
    ) {
      throw new Error(
        `Eurostat ${config.dataset} filter ${dimensionId}=${selection.code} returned unexpected category "${label ?? "missing"}".`
      );
    }
    selectedIndexes[dimensionId] = categoryIndex;
  }

  const timePosition = ids.indexOf("time");
  if (timePosition < 0) {
    throw new Error(`Eurostat ${config.dataset} response for ${id} has no time dimension.`);
  }
  const orderedTimes = Object.entries(timeIndex).sort((left, right) => left[1] - right[1]);
  const observations: EurostatEcSurveyObservation[] = [];
  for (const [date, timeCategoryIndex] of orderedTimes) {
    let flatIndex = 0;
    for (let position = 0; position < ids.length; position += 1) {
      const dimensionId = ids[position]!;
      const categoryIndex =
        dimensionId === "time" ? timeCategoryIndex : selectedIndexes[dimensionId];
      if (categoryIndex === undefined) {
        throw new Error(`Eurostat response for ${id} contains an unexpected dimension "${dimensionId}".`);
      }
      flatIndex = flatIndex * sizes[position]! + categoryIndex;
    }
    const rawValue = Array.isArray(valueCube)
      ? valueCube[flatIndex]
      : (valueCube as Record<string, unknown>)[String(flatIndex)];
    if (rawValue === null || rawValue === undefined) continue;
    const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (!Number.isFinite(value)) {
      throw new Error(`Eurostat returned a non-numeric ${id} survey balance at ${date}.`);
    }
    const rawFlag = dataset.status?.[String(flatIndex)];
    observations.push({
      date,
      value,
      flag: typeof rawFlag === "string" ? rawFlag : null,
    });
  }

  const latestObservationDate = observations.at(-1)?.date;
  if (!latestObservationDate) {
    throw new Error(`Eurostat returned no observations for European Commission survey ${id}.`);
  }
  const age = monthAge(asOfDate, latestObservationDate);

  return {
    id,
    dataset: config.dataset,
    label: config.label,
    source: "European Commission DG ECFIN via Eurostat",
    sourceUrl,
    geo: "EA21",
    unit: "BAL",
    frequency: "M",
    filters: {
      freq: "M",
      indic: id,
      s_adj: "SA",
      unit: "BAL",
      geo: "EA21",
      sinceTimePeriod: config.start,
    },
    lastUpdated: typeof dataset.updated === "string" ? dataset.updated : null,
    freshness: age >= 0 && age <= 1 ? "current" : "stale",
    latestObservationDate,
    observations,
  };
}

export async function fetchEurostatEcSurveySeries(
  id: EurostatEcSurveyId,
  asOfDate = new Date().toISOString().slice(0, 10)
): Promise<EurostatEcSurveySeries> {
  const sourceUrl = buildEurostatEcSurveyUrl(id);
  const response = await fetch(sourceUrl, { next: { revalidate: 3600 } });
  if (!response.ok) {
    throw new Error(
      `Eurostat ${SURVEY_CONFIG[id].dataset} request for ${id} failed with HTTP ${response.status}.`
    );
  }
  const dataset = (await response.json()) as JsonStatDataset;
  return parseEurostatEcSurveyDataset(dataset, id, sourceUrl, asOfDate);
}
