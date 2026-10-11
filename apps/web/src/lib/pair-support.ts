import { comparisonSeries, matchedDifference, type PairData } from "./pair-macro";

export type SupportSignal = { label: string; direction: number | null; detail: string; period?: string };
const direction = (n: number) => Math.abs(n) < 0.1 - 1e-9 ? 0 : Math.sign(n);
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)} pp`;
function periodEnd(period: string) {
  const q = /^(\d{4})-Q([1-4])$/.exec(period);
  if (q) return Date.UTC(Number(q[1]), Number(q[2]) * 3, 0);
  if (/^\d{4}-\d{2}$/.test(period)) return Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 0);
  return Date.parse(period);
}
export function pairSupport(data: PairData, asOf = data.base.fetchedAt) {
  const now = Date.parse(asOf), b = comparisonSeries(data.base), q = comparisonSeries(data.quote);
  const fresh = (period: string, days: number) => Number.isFinite(now) && now - periodEnd(period) <= days * 86400000 && periodEnd(period) <= now;
  const signals: SupportSignal[] = [];
  const rate = matchedDifference(b.policy, q.policy);
  if (rate && fresh(rate.date, 21)) {
    const target = new Date(`${rate.date}T00:00:00Z`);
    // Calendar month, clamped to its last day (e.g. March 31 -> February 28).
    const day = target.getUTCDate();
    target.setUTCDate(1); target.setUTCMonth(target.getUTCMonth() - 1);
    target.setUTCDate(Math.min(day, new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()));
    const date = target.toISOString().slice(0, 10);
    const old = matchedDifference(b.policy.filter(r => r.date <= date), q.policy.filter(r => r.date <= date));
    if (old && target.getTime() - periodEnd(old.date) <= 7 * 86400000) {
      const change = rate.value - old.value;
      signals.push({label: "Policy gap · 1-month change", direction: direction(change), period: rate.date, detail: `${old.date} → ${rate.date}: ${signed(change)} change in ${data.base.currency} minus ${data.quote.currency}. Current gap ${signed(rate.value)} is shown separately; expected future rates are missing.`});
    } else signals.push({label: "Policy gap · 1-month change", direction: null, detail: "No matched observations near the calendar-month comparison date."});
  } else signals.push({label: "Policy gap · 1-month change", direction: null, detail: "Missing or stale shared policy-rate date (maximum age 21 days)."});
  const gdp = matchedDifference(b.gdp, q.gdp);
  signals.push(gdp && fresh(gdp.date, 150)
    ? {label: "GDP · relative real QoQ growth", direction: direction(gdp.value), period: gdp.date, detail: `${data.base.currency} minus ${data.quote.currency}: ${signed(gdp.value)}. Faster observed growth is one support signal; growth expectations are missing.`}
    : {label: "GDP · relative real QoQ growth", direction: null, detail: "No shared quarter within 150 days of quarter end."});
  const jobs = matchedDifference(b.jobs, q.jobs);
  const quarterly = data.base.quarterlyLabour;
  if (data.base.quarterlyLabour !== data.quote.quarterlyLabour) signals.push({label: "Jobs · unemployment trend", direction: null, detail: "Monthly and quarterly reporting are not scored against each other."});
  else if (jobs && fresh(jobs.date, quarterly ? 150 : 100)) {
    let previous: string;
    if (quarterly) {
      const year = Number(jobs.date.slice(0, 4)), quarter = Number(jobs.date.at(-1));
      previous = quarter === 1 ? `${year - 1}-Q4` : `${year}-Q${quarter - 1}`;
    } else {
      const d = new Date(`${jobs.date}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 3); previous = d.toISOString().slice(0, 7);
    }
    const oldB = b.jobs.find(r => r.date === previous), oldQ = q.jobs.find(r => r.date === previous);
    if (oldB && oldQ) {
      const changeB = b.jobs.find(r => r.date === jobs.date)!.value - oldB.value;
      const changeQ = q.jobs.find(r => r.date === jobs.date)!.value - oldQ.value;
      signals.push({label: `Jobs · ${quarterly ? "1-quarter" : "3-month"} unemployment trend`, direction: direction(changeQ - changeB), period: jobs.date, detail: `${previous} → ${jobs.date}: ${data.base.currency} ${signed(changeB)}, ${data.quote.currency} ${signed(changeQ)}. A smaller rise / larger fall receives support; absolute unemployment levels are not ranked.`});
    } else signals.push({label: "Jobs · unemployment trend", direction: null, detail: "Exact prior reporting period is missing; gaps are not bridged."});
  } else signals.push({label: "Jobs · unemployment trend", direction: null, detail: "Missing or stale shared unemployment period (monthly maximum 100 days; quarterly 150 days from period end)."});
  const baseVotes = signals.filter(s => s.direction === 1).length, quoteVotes = signals.filter(s => s.direction === -1).length;
  const available = signals.filter(s => s.direction !== null).length;
  const winner = baseVotes >= 2 && quoteVotes === 0 ? data.base.currency : quoteVotes >= 2 && baseVotes === 0 ? data.quote.currency : null;
  return {signals, baseVotes, quoteVotes, available, winner};
}
