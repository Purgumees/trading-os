import { NextResponse } from "next/server";
import { calculateGrowthState } from "@/lib/growth-state-engine";
import { calculateInflationState } from "@/lib/inflation-state-engine";
import { buildInflationMonthlyHistory } from "@/lib/inflation-state-engine";
import type { InflationMonthlyObservation } from "@/lib/inflation-state-engine";
import { calculateLabourState } from "@/lib/labour-state-engine";
import { createUnavailableFedPricing } from "@/lib/fed-pricing";
import { getPolymarketFedExpectations } from "@/lib/polymarket-fed-expectations";
import {
  calculateUsRatesYieldCurve,
  US_RATES_CALIBRATION_CONFIG,
  type TreasuryMaturity,
} from "@/lib/us-rates-yield-curve-engine";
import { calculateFedRepricingYieldConfirmation } from "@/lib/fed-repricing-yield-confirmation";
import { calculateUsRatesRegime } from "@/lib/us-rates-regime-engine";
import { calculateUsdMacroState } from "@/lib/usd-macro-state-engine";

const FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations";

type FredObservation = {
  date: string;
  value: string;
};

type InflationMetric = {
  value: number | null;
  date: string | null;
};

type InflationAnalysis = {
  yoy: {
    current: InflationMetric;
    oneMonthAgo: InflationMetric;
    threeMonthsAgo: InflationMetric;
    sixMonthsAgo: InflationMetric;
  };
  mom: {
    latest: InflationMetric;
    history: Array<{ date: string; value: number; mom: number | null }>;
  };
  annualized3m: InflationMetric;
  trend: "Cooling" | "Heating" | "Stable";
  monthlyHistory: InflationMonthlyObservation[];
};

function parseFredValue(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).trim();

  if (
    trimmed === "" ||
    trimmed === "." ||
    trimmed.toLowerCase() === "na" ||
    trimmed.toLowerCase() === "n/a" ||
    trimmed.toLowerCase() === "null"
  ) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getFredObservations(seriesId: string, limit = 24) {
  const apiKey = process.env.FRED_API_KEY?.trim();

  if (!apiKey) {
    return [] as Array<{ date: string; value: number }>;
  }

  const url =
    `${FRED_BASE_URL}?series_id=${seriesId}` +
    `&api_key=${apiKey}` +
    `&file_type=json` +
    `&sort_order=desc` +
    `&limit=${limit}`;

  const response = await fetch(url, {
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`FRED request failed for ${seriesId}: ${response.status}`);
  }

  const data = await response.json();

  const observations: FredObservation[] = data.observations ?? [];

  return observations.reduce<Array<{ date: string; value: number }>>((result, item) => {
    const value = parseFredValue(item.value);

    if (value === null) {
      return result;
    }

    result.push({
      date: item.date,
      value,
    });

    return result;
  }, []);
}

function getSettledFredObservations(
  seriesId: string,
  result: PromiseSettledResult<Array<{ date: string; value: number }>>,
) {
  if (result.status === "fulfilled") {
    return result.value;
  }

  console.error(`FRED request failed for Labour series ${seriesId}`, result.reason);
  return [] as Array<{ date: string; value: number }>;
}

function getSettledTreasuryObservations(
  seriesId: string,
  result: PromiseSettledResult<Array<{ date: string; value: number }>>,
) {
  if (result.status === "fulfilled") {
    return result.value;
  }

  console.error(`FRED Treasury yield request failed for ${seriesId}`, result.reason);
  return [] as Array<{ date: string; value: number }>;
}

function calculateYoY(observations: { date: string; value: number }[]) {
  if (observations.length < 13) {
    return null;
  }

  const current = observations[0]!;
  const yearAgo = observations[12]!;

  if (yearAgo.value === 0) {
    return null;
  }

  const yoy = ((current.value - yearAgo.value) / yearAgo.value) * 100;

  if (!Number.isFinite(yoy)) {
    return null;
  }

  return {
    value: Number(yoy.toFixed(2)),
    date: current.date,
  };
}

function calculateYoYAt(
  observations: { date: string; value: number }[],
  monthsAgo = 0,
): InflationMetric {
  const comparisonIndex = monthsAgo + 12;

  if (observations.length <= comparisonIndex) {
    return { value: null, date: null };
  }

  const current = observations[monthsAgo];
  const yearAgo = observations[comparisonIndex];

  if (!current || !yearAgo || yearAgo.value === 0) {
    return { value: null, date: current?.date ?? null };
  }

  const yoy = ((current.value - yearAgo.value) / yearAgo.value) * 100;

  return {
    value: Number.isFinite(yoy) ? Number(yoy.toFixed(2)) : null,
    date: current.date,
  };
}

function calculateMomAt(
  observations: { date: string; value: number }[],
  offset = 0,
): InflationMetric {
  if (observations.length <= offset + 1) {
    return { value: null, date: null };
  }

  const current = observations[offset];
  const previous = observations[offset + 1];

  if (!current || !previous || previous.value === 0) {
    return { value: null, date: current?.date ?? null };
  }

  const mom = ((current.value - previous.value) / previous.value) * 100;

  return {
    value: Number.isFinite(mom) ? Number(mom.toFixed(2)) : null,
    date: current.date,
  };
}

function calculateRecentMomHistory(observations: { date: string; value: number }[], limit = 6) {
  const history: Array<{ date: string; value: number; mom: number | null }> = [];

  for (let index = 0; index < Math.min(observations.length - 1, limit); index++) {
    const current = observations[index];
    const previous = observations[index + 1];

    if (!current || !previous) {
      continue;
    }

    const mom =
      previous.value === 0 ? null : ((current.value - previous.value) / previous.value) * 100;

    history.push({
      date: current.date,
      value: current.value,
      mom: mom === null || !Number.isFinite(mom) ? null : Number(mom.toFixed(2)),
    });
  }

  return history;
}

function calculateAnnualized3m(observations: { date: string; value: number }[]): InflationMetric {
  if (observations.length < 4) {
    return { value: null, date: null };
  }

  const current = observations[0];
  const threeMonthsAgo = observations[3];

  if (!current || !threeMonthsAgo || threeMonthsAgo.value === 0) {
    return { value: null, date: current?.date ?? null };
  }

  const annualizedRate = ((current.value / threeMonthsAgo.value) ** 4 - 1) * 100;

  return {
    value: Number.isFinite(annualizedRate) ? Number(annualizedRate.toFixed(2)) : null,
    date: current.date,
  };
}

