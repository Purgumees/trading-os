"use client";
import {useState,useEffect} from "react";
import {countries,type Country} from "@/lib/international-macro";
import {curveState,type YieldData} from "@/lib/international-yields";
import {macroDateLabel} from "@/lib/macro-date-label";
import {MacroHistoryChart} from "./MacroHistoryChart";
import {MacroObservationTable} from "./MacroObservationTable";
const maturities=[{key:"two",label:"2Y"},{key:"ten",label:"10Y"},{key:"thirty",label:"30Y"}] as const;
export function InternationalYields({country}:{country:Country}){
 const [data,setData]=useState<YieldData|null>(null),[error,setError]=useState(false);
 useEffect(()=>{const c=new AbortController();setData(null);setError(false);fetch(`/api/macro/yields/${country}`,{signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{if(!c.signal.aborted)setData(d);}).catch(e=>{if(e.name!=='AbortError')setError(true);});return()=>c.abort();},[country]);
 const curve=curveState(data?.rows??[]);
 return <section aria-label={`${country.toUpperCase()} government yields`} className="mb-6 min-w-0 rounded-xl border p-5">
  <h2 className="text-lg font-semibold">{countries[country].name} · government bond yields</h2>
  {!data?<p className="mt-2 text-sm" role="status">{error?'Yields could not load. Refresh to retry.':'Loading official yield data…'}</p>:<>
   <p className="mt-2 text-xs text-muted-foreground">{data.definition}</p>
   {data.error&&<p className="mt-3 text-sm text-amber-500" role="status">Yield source unavailable: {data.error}</p>}
   <div className="mt-4 grid grid-cols-3 gap-2">{maturities.map(m=>{const last=data.rows.findLast(r=>r[m.key]!==null);return <div key={m.key} className="rounded-lg border p-3"><h3 className="font-semibold">{m.label}</h3><p className="mt-1 text-xl font-bold">{last?`${last[m.key]!.toFixed(2)}%`:'—'}</p><p className="mt-1 text-xs text-muted-foreground">{last?macroDateLabel(last.date,true):'Series not available'}</p>{last&&Date.now()-Date.parse(last.date)>14*86400000&&<p className="text-xs text-amber-500">Older than 14 days</p>}</div>;})}</div>
   {data.rows.length>0&&<details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">View yield chart and history</summary><MacroHistoryChart rows={data.rows} title={`${country.toUpperCase()} government yields`} series={[...maturities]} unit="%"/><MacroObservationTable rows={data.rows.slice(-12)} columns={[...maturities]} daily/></details>}
   {curve&&<aside className="mt-4 rounded-lg border border-sky-500/40 bg-sky-500/5 p-3"><h3 className="font-semibold">2Y–10Y curve · {curve.move}</h3><p className="mt-2 text-sm">10Y minus 2Y: {(curve.gap*100).toFixed(1)} bp · {macroDateLabel(curve.last.date,true)} · {curve.gap<0?'Inverted':curve.gap>0?'Upward sloping':'Flat'}</p>{curve.previous&&<p className="mt-1 text-sm">Spread change {(curve.change!*100).toFixed(1)} bp since {macroDateLabel(curve.previous.date,true)}. {curve.direction}.</p>}<p className="mt-2 text-xs text-muted-foreground">Steepening means the 10Y−2Y gap increased; flattening means it decreased. If both yields fall and 10Y falls faster, this is bull flattening. If both rise and 10Y rises faster, this is bear steepening. These describe the curve, not a guaranteed currency direction.</p></aside>}
   <p className="mt-3 text-xs text-muted-foreground">{data.note}</p><a href={data.source} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs underline">Official yield source ↗</a>
  </>}
 </section>;
}
