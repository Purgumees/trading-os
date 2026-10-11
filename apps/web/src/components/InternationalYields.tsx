"use client";
import {useState,useEffect} from "react";
import {countries,type Country} from "@/lib/international-macro";
import {curveState,yieldChanges,yieldSpreads,yieldHorizons,type YieldChange,type YieldData} from "@/lib/international-yields";
import {macroDateLabel} from "@/lib/macro-date-label";
import {MacroHistoryChart} from "./MacroHistoryChart";
import {MacroObservationTable} from "./MacroObservationTable";
const maturities=[{key:"two",label:"2Y"},{key:"ten",label:"10Y"},{key:"thirty",label:"30Y"}] as const;
const spreads=[{key:"tenSpread",label:"10Y − 2Y"},{key:"thirtySpread",label:"30Y − 2Y"}] as const;
const bp=(v:number|null|undefined)=>v==null?"Unavailable":`${v>0?"+":""}${v.toFixed(1)} bp`;
function ChangeCell({change,curve=false}:{change:YieldChange;curve?:boolean}){
 const movement=change?Math.abs(change.value)<0.5?"→":change.value>0?"↑":"↓":"";
 return <td className="py-3 pr-4 align-top">
   <span className={change&&Math.abs(change.value)>=0.5?(change.value>0?"text-sky-400":"text-rose-400"):"text-muted-foreground"}>{bp(change?.value)} {curve&&change?Math.abs(change.value)<0.5?"Stable":change.value>0?"Steepening":"Flattening":movement}</span>
   {change&&<span className="mt-1 block text-xs text-muted-foreground">was {curve?`${change.previous.toFixed(1)} bp`:`${change.previous.toFixed(2)}%`}<br/>vs {macroDateLabel(change.date,true)}</span>}
 </td>;
}
export function InternationalYields({country}:{country:Country}){
 const [data,setData]=useState<YieldData|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{const c=new AbortController();setData(null);setError(false);fetch(`/api/macro/yields/${country}`,{signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{if(!c.signal.aborted)setData(d);}).catch(e=>{if(e.name!=='AbortError')setError(true);});return()=>c.abort();},[country,retry]);
 const rows=data?.rows??[],curve=curveState(rows),curveRows=yieldSpreads(rows);
 const current=curve?.last,previous=curve?.previous;
 const frontChange=current&&previous?(current.two!-previous.two!)*100:null;
 const longMoves=current&&previous?[{label:"10Y",value:(current.ten!-previous.ten!)*100},...(current.thirty!==null&&previous.thirty!==null?[{label:"30Y",value:(current.thirty-previous.thirty)*100}]:[])]:[];
 const longChange=longMoves.length?longMoves.reduce((s,r)=>s+r.value,0)/longMoves.length:null;
 const largest=current&&previous?[{label:"2Y",value:frontChange!},...longMoves].sort((a,b)=>Math.abs(b.value)-Math.abs(a.value))[0]:null;
 const chartStart=new Date(`${rows.at(-1)?.date??"2000-01-01"}T00:00:00Z`);chartStart.setUTCMonth(chartStart.getUTCMonth()-3);
 const chartRows=rows.filter(r=>Date.parse(r.date)>=chartStart.getTime());
 return <section aria-label={`${country.toUpperCase()} government yields`} className="mb-8 min-w-0">
  <div className="mb-4"><h2 className="text-lg font-semibold">{country.toUpperCase()} RATES &amp; YIELD CURVE</h2><p className="mt-1 text-sm text-muted-foreground">{countries[country].name} government yields · changes and curve spreads in basis points.</p></div>
  <article className="min-w-0 rounded-xl border p-5">
   {!data?<div role="status" className="text-sm">{error?<><p>Yields could not load.</p><button className="mt-2 rounded border px-3 py-2" onClick={()=>setRetry(n=>n+1)}>Retry</button></>:"Loading official yield data…"}</div>:<>
    <h3 className="mb-2 text-sm font-semibold">Government Bond Yields · 2Y / 10Y / 30Y</h3>
    <p className="mb-3 text-xs text-muted-foreground">{data.definition}</p>
    {data.error&&<p className="mb-3 text-sm text-amber-500" role="status">Yield source unavailable: {data.error}</p>}
    <div className="overflow-x-auto"><table aria-label="Yield levels and changes" className="w-full min-w-[650px] border-collapse text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-4 font-medium">Maturity</th><th className="py-2 pr-4 font-medium">NOW</th>{yieldHorizons.map(h=><th key={h.key} className="py-2 pr-4 font-medium">{h.label}</th>)}</tr></thead><tbody>{maturities.map(m=>{
      const history=yieldChanges(rows,r=>r[m.key]);const last=history.latest;
      return <tr key={m.key} className="border-b last:border-0"><th scope="row" className="py-3 pr-4 text-left align-top font-semibold">{m.label}</th><td className="py-3 pr-4 align-top"><span className="font-semibold">{last?`${last[m.key]!.toFixed(2)}%`:"Unavailable"}</span><span className="mt-1 block text-xs text-muted-foreground">{last?macroDateLabel(last.date,true):"Series not supplied"}</span>{last&&Date.now()-Date.parse(last.date)>14*86400000&&<span className="text-xs text-amber-500">Older than 14 days</span>}</td>{yieldHorizons.map(h=><ChangeCell key={h.key} change={history.changes[h.key]}/>)}</tr>;
    })}</tbody></table></div>
    <p className="mt-2 text-xs text-muted-foreground">1D uses the prior available dated observation. 1W, 1M and 3M use observations on or just before the calendar comparison date (maximum 7-day gap). Missing history stays unavailable; no holiday interpolation. ↑ / ↓ means the yield changed, not a buy/sell signal. 1 bp = 0.01 percentage points.</p>
    {rows.length>0&&<>
     <MacroHistoryChart rows={chartRows} title="Government yields · latest 3 months available" series={[...maturities]} unit="%"/>
     <MacroHistoryChart rows={yieldSpreads(chartRows)} title="Yield curve spreads · latest 3 months available" series={[{key:"tenSpread",label:"10Y − 2Y"},{key:"thirtySpread",label:"30Y − 2Y"}]} unit="bp"/>
    </>}
    <h3 className="mb-3 mt-6 text-sm font-semibold">YIELD CURVE</h3>
    <div className="overflow-x-auto"><table aria-label="Yield curve spreads and changes" className="w-full min-w-[560px] border-collapse text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-4 font-medium">Spread</th><th className="py-2 pr-4 font-medium">Current</th>{yieldHorizons.slice(0,3).map(h=><th key={h.key} className="py-2 pr-4 font-medium">{h.label} change</th>)}</tr></thead><tbody>{spreads.map(s=>{const history=yieldChanges(curveRows,r=>r[s.key],1);const last=history.latest;return <tr key={s.key} className="border-b last:border-0"><th scope="row" className="py-3 pr-4 text-left align-top font-medium">{s.label}</th><td className="py-3 pr-4 align-top">{bp(last?.[s.key])}<span className="mt-1 block text-xs text-muted-foreground">{last?macroDateLabel(last.date,true):"Matching maturities unavailable"}</span></td>{yieldHorizons.slice(0,3).map(h=><ChangeCell key={h.key} change={history.changes[h.key]} curve/>)}</tr>;})}</tbody></table></div>
    <div className="mt-5 grid gap-3 border-t pt-4 text-sm md:grid-cols-2">
     <p><span className="font-medium">Front-end · 2Y: </span>{bp(frontChange)}</p>
     <p><span className="font-medium">Long-end: </span>{bp(longChange)}{longMoves.length>0&&` · ${longMoves.length===2?"average 10Y/30Y":"10Y only; 30Y unavailable"}`}{longChange!==null&&frontChange!==null&&` · ${Math.abs(longChange)>Math.abs(frontChange)?"Larger than":"Not larger than"} 2Y move`}</p>
     <p><span className="font-medium">Curve · 10Y − 2Y: </span>{curve?.move??"Unavailable"}{curve&&` · ${curve.gap<0?"Inverted":curve.gap>0?"Upward sloping":"Flat"}`}</p>
     <p><span className="font-medium">Largest move: </span>{largest?`${largest.label} ${bp(largest.value)}`:"Unavailable"}</p>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">Summary uses the latest two shared 2Y/10Y observations{current&&previous?`: ${macroDateLabel(previous.date,true)} → ${macroDateLabel(current.date,true)}`:""}. 30Y is included only when present on both dates.</p>
    <aside className="mt-5 rounded-lg border border-sky-500/40 bg-sky-500/5 p-4"><h3 className="font-semibold">What the curve means for {country.toUpperCase()}</h3><p className="mt-2 text-sm text-muted-foreground">Steepening = the long−short yield gap widened; flattening = it narrowed. Both yields falling with the long yield falling faster is bull flattening. Both rising with the long yield rising faster is bear steepening.</p><p className="mt-2 text-sm text-muted-foreground">A rising 2Y yield may reflect tighter expected policy and support {country.toUpperCase()} when its expected rate advantage over the other currency improves. A rising 10Y/30Y can also reflect inflation, supply or risk premiums. Curve shape alone does not determine currency direction.</p></aside>
    {rows.length>0&&<details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">View dated yield history</summary><MacroObservationTable rows={rows.slice(-12)} columns={[...maturities]} daily/></details>}
    <p className="mt-4 text-xs text-muted-foreground">{data.note}</p><a href={data.source} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs underline">Official yield source ↗</a>
   </>}
  </article>
 </section>;
}
