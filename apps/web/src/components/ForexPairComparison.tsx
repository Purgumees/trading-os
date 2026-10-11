"use client";
import { useEffect, useState } from "react";
import {
  FOREX_PAIRS,
  comparisonSeries,
  matchedDifference,
  type ForexPair,
  type PairData,
  type ComparisonSnapshot,
} from "@/lib/pair-macro";
import { macroDateLabel } from "@/lib/macro-date-label";
import { MacroHistoryChart } from "./MacroHistoryChart";
import { MacroObservationTable } from "./MacroObservationTable";
import { InternationalYields } from "./InternationalYields";
import { countries, type Country } from "@/lib/international-macro";
import { CentralBankWatch } from "./CentralBankWatch";
import { PairMacroConclusion } from "./PairMacroConclusion";
const categories = [
  {
    key: "policy",
    title: "Rates · current policy",
    note: "Current policy rates; this is not market pricing of the next decision. The Fed value is the target range upper bound. Other central banks use different operational rates.",
  },
  {
    key: "gdp",
    title: "GDP · real quarterly growth",
    note: "QoQ percentage change, seasonally adjusted and not annualized. Positive means expansion, negative means contraction.",
  },
  {
    key: "inflation",
    title: "Inflation · headline YoY",
    note: "US CPI is seasonally adjusted; other headline CPI and euro area HICP are not. CPI and HICP baskets differ. Australian and New Zealand CPI in this source is quarterly; monthly interpolation is excluded.",
  },
  {
    key: "jobs",
    title: "Jobs · unemployment rate",
    note: "Seasonally adjusted unemployment rates. A lower level alone does not prove a stronger currency; compare the change and the reporting period.",
  },
] as const;
const value = (v: number | undefined) => (v === undefined ? "—" : `${v.toFixed(2)}%`);
function Side({
  snapshot,
  metric,
}: {
  snapshot: ComparisonSnapshot;
  metric: (typeof categories)[number];
}) {
  const rows = comparisonSeries(snapshot)[metric.key],
    last = rows.at(-1),
    source =
      metric.key === "gdp"
        ? snapshot.gdpSource
        : metric.key === "jobs"
          ? snapshot.sources.labour
          : snapshot.sources[metric.key],
    label =
      metric.key === "policy"
        ? snapshot.policyLabel
        : metric.key === "inflation"
          ? snapshot.inflationLabel
          : metric.key === "jobs"
            ? snapshot.labourLabel
            : "Real GDP · QoQ";
  return (
    <div
      className="min-w-0 rounded-lg border p-3"
      aria-label={`${snapshot.currency} ${metric.key}`}
    >
      <h4 className="font-semibold">
        {snapshot.currency} · {snapshot.name}
      </h4>
      <p className="mt-2 text-2xl font-bold">{value(last?.value)}</p>
      <p className="text-xs text-muted-foreground">
        {last ? macroDateLabel(last.date, metric.key === "policy") : "Data unavailable"} · {label}
        {metric.key === "inflation" &&
        last &&
        snapshot.estimatedInflationPeriods?.includes(last.date)
          ? " · FLASH ESTIMATE"
          : ""}
      </p>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium">View chart and history</summary>
        <MacroHistoryChart
          rows={rows}
          title={`${snapshot.currency} ${metric.title}`}
          series={[{ key: "value", label }]}
          unit="%"
        />
        <MacroObservationTable
          rows={metric.key === "policy" ? rows.slice(-12) : rows}
          columns={[{ key: "value", label: "%" }]}
          daily={metric.key === "policy"}
        />
      </details>
      {source && (
        <a
          className="mt-3 inline-block text-xs underline text-muted-foreground"
          href={source}
          target="_blank"
          rel="noreferrer"
        >
          Source ↗
        </a>
      )}
    </div>
  );
}
export function ForexPairComparison({ initialPair = "EURUSD" }: { initialPair?: ForexPair }) {
  const [pair, setPair] = useState<ForexPair>(initialPair),
    [data, setData] = useState<PairData | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(false);
    fetch(`/api/macro/pair/${pair}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => {
        if (!controller.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [pair, retry]);
  return (
    <section aria-label="Forex pair comparison" className="mb-8 rounded-xl border p-5">
      <h2 className="text-sm font-semibold">SELECT FOREX PAIR · MACRO COMPARISON</h2>
      {[{label: "MAIN USD PAIRS", pairs: FOREX_PAIRS.slice(0, 6)}, {label: "CROSS PAIRS", pairs: FOREX_PAIRS.slice(6)}].map(group => (
        <div key={group.label} className="mt-3">
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{group.label}</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label={group.label}>
            {group.pairs.map(p => <button key={p} type="button" aria-pressed={p === pair} onClick={() => setPair(p)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${p === pair ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {p}
            </button>)}
          </div>
        </div>
      ))}
      <p className="mt-3 text-sm font-medium">
        Comparing {pair.slice(0, 3)} vs {pair.slice(3)} · rates, GDP, inflation and jobs
      </p>
      {!data && (
        <div role="status" className="mt-4 text-sm">
          {error ? (
            <>
              <p>Comparison could not load.</p>
              <button
                className="mt-2 rounded border px-3 py-2"
                onClick={() => setRetry((n) => n + 1)}
              >
                Retry
              </button>
            </>
          ) : (
            "Loading both currencies…"
          )}
        </div>
      )}
      {data && (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            Latest observations are shown separately. Differences below use the latest period
            available for both currencies; a gap in available dates is not filled with assumed data.
          </p>
          {[data.base, data.quote]
            .filter((s) => s.errors.length)
            .map((s) => (
              <p key={s.currency} role="status" className="mt-3 text-sm text-amber-500">
                {s.currency}: {s.errors.join(" · ")}
              </p>
            ))}
          <RateDifferential data={data} />
          <details className="mt-5"><summary className="cursor-pointer font-semibold">Central bank expectations · {data.base.currency} vs {data.quote.currency}</summary><div className="mt-3 grid gap-3 md:grid-cols-2"><CentralBankWatch currency={data.base.currency} policy={data.base.policy.at(-1)?.value} /><CentralBankWatch currency={data.quote.currency} policy={data.quote.policy.at(-1)?.value} /></div></details>
          <div className="mt-5 space-y-5">
            {categories.map((metric) => {
              const b = comparisonSeries(data.base)[metric.key],
                q = comparisonSeries(data.quote)[metric.key],
                gap = matchedDifference(b, q),
                differentFrequency =
                  metric.key === "inflation"
                    ? data.base.quarterlyCpi !== data.quote.quarterlyCpi
                    : metric.key === "jobs"
                      ? data.base.quarterlyLabour !== data.quote.quarterlyLabour
                      : false;
              return (
                <section key={metric.key} aria-label={metric.title}>
                  <h3 className="mb-2 text-lg font-semibold">{metric.title}</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Side snapshot={data.base} metric={metric} />
                    <Side snapshot={data.quote} metric={metric} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {differentFrequency
                      ? "Different reporting frequencies — no direct period-matched difference."
                      : gap
                        ? `${data.base.currency} minus ${data.quote.currency}: ${gap.value > 0 ? "+" : ""}${gap.value.toFixed(2)} percentage points · ${macroDateLabel(gap.date, metric.key === "policy")} (latest shared period).`
                        : "No shared reporting period available for a difference."}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
                </section>
              );
            })}
          </div>
          <details className="mt-5"><summary className="cursor-pointer font-semibold">Government bond yields · {data.base.currency} vs {data.quote.currency}</summary><div className="mt-3 grid gap-3 md:grid-cols-2">{[data.base.currency,data.quote.currency].map(c=>Object.hasOwn(countries,c.toLowerCase())?<InternationalYields key={c} country={c.toLowerCase() as Country}/>:<div key={c} className="rounded-xl border p-5"><h3 className="font-semibold">{c} yields</h3><a className="mt-2 inline-block text-sm underline" href={c==='USD'?'/dxy':'/euro'}>Open {c} macro dashboard for existing yields and rate context ↗</a><p className="mt-2 text-xs text-muted-foreground">Cross-country yields use different definitions; no automatic spread is computed here.</p></div>)}</div></details>
          <PairMacroConclusion data={data} />
        </>
      )}
    </section>
  );
}

function RateDifferential({ data }: { data: PairData }) {
  const b = data.base.policy,
    q = data.quote.policy,
    latest = matchedDifference(b, q),
    quote = new Map(q.map((r) => [r.date, r.value]));
  const history = b
    .filter((r) => quote.has(r.date))
    .map((r) => ({ date: r.date, value: r.value - quote.get(r.date)! }));
  return (
    <aside className="mt-5 rounded-xl border border-sky-500/40 bg-sky-500/5 p-4">
      <h3 className="font-semibold">
        Interest rate differential · {data.base.currency} − {data.quote.currency}
      </h3>
      <p className="mt-2 text-3xl font-bold">
        {latest
          ? `${latest.value > 0 ? "+" : ""}${latest.value.toFixed(2)} percentage points`
          : "No matching rate date available"}
      </p>
      {latest && (
        <p className="mt-1 text-xs text-muted-foreground">
          {macroDateLabel(latest.date, true)} · latest shared observation date ·{" "}
          {data.base.policyLabel} minus {data.quote.policyLabel}
        </p>
      )}
      <p className="mt-2 text-sm text-muted-foreground">
        {latest
          ? latest.value > 0
            ? `${data.base.currency} has the higher observed policy rate on this date.`
            : latest.value < 0
              ? `${data.quote.currency} has the higher observed policy rate on this date.`
              : "Both observed rates are equal on this date."
          : "A gap is not calculated without matching observations."}{" "}
        A widening gap toward the first currency may support it if market expectations move the same
        way. This is the policy-rate gap, not a bond-yield spread or a guaranteed trade direction.
      </p>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium">View differential history</summary>
        <MacroHistoryChart
          title={`${data.pair} interest rate differential`}
          rows={history}
          series={[{ key: "value", label: `${data.base.currency} minus ${data.quote.currency}` }]}
          unit="percentage points"
        />
      </details>
    </aside>
  );
}
