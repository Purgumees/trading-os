import { pairSupport } from "@/lib/pair-support";
import type { PairData } from "@/lib/pair-macro";
export function PairMacroConclusion({ data }: { data: PairData }) {
  const result = pairSupport(data);
  return <aside aria-label="Macro conclusion" className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/5 p-5">
    <h3 className="text-sm font-semibold">MACRO CONCLUSION · {data.pair}</h3>
    <p className="mt-2 text-2xl font-bold">{result.winner ? `${result.winner} has stronger observed macro support` : result.available < 2 ? "Insufficient comparable data" : "No clear macro advantage"}</p>
    <p className="mt-2 text-sm">{data.base.currency}: {result.baseVotes} supportive signals · {data.quote.currency}: {result.quoteVotes} · {result.available}/3 comparable drivers. Assessment: preliminary; market expectations are not included in this score.</p>
    <div className="mt-4 space-y-3">{result.signals.map(s => <div key={s.label} className="rounded-lg border p-3">
      <p className="font-semibold">{s.label} · {s.direction === null ? "Not scored" : s.direction === 0 ? "Neutral" : `${s.direction > 0 ? data.base.currency : data.quote.currency} support`}</p>
      <p className="mt-1 text-sm text-muted-foreground">{s.detail}</p>
    </div>)}</div>
    <p className="mt-4 text-sm text-muted-foreground">Inflation is context, not a vote: higher headline inflation can signal tighter policy or weaker purchasing power. Core inflation, wages, releases versus forecasts and relative FX price momentum would improve this assessment. The rate-watch panels are separate; their estimates are not yet included in this score.</p>
    <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">How the conclusion is calculated</summary><p className="mt-2 text-muted-foreground">Transparent, unbacktested heuristic: three equally counted drivers, with changes or differences below 0.10 percentage points treated as neutral. A currency needs at least two supportive drivers and no opposing driver. Conflicting signals yield no clear advantage; fewer than two available drivers yield insufficient data. Missing or old data are excluded. The current rate level is a separate rate advantage, not an extra vote. This is relative observed macro support, not demonstrated currency strength, a probability, or a buy/sell signal.</p></details>
  </aside>;
}
