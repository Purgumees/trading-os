'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {weeklyOutlook,type WeeklyData} from '@/lib/weekly-outlook';
const macroLink=(c:string)=>c==='USD'?'/dxy':c==='EUR'?'/euro':`/${c.toLowerCase()}`;
export function PairMacroSnapshot({pair}:{pair:string}){
 const [data,setData]=useState<WeeklyData|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();fetch('/api/macro/weekly',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('Macro data unavailable');return r.json();}).then(setData).catch(e=>{if(e.name!=='AbortError')setError('Macro data unavailable');});return()=>controller.abort();},[]);
 if(!data)return <section className="rounded-lg border p-4 text-sm">{error||'Loading macro summary…'}</section>;
 const view=weeklyOutlook(data);
 const currencies=[pair.slice(0,3),pair.slice(3)];
 const rows=currencies.map(c=>view.rows.find(r=>r.input.currency===c));
 const comparison=view.pairs.find(p=>p.pair===pair);
 return <section className="rounded-xl border bg-card p-4 md:p-5">
 <h3 className="text-lg font-semibold">{pair} · Macro summary</h3>
 <p className="mt-1 text-xs text-muted-foreground">Automatically derived from Macro Dashboard sources · latest data {new Intl.DateTimeFormat('et-EE',{dateStyle:'medium',timeZone:'Europe/Tallinn'}).format(new Date(data.asOf))}. This is evidence, not a price forecast.</p>
 <div className="mt-4 grid gap-3 sm:grid-cols-2">{currencies.map((c,i)=>{const r=rows[i];const inflation=r?.input.macro?.inflation.at(-1);return <div className="rounded-lg border p-3" key={c}><div className="flex items-center justify-between gap-2"><Link href={macroLink(c)} className="font-semibold underline">{c}</Link><span className="text-sm">{r?.status??'Unavailable'}</span></div><p className="mt-2 text-sm">2Y yield change: {r?.drivers[1]?.value==null?'Unavailable':`${r.drivers[1].value>0?'+':''}${r.drivers[1].value.toFixed(1)} bp / 1W`}</p><p className="text-sm">Inflation: {inflation?`${inflation.yoy.toFixed(2)}% YoY (${inflation.date})`:'Unavailable'}</p></div>;})}</div>
 <p className="mt-3 text-sm"><strong>Relative macro picture:</strong> {comparison?.reason||'No comparable evidence available.'}</p>
 <p className="mt-2 text-xs text-muted-foreground">For GDP, labour, rates and full history, open the currency links above. Missing data is not treated as neutral evidence.</p>
 </section>;
}