function classifyInflationTrend(
  current: number | null,
  threeMonthsAgo: number | null,
  sixMonthsAgo: number | null,
): "Cooling" | "Heating" | "Stable" {
  const coolingSignals = [
    current !== null && threeMonthsAgo !== null ? current < threeMonthsAgo : null,
    current !== null && sixMonthsAgo !== null ? current < sixMonthsAgo : null,
  ].filter((signal): signal is boolean => signal !== null);

  if (coolingSignals.length > 0 && coolingSignals.every(Boolean)) {
    return "Cooling";
  }

  const heatingSignals = [
    current !== null && threeMonthsAgo !== null ? current > threeMonthsAgo : null,
    current !== null && sixMonthsAgo !== null ? current > sixMonthsAgo : null,
  ].filter((signal): signal is boolean => signal !== null);

  if (heatingSignals.length > 0 && heatingSignals.every(Boolean)) {
    return "Heating";
  }

  return "Stable";
}

function buildInflationAnalysis(
  observations: { date: string; value: number }[],
): InflationAnalysis {
  const currentYoy = calculateYoY(observations);

  return {
    yoy: {
      current: {
        value: currentYoy?.value ?? null,
        date: currentYoy?.date ?? observations[0]?.date ?? null,
      },
      oneMonthAgo: calculateYoYAt(observations, 1),
      threeMonthsAgo: calculateYoYAt(observations, 3),
      sixMonthsAgo: calculateYoYAt(observations, 6),
    },
    mom: {
      latest: calculateMomAt(observations, 0),
      history: calculateRecentMomHistory(observations, 6),
    },
    annualized3m: calculateAnnualized3m(observations),
    monthlyHistory: buildInflationMonthlyHistory(observations, 6),
    trend: classifyInflationTrend(
      currentYoy?.value ?? null,
      calculateYoYAt(observations, 3).value,
      calculateYoYAt(observations, 6).value,
    ),
  };
}

type GrowthDirection = "up" | "down" | "flat";

type IsmManufacturingComponent = {
  name: string;
  value: number | null;
  previousValue: number | null;
  reportMonth: string | null;
  source: "ISM";
};

type IsmManufacturingSourceName = "Official ISM report" | "PR Newswire";

type IsmManufacturingReport = {
  source: "ISM";
  sourceName: IsmManufacturingSourceName;
  sourceUrl: string;
  reportMonth: string | null;
  components: {
    manufacturingPmi: IsmManufacturingComponent;
    newOrders: IsmManufacturingComponent;
    production: IsmManufacturingComponent;
    employment: IsmManufacturingComponent;
    prices: IsmManufacturingComponent;
  };
};

type IsmServicesComponent = {
  name: string;
  value: number | null;
  previousValue: number | null;
  reportMonth: string | null;
  source: "ISM";
};

type IsmServicesSourceName = "Official ISM report" | "PR Newswire";

type IsmServicesReport = {
  source: "ISM";
  sourceName: IsmServicesSourceName;
  sourceUrl: string;
  reportMonth: string | null;
  components: {
    servicesPmi: IsmServicesComponent;
    businessActivity: IsmServicesComponent;
    newOrders: IsmServicesComponent;
    employment: IsmServicesComponent;
    prices: IsmServicesComponent;
  };
};

function calculatePercentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }

  const change = ((current - previous) / previous) * 100;

  return Number.isFinite(change) ? Number(change.toFixed(2)) : null;
}

function calculateDirection(current: number | null, previous: number | null): GrowthDirection {
  if (current === null || previous === null) {
    return "flat";
  }

  if (Math.abs(current - previous) < 1e-9) {
    return "flat";
  }

  return current > previous ? "up" : "down";
}

function calculateGrowthHistory(
  observations: { date: string; value: number }[],
  periodsPerYear: number,
  limit = 8,
) {
  return observations.slice(0, limit).map((current, index, arr) => {
    const previous = arr[index + 1] ?? null;
    const yearAgo = observations[index + periodsPerYear] ?? null;

    return {
      date: current.date,
      value: current.value,
      mom: previous ? calculatePercentChange(current.value, previous.value) : null,
      yoy: yearAgo ? calculatePercentChange(current.value, yearAgo.value) : null,
    };
  });
}

function calculateQuarterlyAnnualized(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }

  const annualized = ((current / previous) ** 4 - 1) * 100;

  return Number.isFinite(annualized) ? Number(annualized.toFixed(2)) : null;
}

function calculateDirectionFromHistory(
  observations: { date: string; value: number }[],
  lookbackPeriods: number,
): GrowthDirection {
  if (observations.length <= lookbackPeriods) {
    return "flat";
  }

  const current = observations[0]?.value ?? null;
  const comparison = observations[lookbackPeriods]?.value ?? null;

  return calculateDirection(current, comparison);
}

function normalizeReportMonth(value: string): string | null {
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const monthMatch = value.match(
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
  );

  if (monthMatch) {
    const monthText = monthMatch[0] ?? "";
    const monthName = monthText.split(" ")[0] ?? "";
    const month = monthNames.findIndex((name) => name.toLowerCase() === monthName.toLowerCase());

    if (month >= 0) {
      return `${monthMatch[1]}-${String(month + 1).padStart(2, "0")}`;
    }
  }

  const isoMonthMatch = value.match(/(\d{4})[-/](\d{1,2})/);

  if (isoMonthMatch) {
    return `${isoMonthMatch[1]}-${String(Number(isoMonthMatch[2])).padStart(2, "0")}`;
  }

  return null;
}

function extractReportMonthFromText(text: string): string | null {
  const patterns = [
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i,
    /\d{4}[-/]\d{1,2}/,
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return normalizeReportMonth(match[0]);
    }
  }

  return null;
}

function extractIsmComponentValue(
  text: string,
  patterns: RegExp[],
): { value: number | null; previousValue: number | null } {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        value: match[1] ? Number(match[1]) : null,
        previousValue: match[2] ? Number(match[2]) : null,
      };
    }
  }

  return { value: null, previousValue: null };
}

