"use client";
import { useEffect, useState } from "react";
import {
  countries,
  type Country,
  type CountryData,
  type Observation,
} from "@/lib/international-macro";
import { macroDateLabel } from "@/lib/macro-date-label";
import { MacroRegionNav } from "./MacroRegionNav";
import { MacroHistoryChart } from "./MacroHistoryChart";
import { QuarterlyGrowthHistory } from "./QuarterlyGrowthHistory";
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2)}%`);
function Metric({
  title,
  rows,
  source,
  explanation,
}: {
  title: string;
  rows: Observation[];
  source: string;
  explanation: string;
}) {
  const last = rows.at(-1),
    previous = rows.at(-2),
    delta = last && previous ? last.value - previous.value : null;
  return (
    <section className="rounded-xl border p-5 min-w-0">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-3 text-3xl font-bold">{pct(last?.value)}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {last
          ? macroDateLabel(last.date, /^\d{4}-\d{2}-\d{2}$/.test(last.date))
          : "Data unavailable"}
        {delta !== null
          ? ` · ${delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} ${Math.abs(delta).toFixed(2)} percentage points vs previous observation`
          : ""}
      </p>
      <MacroHistoryChart
        title={title}
        rows={rows}
        series={[{ key: "value", label: title }]}
        unit="%"
      />
      <p className="text-sm text-muted-foreground">{explanation}</p>
      <a
        href={source}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block text-xs underline text-muted-foreground"
      >
        Data source ↗
      </a>
    </section>
  );
}
export function InternationalMacroDashboard({ country }: { country: Country }) {
  const c = countries[country],
    [data, setData] = useState<CountryData | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(false);
    fetch(`/api/macro/country/${country}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [country]);
  const last = data?.inflation.at(-1);
  return (
    <main className="mx-auto w-full max-w-7xl p-4 md:p-8">
      <MacroRegionNav region={country} />
      <header className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/5 p-5">
        <h1 className="text-3xl font-bold">
          {c.flag} {c.name} · {country.toUpperCase()} MACRO
        </h1>
        <p className="mt-2 text-muted-foreground">
          Growth, inflation, labour and monetary policy · ◆ marks the latest published observation.
        </p>
      </header>
      {!data && (
        <p role="status">
          {error ? "Unable to load data. Please refresh to retry." : "Loading official macro data…"}
        </p>
      )}
      {data && (
        <>
          <div className="mb-5 text-xs text-muted-foreground">
            Updated {macroDateLabel(data.fetchedAt.slice(0, 10), true)} · Dates on each chart are
            observation periods, not release dates. Sources update at different times.
          </div>
          {data.errors.length > 0 && (
            <p role="status" className="mb-5 rounded-lg border border-amber-500/40 p-3">
              {data.errors.join(" · ")}
            </p>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <Metric
              title={`${c.bank} · policy rate`}
              rows={data.policy}
              source="https://data.bis.org/topics/CBPOL"
              explanation={`Higher expected ${country.toUpperCase()} interest rates relative to other countries can support the currency. Rate cuts can weigh on it. Compare the expected path with the Fed: the current rate alone is not a trading signal.`}
            />
            <section className="rounded-xl border p-5 min-w-0">
              <h2 className="text-xl font-semibold">Real GDP · quarterly growth</h2>
              <QuarterlyGrowthHistory observations={data.gdp} label={`${c.name} real GDP`} />
              <p className="mt-3 text-sm text-muted-foreground">
                Stronger growth can support the currency if it reduces expected rate cuts. A growth
                surprise matters more than the level alone. Seasonally adjusted real GDP; QoQ is not
                annualized.
              </p>
              {data.gdpSource && (
                <a
                  className="mt-3 inline-block text-xs underline text-muted-foreground"
                  href={data.gdpSource}
                  target="_blank"
                  rel="noreferrer"
                >
                  GDP source ↗
                </a>
              )}
            </section>
            <section className="rounded-xl border p-5 min-w-0">
              <h2 className="text-xl font-semibold">Headline CPI inflation · YoY</h2>
              <p className="mt-3 text-3xl font-bold">{pct(last?.yoy)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {last ? macroDateLabel(last.date) : "Data unavailable"} ·{" "}
                {c.quarterlyCpi ? "Quarterly" : "Monthly"} CPI · latest{" "}
                {c.quarterlyCpi ? "QoQ" : "MoM"}: {pct(last?.change)}
              </p>
              <MacroHistoryChart
                title="Headline inflation"
                rows={data.inflation}
                series={[
                  { key: "yoy", label: "YoY inflation" },
                  {
                    key: "change",
                    label: c.quarterlyCpi ? "QoQ price change" : "MoM price change",
                  },
                ]}
                unit="%"
              />
              <p className="text-sm text-muted-foreground">
                Sticky inflation can support the currency through higher rate expectations; cooling
                inflation can increase expectations of cuts. Weak growth can change that
                interpretation.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                BIS long CPI series, not seasonally adjusted.{" "}
                {c.quarterlyCpi
                  ? "Only quarter-end observations are shown; interpolated months are excluded. "
                  : ""}
                Rounding may differ from the national headline.{" "}
                <a
                  href="https://data.bis.org/topics/CPI"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  CPI source ↗
                </a>
              </p>
            </section>
            <Metric
              title="Unemployment rate · OECD harmonized"
              rows={data.labour}
              source={`https://fred.stlouisfed.org/series/${c.labour}`}
              explanation={`Seasonally adjusted · ${c.quarterlyLabour ? "quarterly" : "monthly"}. Rising unemployment can increase rate-cut expectations and pressure ${country.toUpperCase()}; falling unemployment can support it. OECD harmonized rates and reporting lags may differ from national headlines.`}
            />
          </div>
          <aside className="mt-6 rounded-xl border p-5">
            <h2 className="text-lg font-semibold">How to read the currency impact</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              ↑ / ↓ describes the change in the indicator, not an automatic buy or sell signal.
              Currency moves depend on surprises versus expectations, relative rates and risk
              sentiment.{" "}
              {country === "jpy"
                ? "JPY can also strengthen during risk aversion and carry-trade unwinding."
                : country === "aud"
                  ? "AUD is also sensitive to China, commodity demand and global risk appetite."
                  : country === "cad"
                    ? "CAD is also sensitive to oil prices and US growth."
                    : country === "nzd"
                      ? "NZD is also sensitive to dairy prices, China and global risk appetite."
                      : "GBP is also sensitive to fiscal policy and risk sentiment."}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Live FX prices, core inflation and a domestic 2Y / 10Y / 30Y yield curve are not
              connected on this page yet.
            </p>
          </aside>
        </>
      )}
    </main>
  );
}
