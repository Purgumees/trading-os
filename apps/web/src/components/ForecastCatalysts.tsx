'use client';
import {useEffect,useState} from 'react';
import {outlookWeek} from '@/lib/weekly-outlook';
import type {WeeklyEvent} from '@/lib/weekly-calendar';
type Calendar={asOf:string;events:WeeklyEvent[];source:string;error:string|null};
const localDay=(s:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tallinn',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
const time=(s:string)=>new Intl.DateTimeFormat('et-EE',{timeZone:'Europe/Tallinn',dateStyle:'medium',timeStyle:'short'}).format(new Date(s));
export function ForecastCatalysts({pair,week}:{pair:string;week:string}){
 const [includeMedium,setIncludeMedium]=useState(false);
 const [data,setData]=useState<Calendar|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  const load=async()=>{
   setLoading(true);setError('');
   try{const r=await fetch('/api/macro/calendar',{signal:controller.signal});if(!r.ok)throw Error();const d=await r.json() as Calendar;if(!Array.isArray(d.events)||!Number.isFinite(Date.parse(d.asOf)))throw Error();if(!controller.signal.aborted)setData(d);}
   catch{if(!controller.signal.aborted)setError('Kalender pole praegu saadaval. Varem laaditud sündmused võivad olla aegunud.');}
   finally{if(!controller.signal.aborted)setLoading(false);}
  };
  void load();
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},3600000);
  return()=>{controller.abort();clearInterval(timer);};
 },[refresh]);
 const end=new Date(Date.parse(week)+7*86400000).toISOString().slice(0,10);
 const events=(data?.events??[]).filter(e=>[pair.slice(0,3),pair.slice(3)].includes(e.currency)&&(includeMedium||e.impact==='High')&&localDay(e.date)>=week&&localDay(e.date)<end);
 const covered=data&&outlookWeek(data.asOf)===week;
 return <section className="rounded-lg border bg-muted/30 p-4" aria-label="Automaatsed nädala katalüsaatorid"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{pair} · nädala katalüsaatorid · automaatne</h3><button className="rounded border px-3 py-1 text-sm" disabled={loading} onClick={()=>setRefresh(n=>n+1)}>Värskenda uudiseid</button></div><p className="mt-2 text-xs text-muted-foreground">Vaikimisi ainult kõrge mõjuga sündmused. Olulisus põhineb Forex Factory kalendri hinnangul; tegelik reaktsioon sõltub üllatusest ja paari põhiteemast. Ajad: Tallinn. Kalender ei kata ootamatuid poliitilisi ega geopoliitilisi uudiseid.</p><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={includeMedium} onChange={e=>setIncludeMedium(e.target.checked)}/>Näita ka keskmise mõjuga uudiseid</label>{loading&&<p role="status" className="mt-3 text-sm">Laadin nädala uudiseid…</p>}{error&&<p role="alert" className="mt-3 text-sm text-amber-500">{error}</p>}{data&&<p className="mt-2 text-xs text-muted-foreground">Kontrollitud: {time(data.asOf)} · <a className="underline" href={data.source} target="_blank" rel="noreferrer">Forex Factory kalender ↗</a> · uueneb avamisel ja iga tunni järel</p>}{data&&!covered?<p className="mt-3 text-sm">Allikas katab jooksva nädala; valitud nädala kalender pole saadaval.</p>:covered&&events.length===0?<p className="mt-3 text-sm">Valitud filtriga sündmusi pole. Keskmise mõjuga uudiste nägemiseks lülita lisavalik sisse.</p>:<div className="mt-3 space-y-3">{events.map(e=><article key={`${e.date}-${e.currency}-${e.title}`} className="rounded border bg-background p-3 text-sm"><p className="font-semibold">{time(e.date)} · {e.currency} · {e.title}</p><p className="mt-2"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${e.impact==='High'?'border-red-500/40 bg-red-500/10 text-red-500':'border-amber-500/40 bg-amber-500/10 text-amber-500'}`}>{e.impact==='High'?'Kõrge mõju · prioriteet':'Keskmine mõju'}</span></p><p className="mt-2 text-xs">Ootus: {e.forecast||'—'} · Eelmine: {e.previous||'—'}</p><p className="mt-2 text-xs text-muted-foreground">{e.meaning}</p></article>)}</div>}</section>;
}
