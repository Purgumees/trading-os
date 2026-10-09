"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { GrowthAssessment } from "@/lib/growth-state-engine";
import type { InflationAssessment } from "@/lib/inflation-state-engine";
import type { LabourAssessment } from "@/lib/labour-state-engine";
import type { FedPricingData } from "@/lib/fed-pricing";
import type { PolymarketFedExpectations } from "@/lib/polymarket-fed-expectations";
import type { UsRatesYieldCurveResult } from "@/lib/us-rates-yield-curve-engine";
import type { FedRepricingYieldConfirmation } from "@/lib/fed-repricing-yield-confirmation";
import type { UsRatesRegimeResult } from "@/lib/us-rates-regime-engine";
import type { UsdMacroStateResult } from "@/lib/usd-macro-state-engine";
import type { EuroAreaInflationState } from "@/lib/euro-area-inflation-state-engine";
import type { EuroAreaGrowthState } from "@/lib/euro-area-growth-state-engine";
import type { EuroAreaLabourState } from "@/lib/euro-area-labour-state-engine";

type Metric = {
  value: number | null;
  date: string | null;
};

type GrowthComponent = {
  value: number | null;
  previousValue: number | null;
};

type InflationMetric = {
  value: number | null;
  date: string | null;
};

type InflationDetail = {
  yoy: {
    current: InflationMetric;
    oneMonthAgo: InflationMetric;
    threeMonthsAgo: InflationMetric;
    sixMonthsAgo: InflationMetric;
  };
  mom: {
    latest: InflationMetric;
  };
  annualized3m: InflationMetric;
  monthlyHistory: Array<{
    date: string;
    yoy: number | null;
    mom: number | null;
  }>;
  trend: "Cooling" | "Heating" | "Stable";
};

type EconomyState = {
  growthAssessment: GrowthAssessment;
  inflationAssessment: InflationAssessment;
  labourAssessment: LabourAssessment;
  fedPricing: FedPricingData;
  polymarketFedExpectations: PolymarketFedExpectations;
  usRatesYieldCurve: UsRatesYieldCurveResult;
  fedRepricingYieldConfirmation: FedRepricingYieldConfirmation;
  usRatesRegime: UsRatesRegimeResult;
  usdMacroState: UsdMacroStateResult;
  inflation: {
    headline: {
      cpi: InflationDetail;
      pce: InflationDetail;
    };
    core: {
      coreCpi: InflationDetail;
      corePce: InflationDetail;
    };
  };
  growth: {
    gdp: {
      latest: {
        value: number | null;
        date: string | null;
        qoqAnnualized: number | null;
        yoy: number | null;
      };
      previousQuarter: { date: string | null };
      recentHistory: Array<{ qoqAnnualized: number | null }>;
    };
    realPce: {
      latest: { mom: number | null; yoy: number | null };
      direction3m: "up" | "down" | "flat";
      direction6m: "up" | "down" | "flat";
    };
    industrialProduction: {
      latest: { mom: number | null; yoy: number | null };
      direction3m: "up" | "down" | "flat";
      direction6m: "up" | "down" | "flat";
    };
    retailSales: {
      latest: { mom: number | null; yoy: number | null };
      direction3m: "up" | "down" | "flat";
      direction6m: "up" | "down" | "flat";
    };
    ismManufacturing: {
      components: {
        manufacturingPmi: GrowthComponent;
        newOrders: GrowthComponent;
      };
    } | null;
    ismServices: {
      components: {
        servicesPmi: GrowthComponent;
        businessActivity: GrowthComponent;
        newOrders: GrowthComponent;
      };
    } | null;
  };
  labour: {
    unemploymentRate: {
      latest: Metric;
      previousMonth: Metric;
    };
    nonfarmPayrollEmployment: {
      latestMonthlyChange: Metric;
      previousMonthlyChange: Metric;
      averageMonthlyChange3m: Metric;
      averageMonthlyChange6m: Metric;
    };
    averageHourlyEarnings: {
      latestMoM: Metric;
      previousMoM: Metric;
      latestYoY: Metric;
      annualized3m: Metric;
    };
    initialJoblessClaims: {
      latest: Metric;
      previousWeek: Metric;
      average4Week: Metric;
    };
    joltsJobOpenings: {
      latest: Metric;
      previousMonth: Metric;
      threeMonthsAgo: Metric;
      sixMonthsAgo: Metric;
    };
  };
};

type EconomyResponse = {
  status: string;
  economyState?: EconomyState;
  message?: string;
};

type EuroInflationResponse = {
  status: string;
  euroAreaInflation?: EuroAreaInflationState;
  message?: string;
};

type EuroGrowthResponse = {
  status: string;
  euroAreaGrowth?: EuroAreaGrowthState;
  message?: string;
};

type EuroLabourResponse = {
  status: string;
  euroAreaLabour?: EuroAreaLabourState;
  message?: string;
};

function formatNumber(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${formatNumber(value)}%`;
}

function formatClaims(value: number | null) {
  return value === null ? "—" : `${formatNumber(value / 1000, 0)}k`;
}

function formatMillionsFromThousands(value: number | null) {
  return value === null ? "—" : `${formatNumber(value / 1000)}m`;
}

function formatSignedThousands(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 0)}k`;
}

function formatBasisPoints(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${formatNumber(value)} bp`;
}

function ratesRegimeExplanation(regime: string, liveExplanation: string) {
  switch (regime) {
    case "BULL STEEPENING":
      return "Short-term yields are falling faster than long-term yields.";
    case "BEAR STEEPENING":
      return "Long-term yields are rising faster than short-term yields.";
    case "BULL FLATTENING":
      return "Long-term yields are falling faster than short-term yields.";
    case "BEAR FLATTENING":
      return "Short-term yields are rising faster than long-term yields.";
    case "MIXED / UNCLEAR":
      return liveExplanation.split(" The yield curve is ")[0] ?? liveExplanation;
    case "UNAVAILABLE":
      return "Matched yield changes are unavailable.";
    default:
      return liveExplanation.split(" The yield curve is ")[0] ?? liveExplanation;
  }
}

function curveDirectionExplanation(direction: string, liveExplanation: string) {
  switch (direction) {
    case "STEEPENING":
      return "The gap between short- and long-term yields is widening.";
    case "FLATTENING":
      return "The gap between short- and long-term yields is narrowing.";
    case "STABLE":
      return "The gap between short- and long-term yields is little changed.";
    case "MIXED":
      return liveExplanation.match(/The yield curve is mixed\/unclear: (.+)$/)?.[1] ??
        "2s10s and 2s30s are moving in different directions.";
    default:
      return "Matched yield-curve changes are unavailable.";
  }
}

function formatObservationDate(date: string | null) {
  return date ?? "Unavailable";
}

function formatDate(date: string | null) {
  if (!date) {
    return "—";
  }

  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(parsed);
}

function formatDateTime(timestamp: string | null) {
  if (!timestamp) return "—";
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      }).format(parsed);
}

function formatFreshness(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "unavailable";
  if (seconds < 60) return `${seconds}s old`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m old`;
  return `${(seconds / 3600).toFixed(1)}h old`;
}

function formatMonth(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
      ? "—"
      : new Intl.DateTimeFormat("en-US", {
          month: "short",
          timeZone: "UTC",
        }).format(parsed);
}

function movement(current: number | null, previous: number | null) {
  if (current === null || previous === null) {
    return null;
  }

  if (Math.abs(current - previous) < 1e-9) {
    return "stable" as const;
  }

  return current > previous ? ("up" as const) : ("down" as const);
}

function Direction({
  direction,
  meaning,
}: {
  direction: "up" | "down" | "flat" | "stable" | null;
  meaning?: Partial<Record<"up" | "down" | "flat" | "stable", string>>;
}) {
  if (!direction) {
    return <span className="text-sm text-muted-foreground">Direction: —</span>;
  }

  const symbol = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
  const label =
    meaning?.[direction] ??
    (direction === "up" ? "Rising" : direction === "down" ? "Falling" : "Stable");

  return (
    <span className="text-sm text-muted-foreground">
      {symbol} {label}
    </span>
  );
}

function ValueCell({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function DataCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-xl border p-5">
      <h3 className="mb-4 font-semibold">{title}</h3>
      {children}
    </article>
  );
}

function IsmMetric({ current, previous }: { current: number | null; previous: number | null }) {
  const direction = movement(current, previous);

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <ValueCell label="Current" value={formatNumber(current)} />
        <ValueCell label="Previous" value={formatNumber(previous)} />
      </div>
      <div className="mt-4 space-y-2">
        <Direction direction={direction} />
        <p className="text-sm text-muted-foreground">
          {current === null
            ? "Survey reading is not available."
            : current > 50
              ? "Above 50 indicates expansion."
              : current < 50
                ? "Below 50 indicates contraction."
                : "At 50 indicates no change."}
        </p>
      </div>
    </>
  );
}

const currencies = [
  { currency: "USD", bias: "Neutral", score: 0 },
  { currency: "EUR", bias: "Neutral", score: 0 },
  { currency: "GBP", bias: "Neutral", score: 0 },
  { currency: "JPY", bias: "Neutral", score: 0 },
  { currency: "CAD", bias: "Neutral", score: 0 },
  { currency: "AUD", bias: "Neutral", score: 0 },
  { currency: "NZD", bias: "Neutral", score: 0 },
];

