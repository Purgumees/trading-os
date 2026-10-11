import { describe, it, expect } from "vitest";
import { pairSupport } from "../src/lib/pair-support";
import type { PairData, ComparisonSnapshot } from "../src/lib/pair-macro";
function data(): PairData {
  const snapshot = { fetchedAt: "2026-10-11T12:00:00Z", policy: [{date:"2026-09-06",value:2},{date:"2026-10-06",value:2}], gdp:[{date:"2026-Q1",value:100},{date:"2026-Q2",value:101}], labour:[{date:"2026-05",value:5},{date:"2026-08",value:4.8}], inflation:[], quarterlyLabour:false } as unknown as ComparisonSnapshot;
  return {pair:"EURUSD",base:{...snapshot,currency:"EUR"},quote:{...snapshot,currency:"USD",gdp:[{date:"2026-Q1",value:100},{date:"2026-Q2",value:100.5}],labour:[{date:"2026-05",value:5},{date:"2026-08",value:5.2}]}};
}
describe("preliminary macro support", () => {
  it("requires aligned evidence and does not vote for the current rate level", () => {
    const d = data(); d.base.policy = d.base.policy.map(r => ({...r,value:r.value + 3}));
    const r = pairSupport(d); expect(r.winner).toBe("EUR"); expect(r.baseVotes).toBe(2); expect(r.signals[0].direction).toBe(0);
  });
  it("does not conclude a winner when policy movement opposes growth and jobs", () => {
    const d=data(); d.base.policy=[{date:"2026-09-06",value:2},{date:"2026-10-06",value:1.5}]; expect(pairSupport(d).winner).toBeNull();
  });
  it("excludes stale data and mismatched unemployment frequency", () => {
    const d=data(); d.quote.quarterlyLabour=true; expect(pairSupport(d).signals[2].direction).toBeNull();
    expect(pairSupport(d,"2027-10-11T00:00:00Z").available).toBe(0);
  });
  it("does not bridge missing unemployment comparators or fabricate a rate trend", () => {
    const d=data(); d.base.labour=d.base.labour.slice(1); d.quote.policy=d.quote.policy.slice(1);
    const r=pairSupport(d); expect(r.available).toBe(1); expect(r.winner).toBeNull();
  });
});
