"use client";
import { useEffect, useState } from "react";
import {
  countries,
  employmentHistory,
  monthEndHistory,
  type Country,
  type CountryData,
  type Observation,
} from "@/lib/international-macro";
import { macroDateLabel } from "@/lib/macro-date-label";
import { MacroObservationTable } from "./MacroObservationTable";
import { MacroRegionNav } from "./MacroRegionNav";
import { InternationalYields } from "./InternationalYields";
import { CentralBankWatch } from "./CentralBankWatch";
import { MacroPageHeader } from "./MacroPageHeader";
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
      <MacroObservationTable
        rows={title.includes("policy rate") ? monthEndHistory(rows) : rows.slice(-12)}
        columns={[{ key: "value", label: "Rate" }]}
        daily={title.includes("policy rate")}
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
  const employment = employmentHistory(data?.employment ?? [], c.quarterlyEmployment);
  const latestEmployment = employment.at(-1);
  const employmentStale = country === "aud" && (!latestEmployment || Date.now() - Date.parse(latestEmployment.date.length === 7 ? latestEmployment.date + "-01T00:00:00Z" : latestEmployment.date + "T00:00:00Z") > 40 * 86400000);

  return (
    <main className="mx-auto w-full max-w-7xl p-4 md:p-8">
      <MacroRegionNav region={country} />
      <MacroPageHeader title={`${c.flag} ${c.name} · ${country.toUpperCase()} MACRO`} />
      <CentralBankWatch currency={country.toUpperCase() as "JPY" | "AUD" | "GBP" | "CAD" | "NZD"} policy={data?.policy.at(-1)?.value} />
      <InternationalYields country={country} />
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
              source={country === "aud" ? "https://www.rba.gov.au/statistics/tables/" : "https://data.bis.org/topics/CBPOL"}
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
              <MacroObservationTable
                rows={data.inflation}
                columns={[
                  { key: "yoy", label: "YoY inflation" },
                  {
                    key: "change",
                    label: c.quarterlyCpi ? "QoQ price change" : "MoM price change",
                  },
                ]}
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
            <section className="rounded-xl border p-5 min-w-0 lg:col-span-2">
              <h2 className="text-xl font-semibold">Jobs · employment change</h2>
              {country === "aud" && <div role="alert" className="mt-3 rounded-lg border border-amber-500 p-3 text-sm"><strong>Important: historical OECD/FRED series, not the latest ABS economic-calendar release.</strong> {employmentStale ? "This series may be behind the latest labour-market announcement. Do not use the number below as the latest AUD trading signal." : "Verify the latest ABS release before trading."} <a className="underline" href="https://www.abs.gov.au/statistics/labour/employment-and-unemployment/labour-force-australia" target="_blank" rel="noreferrer">Check the latest official ABS employment and unemployment figures ↗</a></div>}

              <p className="mt-3 text-3xl font-bold">
                {latestEmployment?.change == null
                  ? "—"
                  : `${latestEmployment.change > 0 ? "+" : ""}${latestEmployment.change.toLocaleString("en")} employed people`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {latestEmployment ? macroDateLabel(latestEmployment.date) : "Data unavailable"} ·
                change vs previous {c.quarterlyEmployment ? "quarter" : "month"} · total employment{" "}
                {latestEmployment?.value.toLocaleString("en") ?? "—"}
              </p>
              <MacroHistoryChart
                title="Employment change"
                rows={employment}
                series={[
                  { key: "change", label: c.quarterlyEmployment ? "QoQ change" : "MoM change" },
                ]}
                unit="persons"
              />
              <MacroObservationTable
                rows={employment}
                columns={[
                  { key: "value", label: "Employed people", number: true },
                  { key: "change", label: "Net change", number: true },
                  { key: "yoy", label: "YoY growth" },
                ]}
              />
              <p className="mt-3 text-sm text-muted-foreground">
                OECD labour-force survey employment, age 15+. Seasonally adjusted. A net increase
                means more people are employed; this is not the number of job vacancies and is not
                US nonfarm payrolls.
              </p>
              <a
                href={`https://fred.stlouisfed.org/series/${c.employment}`}
                className="mt-3 inline-block text-xs underline text-muted-foreground"
                target="_blank"
                rel="noreferrer"
              >
                Employment source ↗
              </a>
            </section>
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
              Policy rates, real GDP growth, headline inflation and unemployment are connected.
              Historical tables show the latest available observations; publication lags vary by
              source.
            </p>
          </aside>
        </>
      )}
    </main>
  );
}
