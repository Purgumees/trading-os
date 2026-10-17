"use client";
import {useEffect,useState} from "react";
import {MacroHistoryChart} from "./MacroHistoryChart";
type Release={date:string;employmentChange:number;employmentTotal:number;unemploymentRate:number;releaseDate:string;source:string};
const snapshot:Release={date:"2026-09",employmentChange:-39300,employmentTotal:14782700,unemploymentRate:4.7,releaseDate:"2026-10-15",source:"https://www.abs.gov.au/statistics/labour/employment-and-unemployment/labour-force-australia/latest-release"};
export function AudEmploymentChart(){
 const [live,setLive]=useState<Release|null>(null);
 useEffect(()=>{const c=new AbortController();fetch("/api/macro/abs-labour",{signal:c.signal,cache:"no-store"}).then(r=>{if(!r.ok)throw Error("ABS unavailable");return r.json()}).then(d=>{if(!c.signal.aborted&&/^20\d{2}-\d{2}$/.test(d.date)&&Number.isFinite(d.employmentChange)&&Number.isFinite(d.employmentTotal))setLive(d)}).catch(()=>{});return()=>c.abort()},[]);
 const d=live??snapshot;
 return <div className="mt-3">
  <p className="text-3xl font-bold">{d.employmentChange>0?"+":""}{d.employmentChange.toLocaleString("en-AU")} employed people</p>
  <p className="mt-1 text-sm text-muted-foreground">{d.date} · Employment change vs previous month · Total employed {d.employmentTotal.toLocaleString("en-AU")} · Unemployment {d.unemploymentRate.toFixed(1)}%</p>
  <p className="mt-2 text-xs text-amber-400">{live?"Latest ABS release retrieved automatically":"Verified September 2026 snapshot · Live ABS feed not confirmed"} · Released {d.releaseDate}. Earlier OECD/FRED values are not combined with ABS observations.</p>
  <MacroHistoryChart title="Official ABS employment change · confirmed observation" rows={[{date:d.date,change:d.employmentChange}]} series={[{key:"change",label:"MoM change"}]} unit="persons"/>
  <p className="mt-2 text-sm text-muted-foreground">Only the verified ABS observation is plotted until the complete ABS historical series is connected. A single point does not imply a historical trend.</p>
  <a href={d.source} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs underline">Official ABS labour report ↗</a>
 </div>
}
