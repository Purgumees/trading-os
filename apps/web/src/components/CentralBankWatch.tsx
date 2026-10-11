"use client";
import { useEffect,useState } from "react";
import { watchBanks,type BankWatch,type WatchCurrency } from "@/lib/central-bank-watch";
import { macroDateLabel } from "@/lib/macro-date-label";
export function CentralBankWatch({currency,policy}:{currency:WatchCurrency;policy?:number}) {
 const [data,setData]=useState<BankWatch|null>(null),[error,setError]=useState(false);
 useEffect(()=>{if(currency==="USD")return;const c=new AbortController();setData(null);setError(false);fetch(`/api/macro/rate-watch/${currency}`,{signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{if(!c.signal.aborted)setData(d);}).catch(e=>{if(e.name!=='AbortError')setError(true);});return()=>c.abort();},[currency]);
 if(currency==="USD")return <section className="mb-6 rounded-xl border p-5"><h2 className="font-semibold">Fed · existing expectations dashboard</h2><p className="mt-2 text-sm text-muted-foreground">The US dashboard contains the connected Polymarket expectations, kept separate from CME FedWatch. CME futures probabilities are not connected.</p><a href="/dxy" className="mt-3 inline-block text-sm underline">Open US rates and expectations ↗</a></section>;
 return <section aria-label={`${currency} rate expectations`} className="mb-6 min-w-0 rounded-xl border p-5">
  <h2 className="text-lg font-semibold">{watchBanks[currency].bank} · interest rate expectations</h2>
  {!data?<p role="status" className="mt-2 text-sm">{error?"Expectations could not load. Refresh to retry.":"Loading published market estimates…"}</p>:<>
   <p className="mt-2 text-xs text-muted-foreground">Central Bank Watch · independent provider · {data.asOf?`Source data: ${macroDateLabel(data.asOf,true)}`:data.status}</p>
   {data.current!==null&&<p className="mt-2 text-sm">Source policy baseline: {data.current.toFixed(2)}%</p>}
   {policy!==undefined&&data.current!==null&&Math.abs(policy-data.current)>0.02&&<p className="mt-2 text-sm text-amber-500">Policy baseline differs from this dashboard ({policy.toFixed(2)}%). Source dates or rate definitions differ; do not combine the two baselines.</p>}
   {data.meetings.length?<div className="mt-4 space-y-3">{data.meetings.map((m,i)=><article key={m.date} className="rounded-lg border p-3">
    <h3 className="font-semibold">{macroDateLabel(m.date,true)} · expected rate {m.expected.toFixed(2)}%</h3>
    <p className="mt-1 text-xs text-muted-foreground">{i===0?"Rate outcomes at this covered meeting":"Cumulative rate outcomes by this meeting"} · not certainty</p>
    <div className="mt-2 flex flex-wrap gap-2">{m.outcomes.map(o=><span key={o.rate} className="rounded bg-muted px-2 py-1 text-sm">{o.rate.toFixed(2)}%: {o.probability.toFixed(1)}% odds</span>)}</div>
    <p className="mt-2 text-xs">1 week ago: {m.weekAgo===null?"Unavailable":`${m.weekAgo.toFixed(2)}% · change ${((m.expected-m.weekAgo)*100).toFixed(1)} bp`} · 4 weeks ago: {m.monthAgo===null?"Unavailable":`${m.monthAgo.toFixed(2)}%`}</p>
   </article>)}</div>:<p className="mt-3 text-sm">{data.status}. No probability is assumed.</p>}
   <p className="mt-3 text-xs text-muted-foreground">{data.note} Up to three covered meetings are shown; source coverage may omit nearer decisions. These estimates are displayed separately and do not yet vote in the macro conclusion.</p>
   {currency==="JPY"&&<a href="https://www.boj.or.jp/en/mopo/mpmsche_minu/" target="_blank" rel="noreferrer" className="mt-3 mr-4 inline-block text-xs underline">Official BOJ meeting calendar ↗</a>}
   <a href={data.source} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs underline">Watch tool & methodology ↗</a>
  </>}
 </section>;
}
