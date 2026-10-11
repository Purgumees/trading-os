import { quarterlyGrowthHistory } from "./quarterly-growth-history";
import type { CountryData, Observation } from "./international-macro";
export const FOREX_PAIRS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "USDCAD",
  "AUDUSD",
  "NZDUSD",
  "GBPJPY",
  "EURJPY",
  "AUDJPY",
  "GBPAUD",
  "AUDNZD",
] as const;
export type ForexPair = (typeof FOREX_PAIRS)[number];
export type Currency = "EUR" | "USD" | "JPY" | "AUD" | "GBP" | "CAD" | "NZD";
export type ComparisonSnapshot = CountryData & {
  currency: Currency;
  name: string;
  policyLabel: string;
  inflationLabel: string;
  labourLabel: string;
  quarterlyCpi: boolean;
  quarterlyLabour: boolean;
  sources: { policy: string; inflation: string; labour: string };
};
export type PairData = { pair: ForexPair; base: ComparisonSnapshot; quote: ComparisonSnapshot };
export function indexInflation(rows: Observation[]) {
  const levels = new Map(rows.map((r) => [r.date.slice(0, 7), r.value]));
  return [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      const date = r.date.slice(0, 7),
        d = new Date(`${date}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - 1);
      const previous = levels.get(d.toISOString().slice(0, 7));
      d.setUTCMonth(d.getUTCMonth() - 11);
      const lastYear = levels.get(d.toISOString().slice(0, 7));
      return {
        date,
        yoy: lastYear && r.value > 0 ? (r.value / lastYear - 1) * 100 : null,
        change: previous && r.value > 0 ? (r.value / previous - 1) * 100 : null,
      };
    })
    .filter((r): r is { date: string; yoy: number; change: number | null } => r.yoy !== null)
    .slice(-12);
}
export function comparisonSeries(snapshot: ComparisonSnapshot) {
  return {
    policy: snapshot.policy,
    gdp: quarterlyGrowthHistory(snapshot.gdp)
      .rows.filter((r): r is typeof r & { qoq: number } => r.qoq !== null)
      .map((r) => ({ date: r.date, value: r.qoq! })),
    inflation: snapshot.inflation.map((r) => ({ date: r.date, value: r.yoy })),
    jobs: snapshot.labour,
  };
}
export function matchedDifference(base: Observation[], quote: Observation[]) {
  const counterpart = new Map(quote.map((r) => [r.date, r.value]));
  const last = [...base]
    .sort((a, b) => a.date.localeCompare(b.date))
    .findLast((r) => counterpart.has(r.date));
  return last ? { date: last.date, value: last.value - counterpart.get(last.date)! } : null;
}
