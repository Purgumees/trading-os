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
 <div className="mt-4 rounded-lg border p-3"><h4 className="font-semibold">1 · Mis eelmisel nädalal muutus?</h4><div className="mt-2 space-y-2">{currencies.map((c,i)=>{const r=rows[i];const weekly=r?.drivers.filter(d=>d.value!==null&&d.label.includes('1W'))??[];return <div key={c} className="text-sm"><strong>{c}:</strong> {weekly.length?weekly.map(d=>`${d.label.includes('yield')?'2Y tootlus':'Intressiootused'} ${d.value!>0?'+':''}${d.value!.toFixed(1)} bp (${d.period})`).join(' · '):'Kinnitatud nädalased muutused puuduvad.'}</div>;})}</div><p className="mt-2 text-xs text-muted-foreground">GDP, inflatsioon ja tööturg lisanduvad nädalamuutuste hulka ainult siis, kui on avaldatud uus vaatlus. Muutuse puudumine ei tähenda neutraalset mõju.</p></div>
 <h4 className="mt-5 font-semibold">2 · Praegune makroolukord</h4><div className="mt-3 grid gap-3 sm:grid-cols-2">{currencies.map((c,i)=>{const r=rows[i];const inflation=r?.input.macro?.inflation.at(-1);const evidence=r?.drivers.filter(d=>d.value!==null)??[];const movement=(d:typeof evidence[number])=>d.direction===1?'toetab tugevnemist':d.direction===-1?'survestab valuutat':'muutus väike';return <div className="rounded-lg border p-3" key={c}><div className="flex items-center justify-between gap-2"><Link href={macroLink(c)} className="font-semibold underline">{c}</Link><span className="text-sm">{r?.status??'Andmed puuduvad'}</span></div><p className="mt-2 text-sm">{r?.status==='Strengthening support'?'Olemasolevad makronäitajad toetavad valuutat.':r?.status==='Weakening support'?'Olemasolevad makronäitajad näitavad nõrgenevat toetust.':r?.status==='Mixed / neutral'?'Makronäitajad annavad vastuolulisi signaale.':'Usaldusväärseks hinnanguks ei ole piisavalt andmeid.'}</p><div className="mt-2 space-y-1 text-xs text-muted-foreground">{evidence.slice(0,3).map(d=><p key={d.label}>{d.label.replace('Expected rate · weekly repricing','Intressiootused').replace('2Y yield · 1W','2Y tootlus').replace('GDP · QoQ growth acceleration','Majanduskasvu muutus').replace(/Unemployment · .+ trend/,'Tööturu muutus')}: {d.value!>0?'+':''}{d.value!.toFixed(1)} {d.unit} — {movement(d)}</p>)}{inflation&&<p>Inflatsioon: {inflation.yoy.toFixed(1)}% YoY ({inflation.date}); kontekst, mitte automaatne valuutasignaal</p>}</div></div>;})}</div>
 <p className="mt-3 text-sm"><strong>{pair} fundamentaalne pilt:</strong> {comparison?.reason||'Võrreldavad makroandmed puuduvad.'}</p>
 <p className="mt-2 text-xs text-muted-foreground">Kokkuvõte põhineb olemasolevatel makroandmetel, mitte automaatsel hinnaprognoosil. Täielikud tabelid on valuutade makrolehtedel.</p>
 </section>;
}
