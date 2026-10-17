"use client";
import { useEffect, useState } from "react";

type Labour = {
 status: string; date: string; releaseDate: string; employmentTotal: number;
 employmentChange: number; unemploymentRate: number; adjustment: string;
 source: string; checkedAt: string;
};
export function AbsLabourLatest() {
 const [data,setData]=useState<Labour|null>(null);
 const [error,setError]=useState("Checking ABS latest release…");
 useEffect(()=>{
  const controller=new AbortController();
  fetch("/api/macro/abs-labour",{signal:controller.signal,cache:"no-store"})
   .then(async r=>{const json=await r.json();if(!r.ok)throw new Error(json.error||"ABS unavailable");return json as Labour;})
   .then(d=>{if(!controller.signal.aborted){setData(d);setError("");}})
   .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"ABS unavailable");});
  return()=>controller.abort();
 },[]);
 const n=(v:number)=>v.toLocaleString("en-AU",{maximumFractionDigits:1});
 return <section className="mb-6 rounded-xl border border-amber-500/60 p-5" aria-label="ABS latest labour release">
  <h2 className="text-lg font-semibold">AUD · Latest official ABS labour release</h2>
  {data?<><p className="mt-2 text-sm">Period: <strong>{data.date}</strong> · Released: {data.releaseDate} · {data.adjustment}</p>
   <div className="mt-4 grid gap-3 sm:grid-cols-3">
    <div><div className="text-xs text-muted-foreground">Employment change</div><strong className="text-xl">{data.employmentChange>0?"+":""}{n(data.employmentChange)}</strong></div>
    <div><div className="text-xs text-muted-foreground">Employed people</div><strong className="text-xl">{n(data.employmentTotal)}</strong></div>
    <div><div className="text-xs text-muted-foreground">Unemployment rate</div><strong className="text-xl">{data.unemploymentRate.toFixed(1)}%</strong></div>
   </div>
   <p className="mt-3 text-xs text-muted-foreground">Read automatically from the ABS latest-release page; refreshed hourly on the server. Publication date is not the observation date. Verify revisions before trading.</p>
   <a className="mt-2 inline-block text-sm underline" href={data.source} target="_blank" rel="noreferrer">Official ABS report ↗</a>
  </>:<p className="mt-3 text-sm text-amber-400" role="alert">NOT VERIFIED · {error}. Do not use the older OECD/FRED employment chart as the latest release.</p>}
 </section>;
}