const FOREX_PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "USDCAD", "AUDUSD", "NZDUSD"] as const;
type ForexPair = (typeof FOREX_PAIRS)[number];

const catalysts = [
  "Treasury auctions",
  "Treasury buybacks",
  "Fed / FOMC",
  "CPI / PCE / PPI",
  "NFP / unemployment",
  "ISM / PMI",
];

function Card({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border p-5">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default function MacroPage() {
  const [selectedPair, setSelectedPair] = useState<ForexPair>("EURUSD");
  const [economy, setEconomy] = useState<EconomyState | null>(null);
  const [economyError, setEconomyError] = useState<string | null>(null);
  const [euroAreaInflation, setEuroAreaInflation] =
    useState<EuroAreaInflationState | null>(null);
  const [euroInflationError, setEuroInflationError] = useState<string | null>(null);
  const [euroAreaGrowth, setEuroAreaGrowth] = useState<EuroAreaGrowthState | null>(null);
  const [euroGrowthError, setEuroGrowthError] = useState<string | null>(null);
  const [euroAreaLabour, setEuroAreaLabour] = useState<EuroAreaLabourState | null>(null);
  const [euroLabourError, setEuroLabourError] = useState<string | null>(null);
  const baseCurrency = selectedPair.slice(0, 3);
  const quoteCurrency = selectedPair.slice(3, 6);

  useEffect(() => {
    let active = true;

    async function loadEconomyState() {
      try {
        const response = await fetch("/api/macro/economy-state");
        const payload = (await response.json()) as EconomyResponse;

        if (!response.ok || payload.status !== "ok" || !payload.economyState) {
          throw new Error(payload.message ?? "Macro data is unavailable.");
        }

        if (active) {
          setEconomy(payload.economyState);
          setEconomyError(null);
        }
      } catch (error) {
        if (active) {
          setEconomyError(error instanceof Error ? error.message : "Macro data is unavailable.");
        }
      }
    }

    void loadEconomyState();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadEuroAreaGrowth() {
      try {
        const response = await fetch("/api/macro/euro-area-growth");
        const payload = (await response.json()) as EuroGrowthResponse;
        if (!response.ok || !payload.euroAreaGrowth) {
          throw new Error(payload.message ?? "Euro Area growth data is unavailable.");
        }
        if (active) {
          setEuroAreaGrowth(payload.euroAreaGrowth);
          setEuroGrowthError(null);
        }
      } catch (error) {
        if (active) {
          setEuroGrowthError(
            error instanceof Error ? error.message : "Euro Area growth data is unavailable."
          );
        }
      }
    }

    void loadEuroAreaGrowth();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadEuroAreaInflation() {
      try {
        const response = await fetch("/api/macro/euro-area-inflation");
        const payload = (await response.json()) as EuroInflationResponse;
        if (!response.ok || !payload.euroAreaInflation) {
          throw new Error(payload.message ?? "Euro Area inflation data is unavailable.");
        }
        if (active) {
          setEuroAreaInflation(payload.euroAreaInflation);
          setEuroInflationError(null);
        }
      } catch (error) {
        if (active) {
          setEuroInflationError(
            error instanceof Error ? error.message : "Euro Area inflation data is unavailable."
          );
        }
      }
    }

    void loadEuroAreaInflation();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadEuroAreaLabour() {
      try {
        const response = await fetch("/api/macro/euro-area-labour");
        const payload = (await response.json()) as EuroLabourResponse;
        if (!response.ok || !payload.euroAreaLabour) {
          throw new Error(payload.message ?? "Euro Area labour data is unavailable.");
        }
        if (active) {
          setEuroAreaLabour(payload.euroAreaLabour);
          setEuroLabourError(null);
        }
      } catch (error) {
        if (active) {
          setEuroLabourError(
            error instanceof Error ? error.message : "Euro Area labour data is unavailable."
          );
        }
      }
    }

    void loadEuroAreaLabour();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Macro Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Macro environment, currency bias and weekly forecast.
        </p>
      </div>

      <section aria-label="Forex pair selector" className="mb-8 rounded-xl border p-5">
        <h2 className="text-sm font-semibold">SELECT FOREX PAIR</h2>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Forex pairs">
          {FOREX_PAIRS.map((pair) => {
            const isSelected = pair === selectedPair;
            return (
              <button
                aria-pressed={isSelected}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:bg-muted"
                }`}
                key={pair}
                onClick={() => setSelectedPair(pair)}
                type="button"
              >
                {pair}
              </button>
            );
          })}
        </div>
        <div aria-live="polite" className="mt-3 text-sm">
          <p>
            <span className="font-medium">Selected Pair:</span> {selectedPair}
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Comparing:</span>{" "}
            {baseCurrency} vs {quoteCurrency}
          </p>
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">EURO AREA GROWTH</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Real activity from Eurostat; European Commission business survey forward indicators
            from DG ECFIN via Eurostat.
          </p>
        </div>
        <article className="rounded-xl border p-5">
          {euroAreaGrowth ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Current Growth State
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {euroAreaGrowth.assessment.currentState}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Growth Momentum
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {euroAreaGrowth.assessment.momentum}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Forward Growth
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {euroAreaGrowth.assessment.forwardGrowth}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-3 border-t pt-3 text-sm sm:grid-cols-3">
                <p className="text-muted-foreground">
                  {euroAreaGrowth.assessment.explanation.currentState}
                </p>
                <p className="text-muted-foreground">
                  {euroAreaGrowth.assessment.explanation.momentum}
                </p>
                <p className="text-muted-foreground">
                  {euroAreaGrowth.assessment.explanation.forwardGrowth}
                </p>
              </div>
              {euroAreaGrowth.explanations.map((explanation) => (
                <p className="mt-2 text-xs text-amber-700" key={explanation}>
                  {explanation}
                </p>
              ))}
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <h3 className="font-semibold">Economic Growth (Real GDP)</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Observation freshness: {euroAreaGrowth.gdp.freshness}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <ValueCell
                      label="QoQ"
                      value={formatPercent(euroAreaGrowth.gdp.latest.qoq.value)}
                      detail={euroAreaGrowth.gdp.latest.qoq.date ?? "—"}
                    />
                    <ValueCell
                      label="QoQ annualized"
                      value={formatPercent(euroAreaGrowth.gdp.latest.qoqAnnualized.value)}
                    />
                    <ValueCell label="YoY" value={formatPercent(euroAreaGrowth.gdp.latest.yoy.value)} />
                    <ValueCell
                      label="Previous quarter level"
                      value={formatNumber(euroAreaGrowth.gdp.previousQuarter.value)}
                      detail={euroAreaGrowth.gdp.previousQuarter.date ?? "—"}
                    />
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <h3 className="font-semibold">Household / Private Consumption (Real)</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Observation freshness: {euroAreaGrowth.householdConsumption.freshness}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <ValueCell
                      label="QoQ"
                      value={formatPercent(euroAreaGrowth.householdConsumption.latest.qoq.value)}
                      detail={euroAreaGrowth.householdConsumption.latest.qoq.date ?? "—"}
                    />
                    <ValueCell
                      label="QoQ annualized"
                      value={formatPercent(
                        euroAreaGrowth.householdConsumption.latest.qoqAnnualized.value
                      )}
                    />
                    <ValueCell
                      label="YoY"
                      value={formatPercent(euroAreaGrowth.householdConsumption.latest.yoy.value)}
                    />
                  </div>
                </div>
                {([
                  ["Industrial Production", euroAreaGrowth.industrialProduction],
                  ["Retail Sales", euroAreaGrowth.retailSales],
                ] as const).map(([title, activity]) => (
                  <div className="rounded-lg border p-4" key={title}>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Observation freshness: {activity.freshness}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <ValueCell
                        label="Latest MoM"
                        value={formatPercent(activity.latest.mom.value)}
                        detail={activity.latest.mom.date ?? "—"}
                      />
                      <ValueCell label="YoY" value={formatPercent(activity.latest.yoy.value)} />
                      <ValueCell
                        label="3-month change"
                        value={formatPercent(activity.shortTermChange.value)}
                        detail={`Direction: ${activity.direction3m}`}
                      />
                      <ValueCell
                        label="6-month change"
                        value={formatPercent(activity.mediumTermChange.value)}
                        detail={`Direction: ${activity.direction6m}`}
                      />
                    </div>
                  </div>
                ))}
                {([
                  ["Manufacturing Order Books", euroAreaGrowth.forwardSurvey.manufacturingOrderBooks],
                  ["Manufacturing Production Expectations", euroAreaGrowth.forwardSurvey.manufacturingProductionExpectations],
                  ["Services Demand Expectations", euroAreaGrowth.forwardSurvey.servicesDemandExpectations],
                ] as const).map(([title, indicator]) =>
                  indicator.status === "available" ? (
                    <div className="rounded-lg border p-4" key={title}>
                      <h3 className="font-semibold">{title}</h3>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <ValueCell label="Latest" value={formatNumber(indicator.latest.value)} />
                        <ValueCell label="Recent Change" value={formatNumber(indicator.recentChange.value)} />
                        <ValueCell label="3M Change" value={formatNumber(indicator.shortTermChange.value)} />
                        <ValueCell label="Freshness" value={indicator.freshness} />
                      </div>
                    </div>
                  ) : null
                )}
              </div>
              <details className="mt-5 border-t pt-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium">Sources and freshness</summary>
                <p className="mt-2">{euroAreaGrowth.sources.freshnessMethod}</p>
                <p className="mt-2">{euroAreaGrowth.sources.surveyMethod}</p>
                {([
                  ["Real GDP", euroAreaGrowth.gdp],
                  ["Household consumption", euroAreaGrowth.householdConsumption],
                  ["Industrial production", euroAreaGrowth.industrialProduction],
                  ["Retail sales", euroAreaGrowth.retailSales],
                ] as const).map(([label, item]) => (
                  <p className="mt-2" key={label}>
                    {label}: {item.series?.dataset ?? "unavailable"} · {item.series?.unit ?? "—"} ·
                    {" "}Eurostat {item.series?.geo ?? "—"} · observed{" "}
                    {item.series?.latestObservationDate ?? "—"} · freshness {item.freshness}
                    {item.series ? (
                      <>
                        {" "}· filters {Object.entries(item.series.filters)
                          .filter(([key]) => key !== "sinceTimePeriod")
                          .map(([key, value]) => `${key}=${value}`)
                          .join(", ")}
                      </>
                    ) : null}
                    {item.series?.lastUpdated ? ` · updated ${item.series.lastUpdated}` : ""}
                  </p>
                ))}
              </details>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {euroGrowthError ?? "Loading Euro Area growth data…"}
            </p>
          )}
        </article>
      </section>

      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">EURO AREA LABOUR STATE</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Labour market assessment using official Eurostat labour indicators.
          </p>
        </div>
        <article className="rounded-xl border p-5">
          {euroAreaLabour ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Current Labour State
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {euroAreaLabour.assessment.currentLabourState}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Labour Momentum
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {euroAreaLabour.assessment.labourMomentum}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Wage Pressure
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {euroAreaLabour.assessment.wagePressure}
                  </p>
                </div>
              </div>
              {euroAreaLabour.explanations.map((explanation) => (
                <p className="mt-2 text-xs text-amber-700" key={explanation}>
                  {explanation}
                </p>
              ))}
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {([
                  ["Unemployment", euroAreaLabour.unemployment],
                  ["Employment", euroAreaLabour.employment],
                  ["Job Vacancies", euroAreaLabour.jobVacancies],
                  ["Wage Growth", euroAreaLabour.wageGrowth],
                ] as const).map(([title, indicator]) =>
                  indicator.indicator?.status === "available" ? (
                    <div className="rounded-lg border p-4" key={title}>
                      <h3 className="font-semibold">{title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Freshness: {indicator.freshness}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <ValueCell label="Latest" value={formatNumber(indicator.indicator.latest.value)} />
                        <ValueCell label="Previous" value={formatNumber(indicator.indicator.previous.value)} />
                        <ValueCell label="3M Change" value={formatNumber(indicator.indicator.threeMonthChange.value)} />
                        <ValueCell label="Direction" value={indicator.indicator.direction3m} />
                      </div>
                    </div>
                  ) : indicator.error ? (
                    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4" key={title}>
                      <h3 className="font-semibold">{title}</h3>
                      <p className="mt-2 text-xs text-yellow-800">{indicator.error}</p>
                    </div>
                  ) : null
                )}
              </div>
              <details className="mt-5 border-t pt-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium">Sources and freshness</summary>
                {([
                  ["Unemployment Rate", euroAreaLabour.unemployment],
                  ["Employment Rate", euroAreaLabour.employment],
                  ["Job Vacancy Rate", euroAreaLabour.jobVacancies],
                  ["Wage Growth", euroAreaLabour.wageGrowth],
                ] as const).map(([label, item]) => (
                  <p className="mt-2" key={label}>
                    {label}: {item.indicator?.dataset ?? "unavailable"} · {item.indicator?.unit ?? "—"} · Eurostat
                    {" "}{item.indicator?.geo ?? "—"} · observed{" "}
                    {item.indicator?.latest.date ?? "—"} · freshness {item.freshness}
                    {item.error && ` · Error: ${item.error}`}
                  </p>
                ))}
              </details>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {euroLabourError ?? "Loading Euro Area labour data…"}
            </p>
          )}
        </article>
      </section>

      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">USD MACRO STATE</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            An evidence-based standalone USD macro assessment, not a DXY or
            currency-pair trading signal.
          </p>
        </div>
        <article className="rounded-xl border p-5">
          {economy?.usdMacroState ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    USD Bias
                  </p>
                  <p className="mt-1 text-lg font-semibold">{economy.usdMacroState.bias}</p>
                  <p className="text-xs text-muted-foreground">
                    Confidence: {economy.usdMacroState.confidence}%
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Primary Theme
                  </p>
                  <p className="mt-1 text-sm font-semibold">{economy.usdMacroState.primaryTheme}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Secondary: {economy.usdMacroState.secondaryTheme}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Policy / Rates
                  </p>
                  <p className="mt-1 text-sm">
                    Fed repricing (Polymarket): {economy.usdMacroState.policyImpulse.oneWeek}
                  </p>
                  <p className="text-sm">
                    2Y confirmation: {economy.usdMacroState.marketConfirmation.oneWeek}
                  </p>
                  <p className="text-sm">
                    Rates regime: {economy.usRatesRegime.horizons.oneWeek.regime}
                  </p>
                  <p className="text-xs italic text-muted-foreground">
                    {ratesRegimeExplanation(
                      economy.usRatesRegime.horizons.oneWeek.regime,
                      economy.usRatesRegime.horizons.oneWeek.explanation
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Fundamental State
                  </p>
                  <p className="mt-1 text-sm">
                    Growth: {economy.usdMacroState.fundamentalState.growth.current} ·{" "}
                    {economy.usdMacroState.fundamentalState.growth.momentum} · forward{" "}
                    {economy.usdMacroState.fundamentalState.growth.forward}
                  </p>
                  <p className="text-sm">
                    Labour: {economy.usdMacroState.fundamentalState.labour.current} ·{" "}
                    {economy.usdMacroState.fundamentalState.labour.momentum}
                  </p>
                  <p className="text-sm">
                    Inflation: {economy.usdMacroState.fundamentalState.inflation.current} · core{" "}
                    {economy.usdMacroState.fundamentalState.inflation.coreShortTerm.toLowerCase()}
                  </p>
                </div>
              </div>
              <div className="mt-5 border-t pt-4">
                <p className="text-sm font-semibold">Macro Impulse</p>
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                  <p>
                    Growth: {economy.usdMacroState.macroImpulse.growth.direction} ·{" "}
                    {economy.usdMacroState.macroImpulse.growth.momentum}
                  </p>
                  <p>
                    Labour: {economy.usdMacroState.macroImpulse.labour.direction} ·{" "}
                    {economy.usdMacroState.macroImpulse.labour.momentum}
                  </p>
                  <p>
                    Inflation: {economy.usdMacroState.macroImpulse.inflation.direction} · core{" "}
                    {economy.usdMacroState.macroImpulse.inflation.coreShortTerm.toLowerCase()} /
                    {" "}{economy.usdMacroState.macroImpulse.inflation.coreMediumTerm.toLowerCase()}
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Wage pressure: {economy.usdMacroState.macroImpulse.labour.wagePressure} · Forward
                  price pressure: {economy.usdMacroState.macroImpulse.inflation.forwardPricePressure}
                </p>
              </div>
              <div className="mt-5 grid gap-5 border-t pt-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold">Drivers</p>
                  <p className="mt-2 text-sm">
                    Primary: {economy.usdMacroState.primaryDriver}
                  </p>
                  <p className="text-sm">
                    Secondary: {economy.usdMacroState.secondaryDriver}
                  </p>
                  <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Supporting evidence
                  </p>
                  <ul className="mt-1 list-inside list-disc text-sm">
                    {economy.usdMacroState.supportingEvidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Contradicting evidence
                  </p>
                  <ul className="mt-1 list-inside list-disc text-sm">
                    {economy.usdMacroState.contradictingEvidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-semibold">What changes the bias?</p>
                  <ul className="mt-2 list-inside list-disc text-sm">
                    {economy.usdMacroState.whatChangesBias.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted-foreground">
                    1D: {economy.usdMacroState.policyImpulse.oneDay} · 1W:{" "}
                    {economy.usdMacroState.policyImpulse.oneWeek} · 1M:{" "}
                    {economy.usdMacroState.policyImpulse.oneMonth}
                  </p>
                  <p className="mt-1 text-sm">
                    Multi-horizon context: {economy.usdMacroState.multiHorizonContext}
                  </p>
                  <p className="mt-2 text-sm">{economy.usdMacroState.explanation}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Confidence reflects evidence alignment, not the probability USD will rise or fall.
                  </p>
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">How confidence is derived</summary>
                    <p className="mt-1">{economy.usdMacroState.confidenceMethod}</p>
                  </details>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">USD macro state unavailable.</p>
          )}
        </article>
      </section>

      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">
            FED MARKET EXPECTATIONS — POLYMARKET
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Prediction-market prices from Polymarket. These are not CME FedWatch
            or Fed Funds futures probabilities.
          </p>
        </div>
        <article className="rounded-xl border p-5">
          <div className="mb-5 grid gap-5 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Current Fed Policy (FRED reference)
              </p>
              <p className="mt-2 text-sm">
                Target: {formatPercent(economy?.fedPricing.currentPolicy.targetLower ?? null)}–
                {formatPercent(economy?.fedPricing.currentPolicy.targetUpper ?? null)}
              </p>
              <p className="mt-1 text-sm">
                Effective Fed Funds Rate:{" "}
                {formatPercent(economy?.fedPricing.currentPolicy.effectiveFedFundsRate ?? null)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                FRED observation: {formatDate(economy?.fedPricing.currentPolicy.observedAt ?? null)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Polymarket Data
              </p>
              <p className="mt-2 text-sm">
                Source: {economy?.polymarketFedExpectations.source ?? "Polymarket Gamma + CLOB API"}
              </p>
              <p className="mt-1 text-sm">
                Status: {economy?.polymarketFedExpectations.status ?? "unavailable"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Values are market-implied prediction-market prices, not CME futures pricing.
              </p>
            </div>
          </div>
          {economy?.polymarketFedExpectations.upcomingMeetings.length ? (
            economy.polymarketFedExpectations.upcomingMeetings.map((meeting, index) => {
              const horizons = [
                { key: "now", label: "NOW" },
                { key: "oneDayAgo", label: "1D" },
                { key: "oneWeekAgo", label: "1W" },
                { key: "oneMonthAgo", label: "1M" },
              ] as const;
              const categories = [
                { key: "cut", label: "CUT" },
                { key: "hold", label: "HOLD" },
                { key: "hike", label: "HIKE" },
              ] as const;
              return (
                <div className="mb-6 overflow-x-auto" key={meeting.meetingDate}>
                  <h3 className="mb-1 text-sm font-semibold">
                    {index === 0 ? "Next FOMC" : "FOMC"}: {formatDate(meeting.meetingDate)}
                  </h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    {meeting.meetingLabel} · {meeting.status === "available" ? "Market data available" : meeting.reason}
                  </p>
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Outcome</th>
                        {horizons.map((horizon) => (
                          <th className="py-2 pr-3 font-medium" key={horizon.key}>
                            {horizon.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((category) => (
                        <tr className="border-b last:border-0" key={category.key}>
                          <td className="py-2 pr-3 font-medium">{category.label}</td>
                          {horizons.map((horizon) => {
                            const snapshot = meeting.snapshots[horizon.key];
                            const probability =
                              snapshot?.normalizedProbabilities[category.key];
                            return (
                              <td className="py-2 pr-3" key={horizon.key}>
                                {probability === undefined
                                  ? "—"
                                  : `${formatNumber(probability)}%`}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr className="border-t text-xs text-muted-foreground">
                        <td className="py-2 pr-3">As of (UTC)</td>
                        {horizons.map((horizon) => {
                          const snapshot = meeting.snapshots[horizon.key];
                          return (
                            <td className="py-2 pr-3" key={horizon.key}>
                              {snapshot ? formatDateTime(snapshot.capturedAt) : "Unavailable"}
                              {horizon.key === "now" && snapshot
                                ? ` · ${formatFreshness(snapshot.freshnessSeconds)}`
                                : ""}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                    {([
                      { key: "oneDay", label: "1D Repricing" },
                      { key: "oneWeek", label: "1W Repricing" },
                      { key: "oneMonth", label: "1M Repricing" },
                    ] as const).map(({ key, label }) => {
                      const repricing = meeting.repricing[key];
                      const categoryChanges = repricing.categoryProbabilityChanges
                        .map((change) => {
                          const points = change.probabilityChangePercentagePoints;
                          return `${change.kind.toUpperCase()} ${points > 0 ? "+" : ""}${formatNumber(points)} pp`;
                        })
                        .join(" · ");
                      return (
                        <div key={key}>
                          <p>
                            <span className="font-medium">{label}:</span>{" "}
                            {repricing.state} {repricing.arrow}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Expected policy-rate change:{" "}
                            {repricing.expectedRateChangeBasisPoints === null
                              ? "Unavailable for open-ended 50bp+ outcomes"
                              : `${repricing.expectedRateChangeBasisPoints > 0 ? "+" : ""}${formatNumber(repricing.expectedRateChangeBasisPoints)} bp`}
                          </p>
                          {categoryChanges ? (
                            <p className="text-xs text-muted-foreground">{categoryChanges}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  {meeting.rawCurrentOutcomes.length > 0 ? (
                    <details className="mt-3 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">
                        Raw Polymarket outcomes (audit)
                      </summary>
                      <p className="mt-1">
                        Raw YES-price sum:{" "}
                        {meeting.rawCurrentProbabilitySum === null
                          ? "incomplete"
                          : `${formatNumber(meeting.rawCurrentProbabilitySum * 100)}%`}
                        {" · "}
                        {meeting.snapshots.now
                          ? "Proportional normalization applied within configured tolerance."
                          : "Distribution rejected; no normalization applied."}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {meeting.rawCurrentOutcomes.map((outcome) => (
                          <li key={outcome.outcomeId}>
                            {outcome.question}: {formatNumber(outcome.yesPrice * 100)}%
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">
              Polymarket FOMC markets unavailable
              {economy?.polymarketFedExpectations.reason
                ? `: ${economy.polymarketFedExpectations.reason}`
                : "."}
            </p>
          )}
          <div className="mt-4 rounded-lg border p-3 text-sm">
            <p className="font-medium">CME FedWatch Benchmark / Reference</p>
            <p className="mt-1 text-muted-foreground">
              CME FedWatch: Data source not connected. Polymarket values above are
              kept separate and must not be interpreted as CME futures-implied probabilities.
            </p>
          </div>
          {economy?.polymarketFedExpectations.reason ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Source status: {economy.polymarketFedExpectations.reason}
            </p>
          ) : null}
        </article>
      </section>

      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">US RATES REGIME</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Treasury yield movements and curve structure over matched horizons. This is not a USD bias or trading signal.
          </p>
        </div>
        <article className="rounded-xl border p-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Horizon</th>
                  <th className="py-2 pr-3 font-medium">2Y</th>
                  <th className="py-2 pr-3 font-medium">10Y</th>
                  <th className="py-2 pr-3 font-medium">30Y</th>
                  <th className="py-2 pr-3 font-medium">Yield Curve</th>
                  <th className="py-2 pr-3 font-medium">Regime</th>
                </tr>
              </thead>
              <tbody>
                {([
                  ["oneDay", "1D"],
                  ["oneWeek", "1W"],
                  ["oneMonth", "1M"],
                ] as const).map(([key, label]) => {
                  const horizon = economy?.usRatesRegime.horizons[key];
                  return (
                    <tr className="border-b last:border-0" key={key}>
                      <td className="py-2 pr-3 font-medium">{label}</td>
                      <td className="py-2 pr-3">
                        {formatBasisPoints(horizon?.changes["2Y"] ?? null)}
                      </td>
                      <td className="py-2 pr-3">
                        {formatBasisPoints(horizon?.changes["10Y"] ?? null)}
                      </td>
                      <td className="py-2 pr-3">
                        {formatBasisPoints(horizon?.changes["30Y"] ?? null)}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="font-medium">
                          {horizon?.curveDirection === "MIXED"
                            ? "MIXED / UNCLEAR"
                            : horizon?.curveDirection ?? "UNAVAILABLE"}
                        </span>
                        <span className="block text-xs italic text-muted-foreground">
                          {curveDirectionExplanation(
                            horizon?.curveDirection ?? "UNAVAILABLE",
                            horizon?.explanation ?? ""
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">Spread changes</span>
                        <span>2s10s {formatBasisPoints(horizon?.changes["2s10s"] ?? null)}</span>
                        <span className="block">
                          2s30s {formatBasisPoints(horizon?.changes["2s30s"] ?? null)}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="font-medium">{horizon?.regime ?? "UNAVAILABLE"}</span>
                        <span className="block text-xs italic text-muted-foreground">
                          {ratesRegimeExplanation(
                            horizon?.regime ?? "UNAVAILABLE",
                            horizon?.explanation ?? ""
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-2 border-t pt-4 text-sm">
            <p>
              <span className="font-medium">Primary 1W Regime: </span>
              {economy?.usRatesRegime.primaryRegime ?? "UNAVAILABLE"}
              <span className="block text-xs italic text-muted-foreground">
                {ratesRegimeExplanation(
                  economy?.usRatesRegime.horizons.oneWeek.regime ?? "UNAVAILABLE",
                  economy?.usRatesRegime.horizons.oneWeek.explanation ?? ""
                )}
              </span>
            </p>
            <p>
              <span className="font-medium">Yield Curve: </span>
              {economy?.usRatesRegime.horizons.oneWeek.curveDirection === "MIXED"
                ? "MIXED / UNCLEAR"
                : economy?.usRatesRegime.horizons.oneWeek.curveDirection ?? "UNAVAILABLE"}
              <span className="block text-xs italic text-muted-foreground">
                {curveDirectionExplanation(
                  economy?.usRatesRegime.horizons.oneWeek.curveDirection ?? "UNAVAILABLE",
                  economy?.usRatesRegime.horizons.oneWeek.explanation ?? ""
                )}
              </span>
            </p>
            <p>
              <span className="font-medium">FRONT-END</span>
              <span className="block text-xs italic text-muted-foreground">
                Shorter-term yields, especially the 2Y, which are highly sensitive to Fed expectations.
              </span>
            </p>
            <p>
              <span className="font-medium">LONG-END</span>
              <span className="block text-xs italic text-muted-foreground">
                Longer-term yields such as the 10Y and 30Y.
              </span>
            </p>
            <p>
              <span className="font-medium">Fed × 2Y confirmation (FRONT-END): </span>
              {economy?.usRatesRegime.frontEndFedConfirmation ?? "UNAVAILABLE"}
              <span className="ml-1 text-xs text-muted-foreground">
                (Fed repricing source: Polymarket)
              </span>
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Explanation: </span>
              {economy?.usRatesRegime.explanation ??
                "US rates regime data is unavailable."}
            </p>
          </div>
        </article>
      </section>

      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">
            FED REPRICING × 2Y CONFIRMATION
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Checks whether the US 2Y front end moved with Polymarket-based Fed expectations. This is descriptive confirmation, not a USD or trading signal.
          </p>
        </div>
        <article className="rounded-xl border p-5">
          <p className="mb-3 text-xs text-muted-foreground">
            Fed source: Polymarket prediction-market repricing
            {economy?.fedRepricingYieldConfirmation.meetingDate
              ? ` · ${economy.fedRepricingYieldConfirmation.meetingLabel} (${formatDate(economy.fedRepricingYieldConfirmation.meetingDate)})`
              : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Horizon</th>
                  <th className="py-2 pr-3 font-medium">Fed Repricing (Polymarket)</th>
                  <th className="py-2 pr-3 font-medium">US 2Y</th>
                  <th className="py-2 pr-3 font-medium">Confirmation</th>
                </tr>
              </thead>
              <tbody>
                {([
                  ["oneDay", "1D"],
                  ["oneWeek", "1W"],
                  ["oneMonth", "1M"],
                ] as const).map(([key, label]) => {
                  const horizon =
                    economy?.fedRepricingYieldConfirmation.horizons[key];
                  return (
                    <tr className="border-b last:border-0" key={key}>
                      <td className="py-2 pr-3 font-medium">{label}</td>
                      <td className="py-2 pr-3">
                        {horizon
                          ? `${horizon.fedState} ${horizon.fedArrow}`
                          : "UNAVAILABLE"}
                      </td>
                      <td className="py-2 pr-3">
                        {horizon
                          ? `${formatBasisPoints(horizon.twoYearChangeBasisPoints)} ${horizon.twoYearArrow}`
                          : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {horizon?.state ?? "UNAVAILABLE"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-2 border-t pt-4 text-sm sm:grid-cols-2">
            <p>
              <span className="font-medium">Overall confirmation: </span>
              {economy?.fedRepricingYieldConfirmation.overall ?? "INSUFFICIENT DATA"}
            </p>
            <p>
              <span className="font-medium">Primary horizon: </span>
              {economy?.fedRepricingYieldConfirmation.primaryHorizon ?? "1W"}
            </p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Explanation: </span>
            {economy?.fedRepricingYieldConfirmation.explanation ??
              "Matched-horizon Fed repricing and US 2Y data are unavailable."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Uses the next FOMC meeting’s Polymarket repricing and same-horizon FRED 2Y changes only; no CME FedWatch, macro-engine inputs, or trade direction are implied.
          </p>
        </article>
      </section>

      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">US RATES &amp; YIELD CURVE</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Official daily US Treasury constant-maturity yields from FRED. Changes and curve spreads are shown in basis points.
          </p>
        </div>
        <article className="rounded-xl border p-5">
          <h3 className="mb-3 text-sm font-semibold">US Treasury Yields</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Maturity</th>
                  <th className="py-2 pr-3 font-medium">NOW</th>
                  <th className="py-2 pr-3 font-medium">1D</th>
                  <th className="py-2 pr-3 font-medium">1W</th>
                  <th className="py-2 pr-3 font-medium">1M</th>
                  <th className="py-2 pr-3 font-medium">3M</th>
                </tr>
              </thead>
              <tbody>
                {(["2Y", "5Y", "10Y", "30Y"] as const).map((maturity) => {
                  const rate = economy?.usRatesYieldCurve.maturities[maturity];
                  const horizons = [
                    { key: "oneDay", label: "1D" },
                    { key: "oneWeek", label: "1W" },
                    { key: "oneMonth", label: "1M" },
                    { key: "threeMonths", label: "3M" },
                  ] as const;
                  return (
                    <tr className="border-b last:border-0" key={maturity}>
                      <td className="py-2 pr-3 font-medium">{maturity}</td>
                      <td className="py-2 pr-3">
                        {formatPercent(rate?.latest.value ?? null)}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {rate?.latest.status === "stale"
                            ? `Stale · ${formatObservationDate(rate.latest.date)}`
                            : rate?.latest.status === "unavailable"
                              ? "Unavailable"
                              : formatObservationDate(rate?.latest.date ?? null)}
                        </span>
                      </td>
                      {horizons.map(({ key, label }) => {
                        const change = rate?.changes[key];
                        return (
                          <td
                            className="py-2 pr-3"
                            key={label}
                            title={`Comparison observation: ${change?.comparisonDate ?? "unavailable"}`}
                          >
                            {formatBasisPoints(change?.changeBasisPoints ?? null)}{" "}
                            {change?.arrow ?? ""}
                            {change?.comparisonDate ? (
                              <span className="block text-xs text-muted-foreground">
                                vs {change.comparisonDate}
                              </span>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            NOW includes the latest FRED observation date. Prior snapshots use available dated observations; no holiday interpolation is applied.
          </p>

          <h3 className="mb-3 mt-6 text-sm font-semibold">YIELD CURVE</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Spread</th>
                  <th className="py-2 pr-3 font-medium">Current</th>
                  <th className="py-2 pr-3 font-medium">1D change</th>
                  <th className="py-2 pr-3 font-medium">1W change</th>
                  <th className="py-2 pr-3 font-medium">1M change</th>
                </tr>
              </thead>
              <tbody>
                {([
                  ["2Y-10Y", "2Y–10Y"],
                  ["2Y-30Y", "2Y–30Y"],
                  ["5Y-30Y", "5Y–30Y"],
                ] as const).map(([key, label]) => {
                  const curve = economy?.usRatesYieldCurve.yieldCurve[key];
                  return (
                    <tr className="border-b last:border-0" key={key}>
                      <td className="py-2 pr-3 font-medium">{label}</td>
                      <td className="py-2 pr-3">
                        {formatBasisPoints(curve?.currentSpreadBasisPoints ?? null)}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {formatObservationDate(curve?.currentDate ?? null)}
                        </span>
                      </td>
                      {(["oneDay", "oneWeek", "oneMonth"] as const).map((horizon) => {
                        const change = curve?.changes[horizon];
                        return (
                          <td className="py-2 pr-3" key={horizon}>
                            {formatBasisPoints(change?.changeBasisPoints ?? null)}{" "}
                            {change?.direction ?? ""}
                            {change?.comparisonDate ? (
                              <span className="block text-xs text-muted-foreground">
                                vs {change.comparisonDate}
                              </span>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-5 grid gap-3 border-t pt-4 text-sm md:grid-cols-2">
            <p>
              <span className="font-medium">Front-end: </span>
              {economy?.usRatesYieldCurve.summary.frontEndVsLongEnd ?? "Unavailable"}
              {economy?.usRatesYieldCurve.summary.frontEndChangeBasisPoints != null
                ? ` (${formatBasisPoints(economy.usRatesYieldCurve.summary.frontEndChangeBasisPoints)})`
                : ""}
            </p>
            <p>
              <span className="font-medium">Long-end: </span>
              {economy?.usRatesYieldCurve.summary.longEndChangeBasisPoints == null
                ? "Unavailable"
                : `${formatBasisPoints(economy.usRatesYieldCurve.summary.longEndChangeBasisPoints)} average 10Y/30Y move`}
              {economy?.usRatesYieldCurve.summary.tenYearChangeBasisPoints != null &&
              economy.usRatesYieldCurve.summary.thirtyYearChangeBasisPoints != null
                ? ` (10Y ${formatBasisPoints(economy.usRatesYieldCurve.summary.tenYearChangeBasisPoints)}, 30Y ${formatBasisPoints(economy.usRatesYieldCurve.summary.thirtyYearChangeBasisPoints)})`
                : ""}
              {economy?.usRatesYieldCurve.summary.longEndDominates == null
                ? " · Relative move unavailable"
                : economy?.usRatesYieldCurve.summary.longEndDominates
                  ? " · Larger than 2Y move"
                  : " · Not larger than 2Y move"}
            </p>
            <p>
              <span className="font-medium">Curve: </span>
              {economy?.usRatesYieldCurve.summary.curveDirection ?? "UNAVAILABLE"}
            </p>
            <p>
              <span className="font-medium">Largest move (1D): </span>
              {economy?.usRatesYieldCurve.summary.largestMove.maturity
                ? `${economy.usRatesYieldCurve.summary.largestMove.maturity} ${formatBasisPoints(economy.usRatesYieldCurve.summary.largestMove.changeBasisPoints)}`
                : "Unavailable"}
            </p>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Historical direction calibration uses each maturity&apos;s prior FRED moves; curve steepening/flattening is descriptive and has no bullish or bearish interpretation.
          </p>
        </article>
      </section>

      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">EURO AREA INFLATION</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Eurostat HICP data, assessed against the ECB’s 2% medium-term symmetric target.
            This EUR inflation engine is independent of USD macro calculations.
          </p>
        </div>
        <article className="rounded-xl border p-5">
          {euroAreaInflation ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Current Inflation State
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {euroAreaInflation.current.overall}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Headline: {euroAreaInflation.current.headline} · Core:{" "}
                    {euroAreaInflation.current.core}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Latest YoY
                  </p>
                  <p className="mt-1 text-sm">
                    Headline: {formatPercent(euroAreaInflation.headline.latest.yoy.value)}
                  </p>
                  <p className="text-sm">
                    Core: {formatPercent(euroAreaInflation.core.latest.yoy.value)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Inflation Momentum
                  </p>
                  <p className="mt-1 text-sm">
                    Overall: {euroAreaInflation.momentum.overall}
                  </p>
                  <p className="text-sm">
                    Short term: {euroAreaInflation.momentum.shortTerm}
                  </p>
                  <p className="text-sm">
                    Medium term: {euroAreaInflation.momentum.mediumTerm}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Latest Price Pace
                  </p>
                  <p className="mt-1 text-sm">
                    Headline MoM: {formatPercent(euroAreaInflation.headline.latest.mom.value)}
                  </p>
                  <p className="text-sm">
                    Core MoM: {formatPercent(euroAreaInflation.core.latest.mom.value)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Latest observations: Headline{" "}
                    {euroAreaInflation.headline.latestObservationDate ?? "Unavailable"} · Core{" "}
                    {euroAreaInflation.core.latestObservationDate ?? "Unavailable"}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {euroAreaInflation.current.explanation}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Target reference:{" "}
                <a
                  className="underline"
                  href="https://www.ecb.europa.eu/mopo/strategy/html/index.en.html"
                  rel="noreferrer"
                  target="_blank"
                >
                  ECB monetary policy strategy
                </a>
              </p>
              {euroAreaInflation.headline.freshness === "stale" ||
              euroAreaInflation.core.freshness === "stale" ? (
                <p className="mt-2 text-sm font-semibold text-amber-700">
                  STALE DATA — one or more Eurostat HICP series are older than expected.
                </p>
              ) : null}
              {euroAreaInflation.explanations.map((explanation) => (
                <p className="mt-1 text-xs text-amber-700" key={explanation}>
                  {explanation}
                </p>
              ))}
              <div className="mt-5 grid gap-5 border-t pt-4 xl:grid-cols-2">
                {([
                  ["Headline HICP", euroAreaInflation.headline],
                  ["Core HICP", euroAreaInflation.core],
                ] as const).map(([label, series]) => (
                  <div className="min-w-0" key={series.seriesId}>
                    <h3 className="text-sm font-semibold">{label}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Eurostat {series.dataset} · {series.seriesId} · {series.geo} ·{" "}
                      {series.unit} · observed {series.latestObservationDate ?? "unavailable"} ·{" "}
                      {series.internalObservationCount} monthly observations
                    </p>
                    {series.freshness === "stale" ? (
                      <p className="mt-1 text-xs font-semibold text-amber-700">STALE DATA</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Short-term: {series.momentum.shortTerm} · Medium-term:{" "}
                      {series.momentum.mediumTerm} · 3M annualized:{" "}
                      {formatPercent(series.latest.annualized3m.value)}
                    </p>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[500px] border-collapse text-xs">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="py-2 pr-2">Month</th>
                            <th className="py-2 pr-2">Index (2025=100)</th>
                            <th className="py-2 pr-2">YoY</th>
                            <th className="py-2 pr-2">MoM</th>
                            <th className="py-2 pr-2">3M annualized</th>
                          </tr>
                        </thead>
                        <tbody>
                          {series.latestSixMonths.map((month) => (
                            <tr className="border-b last:border-0" key={month.date}>
                              <td className="py-2 pr-2 font-medium">{month.date}</td>
                              <td className="py-2 pr-2">{formatNumber(month.index)}</td>
                              <td className="py-2 pr-2">{formatPercent(month.yoy)}</td>
                              <td className="py-2 pr-2">{formatPercent(month.mom)}</td>
                              <td className="py-2 pr-2">{formatPercent(month.annualized3m)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Eurostat data last updated: {series.lastUpdated ?? "unavailable"} ·{" "}
                      <a
                        className="underline"
                        href={series.sourceUrl ?? undefined}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Official series query
                      </a>
                    </p>
                  </div>
                ))}
              </div>
              <details className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium">
                  Momentum methodology
                </summary>
                <p className="mt-2">{euroAreaInflation.momentum.method}</p>
                <p className="mt-2">{euroAreaInflation.source.freshnessMethod}</p>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {euroInflationError ?? "Loading Euro Area inflation data…"}
            </p>
          )}
        </article>
      </section>

      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Growth</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Economic activity, spending, production, and business surveys.
          </p>
        </div>
        {economyError ? (
          <p className="mb-4 rounded-lg border p-3 text-sm text-muted-foreground">
            Macro data could not be loaded: {economyError}
          </p>
        ) : null}
        {economy ? (
          <article className="mb-4 rounded-xl border p-5">
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Current Growth State
                </p>
                <p className="mt-2 text-xl font-semibold">
                  GROWTH: {economy.growthAssessment.state}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {economy.growthAssessment.explanations.state}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Growth Momentum
                </p>
                <p className="mt-2 text-xl font-semibold">
                  Momentum: {economy.growthAssessment.momentum}{" "}
                  {economy.growthAssessment.momentumArrow}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {economy.growthAssessment.explanations.momentum}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Forward Growth
                </p>
                <p className="mt-2 text-xl font-semibold">
                  Forward Growth: {economy.growthAssessment.forwardGrowth}{" "}
                  {economy.growthAssessment.forwardArrow}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {economy.growthAssessment.explanations.forwardGrowth}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
              <p>
                <span className="font-medium">Overall positive drivers: </span>
                {economy.growthAssessment.positiveDrivers.join(", ") ||
                  "No clear positive contributors"}
              </p>
              <p>
                <span className="font-medium">Overall negative drivers: </span>
                {economy.growthAssessment.negativeDrivers.join(", ") ||
                  "No clear negative contributors"}
              </p>
            </div>
          </article>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DataCard title="Economic Growth (Real GDP)">
            <div className="grid grid-cols-2 gap-4">
              <ValueCell
                label="Current QoQ annualized"
                value={formatPercent(economy?.growth.gdp.latest.qoqAnnualized ?? null)}
                detail={formatDate(economy?.growth.gdp.latest.date ?? null)}
              />
              <ValueCell
                label="Previous quarter QoQ annualized"
                value={formatPercent(economy?.growth.gdp.recentHistory[1]?.qoqAnnualized ?? null)}
                detail={formatDate(economy?.growth.gdp.previousQuarter.date ?? null)}
              />
              <ValueCell
                label="YoY"
                value={formatPercent(economy?.growth.gdp.latest.yoy ?? null)}
              />
              <Direction
                direction={movement(
                  economy?.growth.gdp.latest.qoqAnnualized ?? null,
                  economy?.growth.gdp.recentHistory[1]?.qoqAnnualized ?? null,
                )}
                meaning={{
                  up: "Growth accelerating",
                  down: "Growth slowing",
                  stable: "Growth steady",
                }}
              />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {economy?.growth.gdp.latest.qoqAnnualized == null
                ? "Real GDP growth is not available."
                : economy.growth.gdp.latest.qoqAnnualized > 0
                  ? "The economy is expanding."
                  : economy.growth.gdp.latest.qoqAnnualized < 0
                    ? "The economy is contracting."
                    : "Economic output is unchanged quarter over quarter."}
            </p>
          </DataCard>

          <DataCard title="Consumer Spending (Real PCE)">
            <div className="grid grid-cols-2 gap-4">
              <ValueCell
                label="Latest monthly change"
                value={formatPercent(economy?.growth.realPce.latest.mom ?? null)}
              />
              <div className="space-y-2">
                <Direction
                  direction={economy?.growth.realPce.direction3m ?? null}
                  meaning={{
                    up: "3M spending rising",
                    down: "3M spending falling",
                    flat: "3M spending stable",
                  }}
                />
                <Direction
                  direction={economy?.growth.realPce.direction6m ?? null}
                  meaning={{
                    up: "6M spending rising",
                    down: "6M spending falling",
                    flat: "6M spending stable",
                  }}
                />
              </div>
            </div>
          </DataCard>

          <DataCard title="Industrial Production">
            <div className="grid grid-cols-2 gap-4">
              <ValueCell
                label="Latest MoM"
                value={formatPercent(economy?.growth.industrialProduction.latest.mom ?? null)}
              />
              <ValueCell
                label="YoY"
                value={formatPercent(economy?.growth.industrialProduction.latest.yoy ?? null)}
              />
              <Direction
                direction={economy?.growth.industrialProduction.direction3m ?? null}
                meaning={{
                  up: "3M production rising",
                  down: "3M production falling",
                  flat: "3M production stable",
                }}
              />
              <Direction
                direction={economy?.growth.industrialProduction.direction6m ?? null}
                meaning={{
                  up: "6M production rising",
                  down: "6M production falling",
                  flat: "6M production stable",
                }}
              />
            </div>
          </DataCard>

          <DataCard title="Retail Sales">
            <div className="grid grid-cols-2 gap-4">
              <ValueCell
                label="Latest MoM"
                value={formatPercent(economy?.growth.retailSales.latest.mom ?? null)}
              />
              <ValueCell
                label="YoY"
                value={formatPercent(economy?.growth.retailSales.latest.yoy ?? null)}
              />
              <Direction
                direction={economy?.growth.retailSales.direction3m ?? null}
                meaning={{
                  up: "3M sales rising",
                  down: "3M sales falling",
                  flat: "3M sales stable",
                }}
              />
              <Direction
                direction={economy?.growth.retailSales.direction6m ?? null}
                meaning={{
                  up: "6M sales rising",
                  down: "6M sales falling",
                  flat: "6M sales stable",
                }}
              />
            </div>
          </DataCard>

          <DataCard title="Manufacturing PMI">
            <IsmMetric
              current={economy?.growth.ismManufacturing?.components.manufacturingPmi.value ?? null}
              previous={
                economy?.growth.ismManufacturing?.components.manufacturingPmi.previousValue ?? null
              }
            />
          </DataCard>

          <DataCard title="Manufacturing New Orders">
            <IsmMetric
              current={economy?.growth.ismManufacturing?.components.newOrders.value ?? null}
              previous={
                economy?.growth.ismManufacturing?.components.newOrders.previousValue ?? null
              }
            />
          </DataCard>

          <DataCard title="Services PMI">
            <IsmMetric
              current={economy?.growth.ismServices?.components.servicesPmi.value ?? null}
              previous={economy?.growth.ismServices?.components.servicesPmi.previousValue ?? null}
            />
          </DataCard>

          <DataCard title="Services Business Activity">
            <IsmMetric
              current={economy?.growth.ismServices?.components.businessActivity.value ?? null}
              previous={
                economy?.growth.ismServices?.components.businessActivity.previousValue ?? null
              }
            />
          </DataCard>

          <DataCard title="Services New Orders">
            <IsmMetric
              current={economy?.growth.ismServices?.components.newOrders.value ?? null}
              previous={economy?.growth.ismServices?.components.newOrders.previousValue ?? null}
            />
          </DataCard>
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Inflation</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Current price levels, inflation momentum, and survey-based forward price pressure.
          </p>
        </div>
        {economy ? (
          <>
            <article className="mb-4 rounded-xl border p-5">
              <div className="grid gap-5 md:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Current Inflation State
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {economy.inflationAssessment.current.overall}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Core: {economy.inflationAssessment.current.core} · Headline:{" "}
                    {economy.inflationAssessment.current.headline}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {economy.inflationAssessment.current.explanation}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Inflation Momentum
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    Core: {economy.inflationAssessment.momentum.core}{" "}
                    {economy.inflationAssessment.momentum.coreArrow}
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    Headline: {economy.inflationAssessment.momentum.headline}{" "}
                    {economy.inflationAssessment.momentum.headlineArrow}
                  </p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Short term — Core: {economy.inflationAssessment.momentum.shortTerm.core}{" "}
                    {economy.inflationAssessment.momentum.shortTerm.coreArrow}; Headline:{" "}
                    {economy.inflationAssessment.momentum.shortTerm.headline}{" "}
                    {economy.inflationAssessment.momentum.shortTerm.headlineArrow}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Medium term — Core: {economy.inflationAssessment.momentum.mediumTerm.core}{" "}
                    {economy.inflationAssessment.momentum.mediumTerm.coreArrow}; Headline:{" "}
                    {economy.inflationAssessment.momentum.mediumTerm.headline}{" "}
                    {economy.inflationAssessment.momentum.mediumTerm.headlineArrow}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {economy.inflationAssessment.momentum.explanation}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {economy.inflationAssessment.momentum.shortMediumDivergence}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Forward Price Pressure
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {economy.inflationAssessment.forwardPricePressure.state}{" "}
                    {economy.inflationAssessment.forwardPricePressure.arrow}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {economy.inflationAssessment.forwardPricePressure.explanation}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
                <p>
                  <span className="font-medium">Strongest inflationary driver: </span>
                  {economy.inflationAssessment.strongestInflationaryDriver ?? "No clear contributor"}
                </p>
                <p>
                  <span className="font-medium">Strongest disinflationary driver: </span>
                  {economy.inflationAssessment.strongestDisinflationaryDriver ?? "No clear contributor"}
                </p>
                <p className="sm:col-span-2">
                  <span className="font-medium">Core / headline divergence: </span>
                  {economy.inflationAssessment.momentum.divergence}
                </p>
                <p className="text-muted-foreground sm:col-span-2">
                  {economy.inflationAssessment.explanation}
                </p>
              </div>
            </article>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {([
                ["Headline CPI", economy.inflation.headline.cpi],
                ["Headline PCE", economy.inflation.headline.pce],
                ["Core CPI", economy.inflation.core.coreCpi],
                ["Core PCE", economy.inflation.core.corePce],
              ] as const).map(([label, detail]) => (
                <DataCard key={label} title={label}>
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground">Current YoY</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {formatPercent(detail.yoy.current.value)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(detail.yoy.current.date)}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="min-w-[420px]">
                      <div className="grid grid-cols-[2.5rem_repeat(6,minmax(0,1fr))] gap-2 border-b pb-2 text-center text-xs text-muted-foreground">
                        <span>Month</span>
                        {detail.monthlyHistory.map((month) => (
                          <span key={month.date}>{formatMonth(month.date)}</span>
                        ))}
                      </div>
                      <div className="grid grid-cols-[2.5rem_repeat(6,minmax(0,1fr))] gap-2 border-b py-2 text-center text-xs">
                        <span className="text-left text-muted-foreground">YoY</span>
                        {detail.monthlyHistory.map((month) => (
                          <span key={month.date}>
                            {formatPercent(month.yoy)}
                          </span>
                        ))}
                      </div>
                      <div className="grid grid-cols-[2.5rem_repeat(6,minmax(0,1fr))] gap-2 py-2 text-center text-xs">
                        <span className="text-left text-muted-foreground">MoM</span>
                        {detail.monthlyHistory.map((month) => (
                          <span key={month.date}>
                            {formatPercent(month.mom)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <ValueCell label="1 month ago YoY" value={formatPercent(detail.yoy.oneMonthAgo.value)} />
                    <ValueCell label="3 months ago YoY" value={formatPercent(detail.yoy.threeMonthsAgo.value)} />
                    <ValueCell label="6 months ago YoY" value={formatPercent(detail.yoy.sixMonthsAgo.value)} />
                    <ValueCell label="Latest MoM" value={formatPercent(detail.mom.latest.value)} />
                    <ValueCell label="3-month annualized" value={formatPercent(detail.annualized3m.value)} />
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Recent YoY trend: {detail.trend}
                  </p>
                </DataCard>
              ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Labour Market</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Employment, wages, layoffs, and job openings.
          </p>
        </div>
        {economy ? (
          <article className="mb-4 rounded-xl border p-5">
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Current Labour State
                </p>
                <p className="mt-2 text-xl font-semibold">
                  LABOUR: {economy.labourAssessment.state}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {economy.labourAssessment.explanations.state}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Labour Momentum
                </p>
                <p className="mt-2 text-xl font-semibold">
                  Momentum: {economy.labourAssessment.momentum}{" "}
                  {economy.labourAssessment.momentumArrow}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {economy.labourAssessment.explanations.momentum}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Wage Pressure
                </p>
                <p className="mt-2 text-xl font-semibold">
                  Wage Pressure: {economy.labourAssessment.wagePressure}{" "}
                  {economy.labourAssessment.wagePressureArrow}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {economy.labourAssessment.explanations.wagePressure}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
              <p>
                <span className="font-medium">Strongest positive driver: </span>
                {economy.labourAssessment.strongestPositiveDriver ?? "—"}
              </p>
              <p>
                <span className="font-medium">Strongest negative driver: </span>
                {economy.labourAssessment.strongestNegativeDriver ?? "—"}
              </p>
              <p>
                <span className="font-medium">Overall positive drivers: </span>
                {economy.labourAssessment.positiveDrivers.join(", ") || "—"}
              </p>
              <p>
                <span className="font-medium">Overall negative drivers: </span>
                {economy.labourAssessment.negativeDrivers.join(", ") || "—"}
              </p>
            </div>
          </article>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DataCard title="Unemployment Rate">
            <div className="grid grid-cols-2 gap-4">
              <ValueCell
                label="Current"
                value={formatPercent(economy?.labour.unemploymentRate.latest.value ?? null)}
                detail={formatDate(economy?.labour.unemploymentRate.latest.date ?? null)}
              />
              <ValueCell
                label="Previous month"
                value={formatPercent(economy?.labour.unemploymentRate.previousMonth.value ?? null)}
                detail={formatDate(economy?.labour.unemploymentRate.previousMonth.date ?? null)}
              />
            </div>
            <div className="mt-4">
              <Direction
                direction={movement(
                  economy?.labour.unemploymentRate.latest.value ?? null,
                  economy?.labour.unemploymentRate.previousMonth.value ?? null,
                )}
                meaning={{
                  up: "Labour weakening",
                  down: "Labour strengthening",
                  stable: "Unemployment steady",
                }}
              />
            </div>
          </DataCard>

          <DataCard title="Jobs Added (NFP)">
            <div className="grid grid-cols-2 gap-4">
              <ValueCell
                label="Latest monthly jobs added"
                value={formatSignedThousands(
                  economy?.labour.nonfarmPayrollEmployment.latestMonthlyChange.value ?? null,
                )}
                detail={formatDate(
                  economy?.labour.nonfarmPayrollEmployment.latestMonthlyChange.date ?? null,
                )}
              />
              <ValueCell
                label="Previous month"
                value={formatSignedThousands(
                  economy?.labour.nonfarmPayrollEmployment.previousMonthlyChange.value ?? null,
                )}
                detail={formatDate(
                  economy?.labour.nonfarmPayrollEmployment.previousMonthlyChange.date ?? null,
                )}
              />
              <ValueCell
                label="3-month average"
                value={formatSignedThousands(
                  economy?.labour.nonfarmPayrollEmployment.averageMonthlyChange3m.value ?? null,
                )}
              />
              <ValueCell
                label="6-month average"
                value={formatSignedThousands(
                  economy?.labour.nonfarmPayrollEmployment.averageMonthlyChange6m.value ?? null,
                )}
              />
            </div>
            <div className="mt-4 space-y-2">
              <Direction
                direction={movement(
                  economy?.labour.nonfarmPayrollEmployment.latestMonthlyChange.value ?? null,
                  economy?.labour.nonfarmPayrollEmployment.previousMonthlyChange.value ?? null,
                )}
                meaning={{
                  up: "Hiring strengthening",
                  down: "Hiring slowing",
                  stable: "Hiring steady",
                }}
              />
              <p className="text-sm text-muted-foreground">
                {economy?.labour.nonfarmPayrollEmployment.latestMonthlyChange.value == null
                  ? "Payroll change is not available."
                  : movement(
                        economy.labour.nonfarmPayrollEmployment.latestMonthlyChange.value,
                        economy.labour.nonfarmPayrollEmployment.previousMonthlyChange.value,
                      ) === "down"
                    ? "Hiring is slowing."
                    : "Hiring is holding up."}
              </p>
            </div>
          </DataCard>

          <DataCard title="Wage Growth">
            <div className="grid grid-cols-2 gap-4">
              <ValueCell
                label="YoY"
                value={formatPercent(economy?.labour.averageHourlyEarnings.latestYoY.value ?? null)}
              />
              <ValueCell
                label="MoM"
                value={formatPercent(economy?.labour.averageHourlyEarnings.latestMoM.value ?? null)}
              />
              <ValueCell
                label="3-month annualized"
                value={formatPercent(
                  economy?.labour.averageHourlyEarnings.annualized3m.value ?? null,
                )}
              />
              <div>
                <Direction
                  direction={movement(
                    economy?.labour.averageHourlyEarnings.latestMoM.value ?? null,
                    economy?.labour.averageHourlyEarnings.previousMoM.value ?? null,
                  )}
                  meaning={{
                    up: "Wage pressure rising",
                    down: "Wage pressure easing",
                    stable: "Wage pressure steady",
                  }}
                />
              </div>
            </div>
          </DataCard>

          <DataCard title="Weekly Jobless Claims">
            <div className="grid grid-cols-2 gap-4">
              <ValueCell
                label="Latest"
                value={formatClaims(economy?.labour.initialJoblessClaims.latest.value ?? null)}
                detail={formatDate(economy?.labour.initialJoblessClaims.latest.date ?? null)}
              />
              <ValueCell
                label="Previous week"
                value={formatClaims(
                  economy?.labour.initialJoblessClaims.previousWeek.value ?? null,
                )}
              />
              <ValueCell
                label="4-week average"
                value={formatClaims(
                  economy?.labour.initialJoblessClaims.average4Week.value ?? null,
                )}
              />
              <Direction
                direction={movement(
                  economy?.labour.initialJoblessClaims.latest.value ?? null,
                  economy?.labour.initialJoblessClaims.previousWeek.value ?? null,
                )}
                meaning={{
                  up: "Labour weakening",
                  down: "Labour strengthening",
                  stable: "Claims steady",
                }}
              />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {economy?.labour.initialJoblessClaims.latest.value == null
                ? "Claims data is not available."
                : movement(
                      economy.labour.initialJoblessClaims.latest.value,
                      economy.labour.initialJoblessClaims.previousWeek.value,
                    ) === "up"
                  ? "Layoff claims are rising."
                  : movement(
                        economy.labour.initialJoblessClaims.latest.value,
                        economy.labour.initialJoblessClaims.previousWeek.value,
                      ) === "down"
                    ? "Layoff claims are easing."
                    : "Layoff claims are steady."}
            </p>
          </DataCard>

          <DataCard title="Job Openings (JOLTS)">
            <div className="grid grid-cols-2 gap-4">
              <ValueCell
                label="Latest"
                value={formatMillionsFromThousands(
                  economy?.labour.joltsJobOpenings.latest.value ?? null,
                )}
                detail={formatDate(economy?.labour.joltsJobOpenings.latest.date ?? null)}
              />
              <ValueCell
                label="Previous month"
                value={formatMillionsFromThousands(
                  economy?.labour.joltsJobOpenings.previousMonth.value ?? null,
                )}
              />
              <ValueCell
                label="3 months ago"
                value={formatMillionsFromThousands(
                  economy?.labour.joltsJobOpenings.threeMonthsAgo.value ?? null,
                )}
              />
              <ValueCell
                label="6 months ago"
                value={formatMillionsFromThousands(
                  economy?.labour.joltsJobOpenings.sixMonthsAgo.value ?? null,
                )}
              />
            </div>
            <div className="mt-4">
              <Direction
                direction={movement(
                  economy?.labour.joltsJobOpenings.latest.value ?? null,
                  economy?.labour.joltsJobOpenings.previousMonth.value ?? null,
                )}
                meaning={{
                  up: "Labour strengthening",
                  down: "Labour weakening",
                  stable: "Openings steady",
                }}
              />
            </div>
          </DataCard>
        </div>
      </section>

      {/* MARKET REGIME */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Market Regime</h2>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card title="Global Risk" value="Neutral" description="Risk-on / risk-off environment" />

          <Card title="USD Macro Bias" value="Neutral" description="Score: 0" />

          <Card title="Fed Bias" value="Neutral" description="Rate expectations" />

          <Card title="DXY" value="—" description="Waiting for market data" />
        </div>
      </section>

      {/* US RATES */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">US Rates & Treasury</h2>

        <div className="grid gap-4 md:grid-cols-3">
          <Card title="US 2Y Yield" value="—" description="Fed policy expectations" />

          <Card title="US 10Y Yield" value="—" description="Growth, inflation & term premium" />

          <Card
            title="US 30Y Yield"
            value="—"
            description="Long-term fiscal & inflation expectations"
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card
            title="Next Treasury Auction"
            value="—"
            description="Waiting for Treasury calendar"
          />

          <Card
            title="Next Treasury Buyback"
            value="—"
            description="Waiting for Treasury buyback schedule"
          />
        </div>
      </section>

      {/* TREASURY SIGNAL */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Treasury Demand Signal</h2>

        <div className="rounded-xl border p-5">
          <div className="grid gap-6 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Bid-to-Cover</p>
              <p className="mt-2 text-xl font-semibold">—</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Tail / Stop-Through</p>
              <p className="mt-2 text-xl font-semibold">—</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Indirect Bidders</p>
              <p className="mt-2 text-xl font-semibold">—</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Demand</p>
              <p className="mt-2 text-xl font-semibold">Waiting</p>
            </div>
          </div>
        </div>
      </section>

      {/* CURRENCY BIAS */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Currency Macro Bias</h2>

        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-3 border-b p-4 text-sm text-muted-foreground">
            <span>Currency</span>
            <span>Bias</span>
            <span>Score</span>
          </div>

          {currencies.map((item) => (
            <div key={item.currency} className="grid grid-cols-3 border-b p-4 last:border-b-0">
              <span className="font-semibold">{item.currency}</span>
              <span>{item.bias}</span>
              <span>{item.score}</span>
            </div>
          ))}
        </div>
      </section>

      {/* WEEKLY FORECAST */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Weekly Forecast</h2>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-5">
            <p className="font-semibold">Macro Thesis</p>

            <p className="mt-3 text-sm text-muted-foreground">
              Waiting for macro data and weekly analysis.
            </p>
          </div>

          <div className="rounded-xl border p-5">
            <p className="font-semibold">What Changes the Bias?</p>

            <p className="mt-3 text-sm text-muted-foreground">
              Define the conditions that invalidate the current macro thesis.
            </p>
          </div>
        </div>
      </section>

      {/* CATALYSTS */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Upcoming Catalysts</h2>

        <div className="rounded-xl border p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {catalysts.map((catalyst) => (
              <div key={catalyst} className="rounded-lg border p-4 text-sm">
                {catalyst}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