function parseIsmHtml(
  html: string,
  sourceName: IsmManufacturingSourceName,
  sourceUrl: string,
): IsmManufacturingReport | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const reportMonth =
    extractReportMonthFromText(text) ?? sourceUrl.match(/(\d{4})[-/](\d{1,2})/)?.[0] ?? null;

  const patterns = {
    manufacturingPmi: [
      /Manufacturing PMI.*?(?:registered|stood at|was)\s*([0-9]+(?:\.\d+)?)\s*percent.*?(?:below|above|up|down|versus|compared to).*?(?:August|July|June|May|April|March|February|January).*?of\s*([0-9]+(?:\.\d+)?)\s*percent/i,
      /Manufacturing PMI.*?(?:registered|stood at|was)\s*([0-9]+(?:\.\d+)?)\s*percent.*?(?:below|above|up|down|versus|compared to).*?(?:August|July|June|May|April|March|February|January).*?figure of\s*([0-9]+(?:\.\d+)?)\s*percent/i,
      /Manufacturing PMI.*?(?:registered|stood at|was)\s*([0-9]+(?:\.\d+)?)\s*percent/i,
    ],
    newOrders: [
      /New Orders Index.*?registering\s*([0-9]+(?:\.\d+)?)\s*percent.*?(?:up|down|versus|compared to).*?(?:August.*?(?:figure|reading) of|August.*?(?:figure|reading)|August's.*?of)\s*([0-9]+(?:\.\d+)?)\s*percent/i,
      /New Orders Index.*?registering\s*([0-9]+(?:\.\d+)?)\s*percent.*?(?:up|down|versus|compared to).*?([0-9]+(?:\.\d+)?)\s*percent/i,
      /New Orders.*?([0-9]+(?:\.\d+)?)\s*percent/i,
    ],
    production: [
      /Production Index.*?\(([0-9]+(?:\.\d+)?)\s*percent\).*?(?:lower|higher).*?(?:than the )?([0-9]+(?:\.\d+)?)\s*percent/i,
      /Production Index.*?([0-9]+(?:\.\d+)?)\s*percent.*?(?:lower|higher).*?(?:than the )?([0-9]+(?:\.\d+)?)\s*percent/i,
      /Production.*?([0-9]+(?:\.\d+)?)\s*percent/i,
    ],
    employment: [
      /Employment Index.*?(?:reading of\s*)?([0-9]+(?:\.\d+)?)\s*percent.*?(?:up|down).*?(?:August.*?(?:figure|reading)|August.*?of)\s*([0-9]+(?:\.\d+)?)\s*percent/i,
      /Employment Index.*?([0-9]+(?:\.\d+)?)\s*percent.*?(?:up|down).*?([0-9]+(?:\.\d+)?)\s*percent/i,
      /Employment.*?([0-9]+(?:\.\d+)?)\s*percent/i,
    ],
    prices: [
      /Prices Index.*?registering\s*([0-9]+(?:\.\d+)?)\s*percent.*?(?:August.*?(?:reading of|figure of)|August.*?reading)\s*([0-9]+(?:\.\d+)?)\s*percent/i,
      /Prices Index.*?registering\s*([0-9]+(?:\.\d+)?)\s*percent.*?(?:versus|compared to).*?([0-9]+(?:\.\d+)?)\s*percent/i,
      /Prices.*?([0-9]+(?:\.\d+)?)\s*percent/i,
    ],
  };

  const manufacturingPmi = extractIsmComponentValue(text, patterns.manufacturingPmi);
  const newOrders = extractIsmComponentValue(text, patterns.newOrders);
  const production = extractIsmComponentValue(text, patterns.production);
  const employment = extractIsmComponentValue(text, patterns.employment);
  const prices = extractIsmComponentValue(text, patterns.prices);

  const components = {
    manufacturingPmi: {
      name: "Manufacturing PMI",
      value: manufacturingPmi.value,
      previousValue: manufacturingPmi.previousValue,
      reportMonth,
      source: "ISM" as const,
    },
    newOrders: {
      name: "New Orders",
      value: newOrders.value,
      previousValue: newOrders.previousValue,
      reportMonth,
      source: "ISM" as const,
    },
    production: {
      name: "Production",
      value: production.value,
      previousValue: production.previousValue,
      reportMonth,
      source: "ISM" as const,
    },
    employment: {
      name: "Employment",
      value: employment.value,
      previousValue: employment.previousValue,
      reportMonth,
      source: "ISM" as const,
    },
    prices: {
      name: "Prices",
      value: prices.value,
      previousValue: prices.previousValue,
      reportMonth,
      source: "ISM" as const,
    },
  };

  const hasAnyValue =
    components.manufacturingPmi.value !== null ||
    components.newOrders.value !== null ||
    components.production.value !== null ||
    components.employment.value !== null ||
    components.prices.value !== null;

  if (!hasAnyValue) {
    return null;
  }

  return {
    source: "ISM",
    sourceName,
    sourceUrl,
    reportMonth,
    components,
  };
}

