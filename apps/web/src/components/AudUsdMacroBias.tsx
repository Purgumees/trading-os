"use client";
import { useEffect, useState } from "react";
type Row = { date: string; two: number | null };
type AuYields = { rows?: Row[]; error?: string };
type UsState = { economyState?: { usRatesYieldCurve?: { recentHistory?: { "2Y"?: Array<{date:string;value:number}> } }; inflation?: {headline?:{cpi?:{yoy?:{current?:{value:number|null}}}}}} }; status?:string };
type Country = {policy?:Array<{date:string;value:number}>; inflation?:Array<{date:string;yoy:number}>; employment?:Array<{date:string;value:number}>; errors?:string[]};
const fmt=(v:number|null,d=2)=>v===null?"Unavailable":v.toFixed(d);
export function AudUsdMacroBias(){
 const [state,setState]=useState<{au:AuYields;us:UsState;country:Country}|null>(null);
 const [error,setError]=useState("");
 useEffect(()=>{
  const controller=new AbortController();
  Promise.all([
   fetch("/api/macro/yields/aud",{signal:controller.signal}).then(r=>{if(!r.ok)throw Error("Australian yields unavailable");return r.json() as Promise<AuYields>}),
   fetch("/api/macro/economy-state",{signal:controller.signal}).then(r=>{if(!r.ok)throw Error("US macro unavailable");return r.json() as Promise<UsState>}),
   fetch("/api/macro/country/aud",{signal:controller.signal}).then(r=>{if(!r.ok)throw Error("Australian macro unavailable");return r.json() as Promise<Country>})
  ]).then(([au,us,country])=>{if(!controller.signal.aborted)setState({au,us,country});}).catch(e=>{if(!controller.signal.aborted)setError(String(e.message||e));});
  return ()=>controller.abort();
 },[]);
 const au=state?.au.rows?.filter(r=>r.two!==null).at(-1);
 const us=state?.us.economyState?.usRatesYieldCurve?.recentHistory?.["2Y"]?.at(-1);
 const spread=au?.two!=null&&us?.value!=null?100*(au.two-us.value):null;
 const auPrev=state?.au.rows?.filter(r=>r.two!==null).at(-6);
 const usHistory=state?.us.economyState?.usRatesYieldCurve?.recentHistory?.["2Y"]??[];
 const usPrev=usHistory.at(-6);
 const change=au?.two!=null&&auPrev?.two!=null&&us?.value!=null&&usPrev?.value!=null?100*((au.two-auPrev.two)-(us.value-usPrev.value)):null;
 const fresh=!!au&&!!us&&Date.now()-Date.parse(au.date+"T00:00:00Z")<14*86400000&&Date.now()-Date.parse(us.date+"T00:00:00Z")<14*86400000;
 const comparable=!!au&&!!us&&Math.abs(Date.parse(au.date)-Date.parse(us.date))<=7*86400000;
 const labourDate=state?.country.employment?.at(-1)?.date;
 const labourReleaseUnverified=!labourDate||labourDate<"2026-09";
 const directional=spread!==null&&change!==null&&fresh&&comparable&&!labourReleaseUnverified;
 const bias=!directional?"WITHHELD · macro inputs not fully verified":change>5?"Yield spread moving toward AUD":change< -5?"Yield spread moving toward USD":"Yield spread direction mixed";
 const inflation=state?.country.inflation?.at(-1);
 return <section className="mb-8 rounded-xl border p-5" aria-label="AUD USD relative macro">
  <h2 className="text-xl font-semibold">AUD/USD · Relative Macro Bias</h2>
  <p className="mt-2 text-sm text-muted-foreground">Relative rates are one input, not a trade recommendation. A complete bias also needs RBA/Fed repricing, China demand and global risk sentiment.</p>
  <p className="mt-4 text-lg font-semibold">{bias}</p>
  <section className="mt-4 rounded-lg border border-amber-500/60 p-3" aria-label="Price macro divergence">
   <h3 className="font-semibold">AUD/USD · Price vs Macro Divergence</h3>
   <p className="mt-2 text-sm">Watch for price making lower lows while the AU–US 2Y yield spread is rising, or price making higher highs while the spread is falling. Neither alone confirms a reversal.</p>
   <p className="mt-2 text-sm font-semibold">Status: NOT VERIFIED — no synchronized AUD/USD price history and complete macro repricing feed are connected to this comparison.</p>
   <p className="mt-2 text-xs text-muted-foreground">For Weekly Forecast, compare the same 5/20 trading-day dates, verify the latest ABS employment release, and confirm RBA/Fed expectations plus China/risk data. Do not use this box as a trading entry signal.</p>
  </section>
  {!state?<p role="status" className="mt-2 text-sm">{error||"Loading Australia and US macro data…"}</p>:<>
   <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">AU 2Y yield</p><p className="text-xl font-semibold">{fmt(au?.two??null)}%</p><p className="text-xs">{au?.date||"No date"}</p></div>
    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">US 2Y yield</p><p className="text-xl font-semibold">{fmt(us?.value??null)}%</p><p className="text-xs">{us?.date||"No date"}</p></div>
    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">AU − US 2Y spread</p><p className="text-xl font-semibold">{fmt(spread,0)} bp</p></div>
    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Recent relative yield move*</p><p className="text-xl font-semibold">{fmt(change,0)} bp</p></div>
   </div>
   <p className="mt-3 text-xs text-muted-foreground">*Latest versus fifth preceding available observation for each series, not necessarily the same dates. This is descriptive, not a validated signal. Signal is withheld if yields are stale, dates differ, or AUD employment data predates September 2026. Historical OECD observations are not a substitute for the latest ABS release.</p>
   <p className="mt-3 text-sm">Australia latest headline CPI: {inflation?inflation.yoy.toFixed(2)+"% YoY ("+inflation.date+")":"Unavailable"} · RBA policy: {state.country.policy?.at(-1)?.value?.toFixed(2)??"Unavailable"}%.</p>
   <div className="mt-4 grid gap-3 md:grid-cols-3">
    <div className="rounded-lg border p-3"><h3 className="font-semibold">RBA vs Fed</h3><p className="mt-2 text-sm text-muted-foreground">Check expected rates for the next three meetings. A widening AU–US 2Y spread can support AUD; it is not sufficient by itself.</p></div>
    <div className="rounded-lg border p-3"><h3 className="font-semibold">China & commodities</h3><p className="mt-2 text-sm text-muted-foreground">China PMI, iron ore and RBA commodity price index are not connected to this signal. No bullish/bearish assumption is made.</p><a className="mt-2 inline-block text-sm underline" href="https://www.rba.gov.au/statistics/tables/" target="_blank" rel="noreferrer">RBA commodity data ↗</a></div>
    <div className="rounded-lg border p-3"><h3 className="font-semibold">Risk sentiment</h3><p className="mt-2 text-sm text-muted-foreground">Global equity risk appetite and volatility are not connected. Confirm the risk backdrop before trading AUD/USD.</p></div>
   </div>
   {(state.au.error||state.country.errors?.length)?<p role="status" className="mt-3 text-amber-500">{[state.au.error,...(state.country.errors||[])].filter(Boolean).join(" · ")}</p>:null}
  </>}
 </section>;
}