async function fetchLatestIsmManufacturingReport(): Promise<IsmManufacturingReport | null> {
  const officialUrls = [
    "https://www.ismworld.org/about/ism-report-on-business/",
    "https://www.ismworld.org/about-ism/overview/ism-report-on-business/",
    "https://www.ismworld.org/ism-manufacturing-pmi/",
    "https://www.ismworld.org/ism-manufacturing-pmi-report/",
    "https://www.ismworld.org/ism-report-on-business/",
  ];

  for (const url of officialUrls) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
        next: { revalidate: 3600 },
      });

      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const report = parseIsmHtml(html, "Official ISM report", response.url || url);

      if (report) {
        return report;
      }
    } catch {
      continue;
    }
  }

  const prNewswireSearchUrl =
    "https://www.prnewswire.com/search/news/?keyword=ISM%20Manufacturing%20PMI";

  try {
    const searchResponse = await fetch(prNewswireSearchUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      next: { revalidate: 3600 },
    });

    if (!searchResponse.ok) {
      return null;
    }

    const searchHtml = await searchResponse.text();
    const candidateLinks = Array.from(
      new Set(
        (searchHtml.match(/\/news-releases\/[^"'\s>]+\.html/gi) ?? [])
          .map((link) => `https://www.prnewswire.com${link}`)
          .filter((link) => /manufacturing-pmi-at|ism-manufacturing-pmi-report/i.test(link)),
      ),
    );

    for (const candidateUrl of candidateLinks) {
      try {
        const articleResponse = await fetch(candidateUrl, {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
          next: { revalidate: 3600 },
        });

        if (!articleResponse.ok) {
          continue;
        }

        const articleHtml = await articleResponse.text();
        const report = parseIsmHtml(
          articleHtml,
          "PR Newswire",
          articleResponse.url || candidateUrl,
        );

        if (report) {
          return report;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function parseIsmServicesHtml(
  html: string,
  sourceName: IsmServicesSourceName,
  sourceUrl: string,
): IsmServicesReport | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&reg;|&#174;|&#x0*ae;/gi, "®")
    .replace(/\s+/g, " ")
    .trim();

  if (!/Services PMI|Services PMI Report/i.test(text)) {
    return null;
  }

  const reportMonth = extractReportMonthFromText(text);
  const pmi = extractIsmComponentValue(text, [
    /Services PMI\s*(?:®)?\s+registered\s+([0-9]+(?:\.[0-9]+)?)\s*percent.{0,180}?(?:figure|reading)\s+of\s+([0-9]+(?:\.[0-9]+)?)\s*percent/i,
    /Services PMI\s*(?:®)?\s+registered\s+([0-9]+(?:\.[0-9]+)?)\s*percent/i,
  ]);
  const businessActivity = extractIsmComponentValue(text, [
    /Business Activity Index.{0,180}?(?:decreasing|increasing|increased|decreased)\s+[0-9]+(?:\.[0-9]+)?\s+percentage points?\s+to\s+([0-9]+(?:\.[0-9]+)?)\s*percent\s+from\s+.{0,70}?([0-9]+(?:\.[0-9]+)?)\s*percent/i,
    /Business Activity Index at\s+([0-9]+(?:\.[0-9]+)?)\s*%/i,
    /Business Activity Index.*?(?:reading|registered)\s+(?:of\s+)?([0-9]+(?:\.[0-9]+)?)\s*percent/i,
  ]);
  const newOrders = extractIsmComponentValue(text, [
    /New Orders Index.{0,180}?(?:registered|registering)\s+([0-9]+(?:\.[0-9]+)?)\s*percent.{0,120}?(?:figure|reading)\s+of\s+([0-9]+(?:\.[0-9]+)?)\s*percent/i,
    /New Orders Index at\s+([0-9]+(?:\.[0-9]+)?)\s*%/i,
    /New Orders Index.*?(?:registered|registering)\s+([0-9]+(?:\.[0-9]+)?)\s*percent/i,
  ]);
  const employment = extractIsmComponentValue(text, [
    /Employment Index.{0,160}?(?:reading of\s+)?([0-9]+(?:\.[0-9]+)?)\s*percent.{0,100}?(?:increase|decrease|up|down).{0,60}?(?:from|recorded)\s+(?:the\s+)?([0-9]+(?:\.[0-9]+)?)\s*percent/i,
    /Employment Index at\s+([0-9]+(?:\.[0-9]+)?)\s*%/i,
    /Employment Index.*?(?:reading of\s+)?([0-9]+(?:\.[0-9]+)?)\s*percent/i,
  ]);
  const prices = extractIsmComponentValue(text, [
    /Prices Index.{0,180}?the reading of\s+([0-9]+(?:\.[0-9]+)?)\s*percent.{0,100}?(?:figure|reading) of\s+([0-9]+(?:\.[0-9]+)?)\s*percent/i,
    /Prices Index.{0,180}?(?:registering|registered)\s+(?:above\s+[0-9]+(?:\.[0-9]+)?\s+percent.*?;\s*)?(?:the reading of\s+)?([0-9]+(?:\.[0-9]+)?)\s*percent/i,
    /Prices Index at\s+([0-9]+(?:\.[0-9]+)?)\s*%/i,
  ]);

  const components = {
    servicesPmi: {
      name: "Services PMI",
      value: pmi.value,
      previousValue: pmi.previousValue,
      reportMonth,
      source: "ISM" as const,
    },
    businessActivity: {
      name: "Business Activity",
      value: businessActivity.value,
      previousValue: businessActivity.previousValue,
      reportMonth,
      source: "ISM" as const,
    },
    newOrders: {
      name: "New Orders",
      value: newOrders.value,
      previousValue: newOrders.previousValue,
      reportMonth,
      source: "ISM" as const,
    },
    employment: {
      name: "Employment",
      value: employment.value,
      previousValue: employment.previousValue,
      reportMonth,
      source: "ISM" as const,
    },
    prices: {
      name: "Prices",
      value: prices.value,
      previousValue: prices.previousValue,
      reportMonth,
      source: "ISM" as const,
    },
  };

  if (Object.values(components).every((component) => component.value === null)) {
    return null;
  }

  return {
    source: "ISM",
    sourceName,
    sourceUrl,
    reportMonth,
    components,
  };
}

async function fetchLatestIsmServicesReport(): Promise<IsmServicesReport | null> {
  const requestHeaders = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  };
  const officialUrls = [
    "https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/services/",
    "https://www.ismworld.org/about/ism-report-on-business/services/",
    "https://www.ismworld.org/ism-services-pmi/",
    "https://www.ismworld.org/ism-services-pmi-report/",
  ];

  for (const url of officialUrls) {
    try {
      const response = await fetch(url, {
        headers: requestHeaders,
        next: { revalidate: 3600 },
      });

      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const report = parseIsmServicesHtml(html, "Official ISM report", response.url || url);

      if (report) {
        return report;
      }
    } catch {
      continue;
    }
  }

  const searchUrl = "https://www.prnewswire.com/search/news/?keyword=ISM%20Services%20PMI";

  try {
    const searchResponse = await fetch(searchUrl, {
      headers: requestHeaders,
      next: { revalidate: 3600 },
    });

    if (!searchResponse.ok) {
      return null;
    }

    const searchHtml = await searchResponse.text();
    const candidateUrls = Array.from(
      new Set(
        (searchHtml.match(/\/news-releases\/[^"'\s>]+\.html/gi) ?? [])
          .map((link) => `https://www.prnewswire.com${link}`)
          .filter((link) => /services-pmi-at|ism-services-pmi-report/i.test(link)),
      ),
    );

    const reports = await Promise.all(
      candidateUrls.map(async (candidateUrl) => {
        try {
          const response = await fetch(candidateUrl, {
            headers: requestHeaders,
            next: { revalidate: 3600 },
          });

          if (!response.ok) {
            return null;
          }

          const html = await response.text();
          return parseIsmServicesHtml(html, "PR Newswire", response.url || candidateUrl);
        } catch {
          return null;
        }
      }),
    );

    return (
      reports
        .filter((report): report is IsmServicesReport => report !== null)
        .sort((left, right) =>
          (right.reportMonth ?? "").localeCompare(left.reportMonth ?? ""),
        )[0] ?? null
    );
  } catch {
    return null;
  }
}

function buildQuarterlyHistory(observations: { date: string; value: number }[], limit = 8) {
  return observations.slice(0, Math.min(observations.length, limit)).map((current, index, arr) => {
    const previous = arr[index + 1] ?? null;
    const yearAgo = arr[index + 4] ?? null;

    return {
      date: current.date,
      value: current.value,
      qoqAnnualized: previous ? calculateQuarterlyAnnualized(current.value, previous.value) : null,
      yoy: yearAgo ? calculatePercentChange(current.value, yearAgo.value) : null,
    };
  });
}

type DatedMetric = {
  value: number | null;
  date: string | null;
};

function getMonthlyObservationAt(observations: { date: string; value: number }[], offset: number) {
  if (!Number.isInteger(offset) || offset < 0 || !observations[offset]) {
    return null;
  }

  for (let index = 0; index < offset; index++) {
    const newer = observations[index];
    const older = observations[index + 1];

    if (!newer || !older) {
      return null;
    }

    const newerDate = new Date(`${newer.date}T00:00:00Z`);
    const olderDate = new Date(`${older.date}T00:00:00Z`);
    const monthDifference =
      newerDate.getUTCFullYear() * 12 +
      newerDate.getUTCMonth() -
      (olderDate.getUTCFullYear() * 12 + olderDate.getUTCMonth());

    if (!Number.isFinite(monthDifference) || monthDifference !== 1) {
      return null;
    }
  }

  return observations[offset] ?? null;
}

function getWeeklyObservationAt(observations: { date: string; value: number }[], offset: number) {
  if (!Number.isInteger(offset) || offset < 0 || !observations[offset]) {
    return null;
  }

  for (let index = 0; index < offset; index++) {
    const newer = observations[index];
    const older = observations[index + 1];

    if (!newer || !older) {
      return null;
    }

    const newerDate = new Date(`${newer.date}T00:00:00Z`).getTime();
    const olderDate = new Date(`${older.date}T00:00:00Z`).getTime();

    if (!Number.isFinite(newerDate) || newerDate - olderDate !== 7 * 86400000) {
      return null;
    }
  }

  return observations[offset] ?? null;
}

function calculatePayrollChangeAt(
  observations: { date: string; value: number }[],
  offset: number,
): DatedMetric {
  const current = getMonthlyObservationAt(observations, offset);
  const previous = getMonthlyObservationAt(observations, offset + 1);

  if (!current || !previous) {
    return { value: null, date: null };
  }

  return {
    value: Number((current.value - previous.value).toFixed(2)),
    date: current.date,
  };
}

function calculateAveragePayrollChange(
  observations: { date: string; value: number }[],
  months: number,
): DatedMetric {
  const changes = Array.from({ length: months }, (_, offset) =>
    calculatePayrollChangeAt(observations, offset),
  );

  if (changes.some((change) => change.value === null)) {
    return { value: null, date: null };
  }

  const latest = getMonthlyObservationAt(observations, 0);
  const average = changes.reduce((sum, change) => sum + (change.value ?? 0), 0) / months;

  return {
    value: Number(average.toFixed(2)),
    date: latest?.date ?? null,
  };
}

function calculateHourlyEarningsAnnualized3m(
  observations: { date: string; value: number }[],
): DatedMetric {
  const current = getMonthlyObservationAt(observations, 0);
  const threeMonthsAgo = getMonthlyObservationAt(observations, 3);

  if (!current || !threeMonthsAgo || threeMonthsAgo.value <= 0) {
    return { value: null, date: null };
  }

  const annualized = ((current.value / threeMonthsAgo.value) ** 4 - 1) * 100;

  return {
    value: Number.isFinite(annualized) ? Number(annualized.toFixed(2)) : null,
    date: current.date,
  };
}

export async function GET() {
  try {
    const [
      fedFundsResult,
      fedTargetUpperResult,
      fedTargetLowerResult,
      cpiResult,
      coreCpiResult,
      pceResult,
      corePceResult,
      gdpResult,
      realPceResult,
      industrialProductionResult,
      retailSalesResult,
      unemploymentResult,
      payrollEmploymentResult,
      hourlyEarningsResult,
      initialClaimsResult,
      jobOpeningsResult,
      treasury2YearResult,
      treasury5YearResult,
      treasury10YearResult,
      treasury30YearResult,
    ] = await Promise.allSettled([
      getFredObservations("FEDFUNDS", 2),
      getFredObservations("DFEDTARU", 90),
      getFredObservations("DFEDTARL", 90),
      getFredObservations("CPIAUCSL", 60),
      getFredObservations("CPILFESL", 60),
      getFredObservations("PCEPI", 60),
      getFredObservations("PCEPILFE", 60),
      getFredObservations("GDPC1", 24),
      getFredObservations("PCECC96", 36),
      getFredObservations("INDPRO", 36),
      getFredObservations("RRSFS", 36),
      getFredObservations("UNRATE", 90),
      getFredObservations("PAYEMS", 90),
      getFredObservations("CES0500000003", 90),
      getFredObservations("ICSA", 270),
      getFredObservations("JTSJOL", 90),
      getFredObservations("DGS2", US_RATES_CALIBRATION_CONFIG.historyLimit),
      getFredObservations("DGS5", US_RATES_CALIBRATION_CONFIG.historyLimit),
      getFredObservations("DGS10", US_RATES_CALIBRATION_CONFIG.historyLimit),
      getFredObservations("DGS30", US_RATES_CALIBRATION_CONFIG.historyLimit),
    ]);

    const fedFundsData = fedFundsResult.status === "fulfilled" ? fedFundsResult.value : [];
    const fedTargetUpperData =
      fedTargetUpperResult.status === "fulfilled" ? fedTargetUpperResult.value : [];
    const fedTargetLowerData =
      fedTargetLowerResult.status === "fulfilled" ? fedTargetLowerResult.value : [];
    const cpiData = cpiResult.status === "fulfilled" ? cpiResult.value : [];
    const coreCpiData = coreCpiResult.status === "fulfilled" ? coreCpiResult.value : [];
    const pceData = pceResult.status === "fulfilled" ? pceResult.value : [];
    const corePceData = corePceResult.status === "fulfilled" ? corePceResult.value : [];
    const gdpData = gdpResult.status === "fulfilled" ? gdpResult.value : [];
    const realPceData = realPceResult.status === "fulfilled" ? realPceResult.value : [];
    const industrialProductionData =
      industrialProductionResult.status === "fulfilled" ? industrialProductionResult.value : [];
    const retailSalesData = retailSalesResult.status === "fulfilled" ? retailSalesResult.value : [];
    const unemploymentData = getSettledFredObservations("UNRATE", unemploymentResult);
    const payrollEmploymentData = getSettledFredObservations("PAYEMS", payrollEmploymentResult);
    const hourlyEarningsData = getSettledFredObservations("CES0500000003", hourlyEarningsResult);
    const initialClaimsData = getSettledFredObservations("ICSA", initialClaimsResult);
    const jobOpeningsData = getSettledFredObservations("JTSJOL", jobOpeningsResult);
    const treasuryObservations = {
      "2Y": getSettledTreasuryObservations("DGS2", treasury2YearResult),
      "5Y": getSettledTreasuryObservations("DGS5", treasury5YearResult),
      "10Y": getSettledTreasuryObservations("DGS10", treasury10YearResult),
      "30Y": getSettledTreasuryObservations("DGS30", treasury30YearResult),
    } satisfies Record<TreasuryMaturity, Array<{ date: string; value: number }>>;
    const usRatesYieldCurve = calculateUsRatesYieldCurve({
      observations: treasuryObservations,
    });

    const fedFunds = fedFundsData[0];
    const fedTargetUpper = fedTargetUpperData[0];
    const fedTargetLower = fedTargetLowerData[0];
    const fedPricing = createUnavailableFedPricing({
      targetLower: fedTargetLower?.value ?? null,
      targetUpper: fedTargetUpper?.value ?? null,
      effectiveFedFundsRate: fedFunds?.value ?? null,
      observedAt: fedTargetUpper?.date ?? fedFunds?.date ?? null,
      source: "FRED",
    });
    const targetLowerByDate = new Map(
      fedTargetLowerData.map((observation) => [observation.date, observation.value])
    );
    const policyHistory = fedTargetUpperData.flatMap((observation) => {
      const targetLower = targetLowerByDate.get(observation.date);
      return targetLower === undefined
        ? []
        : [
            {
              date: observation.date,
              targetLower,
              targetUpper: observation.value,
            },
          ];
    });
    const polymarketFedExpectations = await getPolymarketFedExpectations({
      currentPolicy: fedPricing.currentPolicy,
      policyHistory,
    });
    const fedRepricingYieldConfirmation = calculateFedRepricingYieldConfirmation({
      polymarket: polymarketFedExpectations,
      rates: usRatesYieldCurve,
    });
    const usRatesRegime = calculateUsRatesRegime({
      rates: usRatesYieldCurve,
      fedConfirmation: fedRepricingYieldConfirmation,
    });

    const cpiYoY = calculateYoY(cpiData);
    const coreCpiYoY = calculateYoY(coreCpiData);
    const pceYoY = calculateYoY(pceData);
    const corePceYoY = calculateYoY(corePceData);

    const cpiAnalysis = buildInflationAnalysis(cpiData);
    const coreCpiAnalysis = buildInflationAnalysis(coreCpiData);
    const pceAnalysis = buildInflationAnalysis(pceData);
    const corePceAnalysis = buildInflationAnalysis(corePceData);

    const gdpCurrent = gdpData[0] ?? null;
    const gdpPreviousQuarter = gdpData[1] ?? null;
    const gdpQoqAnnualized =
      gdpCurrent && gdpPreviousQuarter
        ? calculateQuarterlyAnnualized(gdpCurrent.value, gdpPreviousQuarter.value)
        : null;
    const gdpYoY =
      gdpCurrent && gdpData[4] ? calculatePercentChange(gdpCurrent.value, gdpData[4].value) : null;

    const realPceLatest = realPceData[0] ?? null;
    const realPcePrevious = realPceData[1] ?? null;
    const realPceMom =
      realPceLatest && realPcePrevious
        ? calculatePercentChange(realPceLatest.value, realPcePrevious.value)
        : null;
    const realPceHistory = calculateGrowthHistory(realPceData, 12, 8);
    const realPceDirection3m = calculateDirectionFromHistory(realPceData, 3);
    const realPceDirection6m = calculateDirectionFromHistory(realPceData, 6);

    const industrialProductionLatest = industrialProductionData[0] ?? null;
    const industrialProductionPrevious = industrialProductionData[1] ?? null;
    const industrialProductionYoY =
      industrialProductionLatest && industrialProductionData[12]
        ? calculatePercentChange(
            industrialProductionLatest.value,
            industrialProductionData[12].value,
          )
        : null;
    const industrialProductionMom =
      industrialProductionLatest && industrialProductionPrevious
        ? calculatePercentChange(
            industrialProductionLatest.value,
            industrialProductionPrevious.value,
          )
        : null;
    const industrialProductionHistory = calculateGrowthHistory(industrialProductionData, 12, 8);
    const industrialProductionDirection3m = calculateDirectionFromHistory(
      industrialProductionData,
      3,
    );
    const industrialProductionDirection6m = calculateDirectionFromHistory(
      industrialProductionData,
      6,
    );

    const retailSalesLatest = retailSalesData[0] ?? null;
    const retailSalesPrevious = retailSalesData[1] ?? null;
    const retailSalesYoY =
      retailSalesLatest && retailSalesData[12]
        ? calculatePercentChange(retailSalesLatest.value, retailSalesData[12].value)
        : null;
    const retailSalesMom =
      retailSalesLatest && retailSalesPrevious
        ? calculatePercentChange(retailSalesLatest.value, retailSalesPrevious.value)
        : null;
    const retailSalesHistory = calculateGrowthHistory(retailSalesData, 12, 8);
    const retailSalesDirection3m = calculateDirectionFromHistory(retailSalesData, 3);
    const retailSalesDirection6m = calculateDirectionFromHistory(retailSalesData, 6);

    const latestUnemployment = unemploymentData[0] ?? null;
    const unemploymentAtMonth = (offset: number): DatedMetric => {
      const observation = getMonthlyObservationAt(unemploymentData, offset);
      return {
        value: observation?.value ?? null,
        date: observation?.date ?? null,
      };
    };

    const latestPayrollChange = calculatePayrollChangeAt(payrollEmploymentData, 0);
    const previousPayrollChange = calculatePayrollChangeAt(payrollEmploymentData, 1);

    const latestHourlyEarnings = hourlyEarningsData[0] ?? null;
    const hourlyEarningsMom = (offset: number, periodMonths: number): DatedMetric => {
      const current = getMonthlyObservationAt(hourlyEarningsData, offset);
      const previous = getMonthlyObservationAt(hourlyEarningsData, offset + periodMonths);

      if (!current || !previous || previous.value === 0) {
        return { value: null, date: null };
      }

      const change = ((current.value - previous.value) / previous.value) * 100;
      return {
        value: Number.isFinite(change) ? Number(change.toFixed(2)) : null,
        date: current.date,
      };
    };
    const latestHourlyEarningsChange = hourlyEarningsMom(0, 1);
    const previousHourlyEarningsChange = hourlyEarningsMom(1, 1);
    const hourlyEarningsYoY = hourlyEarningsMom(0, 12);

    const latestInitialClaims = getWeeklyObservationAt(initialClaimsData, 0);
    const previousInitialClaims = getWeeklyObservationAt(initialClaimsData, 1);
    const recentInitialClaims = [0, 1, 2, 3].map((offset) =>
      getWeeklyObservationAt(initialClaimsData, offset),
    );
    const averageInitialClaims = recentInitialClaims.every((observation) => observation !== null)
      ? {
          value: Number(
            (
              recentInitialClaims.reduce((sum, observation) => sum + (observation?.value ?? 0), 0) /
              4
            ).toFixed(2),
          ),
          date: latestInitialClaims?.date ?? null,
        }
      : { value: null, date: null };
    const initialClaimsFourWeeksAgo = getWeeklyObservationAt(initialClaimsData, 4);

    const latestJobOpenings = jobOpeningsData[0] ?? null;
    const jobOpeningsAtMonth = (offset: number): DatedMetric => {
      const observation = getMonthlyObservationAt(jobOpeningsData, offset);
      return {
        value: observation?.value ?? null,
        date: observation?.date ?? null,
      };
    };

    const labour = {
      unemploymentRate: {
        series: "UNRATE",
        source: "FRED",
        unit: "%",
        date: latestUnemployment?.date ?? null,
        latest: unemploymentAtMonth(0),
        previousMonth: unemploymentAtMonth(1),
        threeMonthsAgo: unemploymentAtMonth(3),
        sixMonthsAgo: unemploymentAtMonth(6),
      },
      nonfarmPayrollEmployment: {
        series: "PAYEMS",
        source: "FRED",
        unit: "thousand jobs",
        date: payrollEmploymentData[0]?.date ?? null,
        latestMonthlyChange: latestPayrollChange,
        previousMonthlyChange: previousPayrollChange,
        averageMonthlyChange3m: calculateAveragePayrollChange(payrollEmploymentData, 3),
        averageMonthlyChange6m: calculateAveragePayrollChange(payrollEmploymentData, 6),
      },
      averageHourlyEarnings: {
        series: "CES0500000003",
        source: "FRED",
        unit: "US dollars per hour",
        date: latestHourlyEarnings?.date ?? null,
        latestMoM: latestHourlyEarningsChange,
        latestYoY: hourlyEarningsYoY,
        previousMoM: previousHourlyEarningsChange,
        annualized3m: calculateHourlyEarningsAnnualized3m(hourlyEarningsData),
      },
      initialJoblessClaims: {
        series: "ICSA",
        source: "FRED",
        unit: "claims",
        date: latestInitialClaims?.date ?? null,
        latest: {
          value: latestInitialClaims?.value ?? null,
          date: latestInitialClaims?.date ?? null,
        },
        previousWeek: {
          value: previousInitialClaims?.value ?? null,
          date: previousInitialClaims?.date ?? null,
        },
        average4Week: averageInitialClaims,
        fourWeeksAgo: {
          value: initialClaimsFourWeeksAgo?.value ?? null,
          date: initialClaimsFourWeeksAgo?.date ?? null,
        },
      },
      joltsJobOpenings: {
        series: "JTSJOL",
        source: "FRED",
        unit: "thousand jobs",
        date: latestJobOpenings?.date ?? null,
        latest: jobOpeningsAtMonth(0),
        previousMonth: jobOpeningsAtMonth(1),
        threeMonthsAgo: jobOpeningsAtMonth(3),
        sixMonthsAgo: jobOpeningsAtMonth(6),
      },
    };
    const labourAssessment = calculateLabourState({
      ...labour,
      historicalObservations: {
        unemploymentRate: unemploymentData,
        payrollEmployment: payrollEmploymentData,
        initialJoblessClaims: initialClaimsData,
        jobOpenings: jobOpeningsData,
        hourlyEarnings: hourlyEarningsData,
      },
    });

    let ismManufacturing: IsmManufacturingReport | null = null;

    try {
      ismManufacturing = await fetchLatestIsmManufacturingReport();
    } catch {
      ismManufacturing = null;
    }

    let ismServices: IsmServicesReport | null = null;

    try {
      ismServices = await fetchLatestIsmServicesReport();
    } catch {
      ismServices = null;
    }

    const growthAssessment = calculateGrowthState({
      gdp: {
        latest: { qoqAnnualized: gdpQoqAnnualized },
        recentHistory: buildQuarterlyHistory(gdpData, 8),
      },
      realPce: {
        latest: { yoy: realPceHistory[0]?.yoy ?? null },
        direction3m: realPceDirection3m,
        direction6m: realPceDirection6m,
      },
      industrialProduction: {
        latest: { yoy: industrialProductionYoY },
        direction3m: industrialProductionDirection3m,
        direction6m: industrialProductionDirection6m,
      },
      retailSales: {
        latest: { yoy: retailSalesYoY },
        direction3m: retailSalesDirection3m,
        direction6m: retailSalesDirection6m,
      },
      ismManufacturing: ismManufacturing
        ? {
            components: {
              manufacturingPmi: ismManufacturing.components.manufacturingPmi,
              newOrders: ismManufacturing.components.newOrders,
            },
          }
        : null,
      ismServices: ismServices
        ? {
            components: {
              servicesPmi: ismServices.components.servicesPmi,
              businessActivity: ismServices.components.businessActivity,
              newOrders: ismServices.components.newOrders,
            },
          }
        : null,
    });
    const inflationAssessment = calculateInflationState({
      headlineCpi: {
        currentYoY: cpiAnalysis.yoy.current,
        oneMonthAgoYoY: cpiAnalysis.yoy.oneMonthAgo,
        threeMonthsAgoYoY: cpiAnalysis.yoy.threeMonthsAgo,
        sixMonthsAgoYoY: cpiAnalysis.yoy.sixMonthsAgo,
        latestMoM: cpiAnalysis.mom.latest,
        annualized3m: cpiAnalysis.annualized3m,
        historicalObservations: cpiData,
      },
      headlinePce: {
        currentYoY: pceAnalysis.yoy.current,
        oneMonthAgoYoY: pceAnalysis.yoy.oneMonthAgo,
        threeMonthsAgoYoY: pceAnalysis.yoy.threeMonthsAgo,
        sixMonthsAgoYoY: pceAnalysis.yoy.sixMonthsAgo,
        latestMoM: pceAnalysis.mom.latest,
        annualized3m: pceAnalysis.annualized3m,
        historicalObservations: pceData,
      },
      coreCpi: {
        currentYoY: coreCpiAnalysis.yoy.current,
        oneMonthAgoYoY: coreCpiAnalysis.yoy.oneMonthAgo,
        threeMonthsAgoYoY: coreCpiAnalysis.yoy.threeMonthsAgo,
        sixMonthsAgoYoY: coreCpiAnalysis.yoy.sixMonthsAgo,
        latestMoM: coreCpiAnalysis.mom.latest,
        annualized3m: coreCpiAnalysis.annualized3m,
        historicalObservations: coreCpiData,
      },
      corePce: {
        currentYoY: corePceAnalysis.yoy.current,
        oneMonthAgoYoY: corePceAnalysis.yoy.oneMonthAgo,
        threeMonthsAgoYoY: corePceAnalysis.yoy.threeMonthsAgo,
        sixMonthsAgoYoY: corePceAnalysis.yoy.sixMonthsAgo,
        latestMoM: corePceAnalysis.mom.latest,
        annualized3m: corePceAnalysis.annualized3m,
        historicalObservations: corePceData,
      },
      ismManufacturingPrices: ismManufacturing?.components.prices ?? null,
      ismServicesPrices: ismServices?.components.prices ?? null,
    });
    const usdMacroState = calculateUsdMacroState({
      growth: growthAssessment,
      labour: labourAssessment,
      inflation: inflationAssessment,
      fedConfirmation: fedRepricingYieldConfirmation,
      ratesRegime: usRatesRegime,
      rates: usRatesYieldCurve,
    });

    return NextResponse.json({
      status: "ok",
      country: "US",
      economyState: {
        growthAssessment,
        inflationAssessment,
        usdMacroState,
        interestRates: {
          policyRate: fedTargetUpper?.value ?? null,
          targetRange: {
            lower: fedTargetLower?.value ?? null,
            upper: fedTargetUpper?.value ?? null,
          },
          effectiveFedFundsRate: fedFunds?.value ?? null,
          date: fedTargetUpper?.date ?? null,
          unit: "%",
          source: "FRED",
          series: {
            targetUpper: "DFEDTARU",
            targetLower: "DFEDTARL",
            effectiveRate: "FEDFUNDS",
          },
        },
        usRatesYieldCurve,
        fedRepricingYieldConfirmation,
        usRatesRegime,
        fedPricing,
        polymarketFedExpectations,
        inflation: {
          headline: {
            cpi: {
              series: "CPIAUCSL",
              source: "FRED",
              unit: "%",
              yoy: {
                current: {
                  value: cpiYoY?.value ?? null,
                  date: cpiYoY?.date ?? null,
                },
                oneMonthAgo: cpiAnalysis.yoy.oneMonthAgo,
                threeMonthsAgo: cpiAnalysis.yoy.threeMonthsAgo,
                sixMonthsAgo: cpiAnalysis.yoy.sixMonthsAgo,
              },
              mom: {
                latest: cpiAnalysis.mom.latest,
                history: cpiAnalysis.mom.history,
              },
              annualized3m: cpiAnalysis.annualized3m,
              monthlyHistory: cpiAnalysis.monthlyHistory,
              trend: cpiAnalysis.trend,
            },
            pce: {
              series: "PCEPI",
              source: "FRED",
              unit: "%",
              yoy: {
                current: {
                  value: pceYoY?.value ?? null,
                  date: pceYoY?.date ?? null,
                },
                oneMonthAgo: pceAnalysis.yoy.oneMonthAgo,
                threeMonthsAgo: pceAnalysis.yoy.threeMonthsAgo,
                sixMonthsAgo: pceAnalysis.yoy.sixMonthsAgo,
              },
              mom: {
                latest: pceAnalysis.mom.latest,
                history: pceAnalysis.mom.history,
              },
              annualized3m: pceAnalysis.annualized3m,
              monthlyHistory: pceAnalysis.monthlyHistory,
              trend: pceAnalysis.trend,
            },
          },
          core: {
            coreCpi: {
              series: "CPILFESL",
              source: "FRED",
              unit: "%",
              yoy: {
                current: {
                  value: coreCpiYoY?.value ?? null,
                  date: coreCpiYoY?.date ?? null,
                },
                oneMonthAgo: coreCpiAnalysis.yoy.oneMonthAgo,
                threeMonthsAgo: coreCpiAnalysis.yoy.threeMonthsAgo,
                sixMonthsAgo: coreCpiAnalysis.yoy.sixMonthsAgo,
              },
              mom: {
                latest: coreCpiAnalysis.mom.latest,
                history: coreCpiAnalysis.mom.history,
              },
              annualized3m: coreCpiAnalysis.annualized3m,
              monthlyHistory: coreCpiAnalysis.monthlyHistory,
              trend: coreCpiAnalysis.trend,
            },
            corePce: {
              series: "PCEPILFE",
              source: "FRED",
              unit: "%",
              yoy: {
                current: {
                  value: corePceYoY?.value ?? null,
                  date: corePceYoY?.date ?? null,
                },
                oneMonthAgo: corePceAnalysis.yoy.oneMonthAgo,
                threeMonthsAgo: corePceAnalysis.yoy.threeMonthsAgo,
                sixMonthsAgo: corePceAnalysis.yoy.sixMonthsAgo,
              },
              mom: {
                latest: corePceAnalysis.mom.latest,
                history: corePceAnalysis.mom.history,
              },
              annualized3m: corePceAnalysis.annualized3m,
              monthlyHistory: corePceAnalysis.monthlyHistory,
              trend: corePceAnalysis.trend,
            },
          },
        },
        growth: {
          gdp: {
            latest: {
              value: gdpCurrent?.value ?? null,
              date: gdpCurrent?.date ?? null,
              qoqAnnualized: gdpQoqAnnualized ?? null,
              yoy: gdpYoY ?? null,
            },
            previousQuarter: {
              value: gdpPreviousQuarter?.value ?? null,
              date: gdpPreviousQuarter?.date ?? null,
            },
            recentHistory: buildQuarterlyHistory(gdpData, 8),
          },
          realPce: {
            latest: {
              value: realPceLatest?.value ?? null,
              date: realPceLatest?.date ?? null,
              mom: realPceMom ?? null,
            },
            recentHistory: realPceHistory,
            direction3m: realPceDirection3m,
            direction6m: realPceDirection6m,
          },
          industrialProduction: {
            latest: {
              value: industrialProductionLatest?.value ?? null,
              date: industrialProductionLatest?.date ?? null,
              mom: industrialProductionMom ?? null,
              yoy: industrialProductionYoY ?? null,
            },
            recentHistory: industrialProductionHistory,
            direction3m: industrialProductionDirection3m,
            direction6m: industrialProductionDirection6m,
          },
          retailSales: {
            latest: {
              value: retailSalesLatest?.value ?? null,
              date: retailSalesLatest?.date ?? null,
              mom: retailSalesMom ?? null,
              yoy: retailSalesYoY ?? null,
            },
            recentHistory: retailSalesHistory,
            direction3m: retailSalesDirection3m,
            direction6m: retailSalesDirection6m,
          },
          ismManufacturing: ismManufacturing,
          ismServices,
        },
        labour,
        labourAssessment,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
