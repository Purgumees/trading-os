'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
type Currency='USD'|'EUR'|'GBP'|'JPY'|'AUD'|'CAD'|'NZD';
type Bias='Moderately Bearish'|'Bearish'|'Neutral'|'Moderately Bullish'|'Bullish'|'Unclear';
type Entry={bias:Bias;changed:string;drivers:string;catalysts:string;invalidation:string;reviewed:string};
const currencies:Currency[]=['USD','EUR','GBP','JPY','AUD','CAD','NZD'];
const empty:Entry={bias:'Unclear',changed:'',drivers:'',catalysts:'',invalidation:'',reviewed:''};
const usd:Entry={
 bias:'Moderately Bearish',
 changed:'Working thesis for 19–23 Oct 2026: Fed repricing and falling US Treasury yields have weakened USD support. Distinguish dovish disinflation from growth-related risk aversion. Verify all current readings before trading.',
 drivers:'FedWatch: compare current probabilities with last week.\nUS 2Y / 10Y / 30Y: record latest levels and 1W changes.\n10Y real yield and breakeven inflation: identify which component drove nominal yields.\nRisk sentiment: credit spreads and equity weakness can reverse USD weakness.',
 catalysts:'20 Oct: US housing data (verify calendar).\n21 Oct: US 20Y Treasury auction (verify schedule).\n22 Oct: weekly initial jobless claims (verify schedule).\n23 Oct: US flash PMI and inflation expectations (verify releases).',
 invalidation:'USD bearish thesis weakens if US front-end yields and hawkish Fed pricing rebound, or severe risk-off demand supports USD. Reassess after each high-impact release.',
 reviewed:'Working draft · 17 Oct 2026 · Not a live-data verification'
};
export function WeeklyFundamentalBias({week,initialCurrency,locked=false}:{week:string;initialCurrency?:Currency;locked?:boolean}){
 const [currency,setCurrency]=useState<Currency>(initialCurrency??'USD');
 const [entries,setEntries]=useState<Record<Currency,Entry>>(()=>Object.fromEntries(currencies.map(c=>[c,{...empty}])) as Record<Currency,Entry>);
 const [loaded,setLoaded]=useState(false);
 const [status,setStatus]=useState('');
 useEffect(()=>{setLoaded(false);const key='trading-os-fundamental-v1-'+week;try{const saved=localStorage.getItem(key);if(saved){const data=JSON.parse(saved) as Partial<Record<Currency,Entry>>;setEntries(Object.fromEntries(currencies.map(c=>[c,{...empty,...data[c]}])) as Record<Currency,Entry>);}else{setEntries(Object.fromEntries(currencies.map(c=>[c,c==='USD'&&week==='2026-10-19'?{...usd}:{...empty}])) as Record<Currency,Entry>);}}catch{setEntries(Object.fromEntries(currencies.map(c=>[c,{...empty}])) as Record<Currency,Entry>);setStatus('Could not read saved fundamental plan.');}setLoaded(true);},[week]);
 useEffect(()=>{if(!loaded)return;try{localStorage.setItem('trading-os-fundamental-v1-'+week,JSON.stringify(entries));setStatus('Saved in this browser.');}catch{setStatus('Save failed. Export your notes manually.');}},[entries,loaded,week]);
 const patch=(key:keyof Entry,value:string)=>setEntries(prev=>({...prev,[currency]:{...prev[currency],[key]:value}}));
 const entry=entries[currency];
 return <section className="rounded-xl border bg-card p-4 md:p-5" aria-label="Weekly fundamental currency bias">
  <h2 className="text-xl font-semibold">3 · Weekly Fundamental Bias · Currency Macro</h2>
  <p className="mt-2 text-sm text-muted-foreground">Macro analysis only: central banks, yields, inflation, growth, labour and catalysts. No price-action signals. Notes are stored in this browser, separately from the weekly forecast backup.</p>
  {!locked&&<div className="mt-4 flex flex-wrap gap-2">{currencies.map(c=><button key={c} aria-pressed={currency===c} className={`rounded border px-3 py-2 text-sm ${currency===c?'bg-primary text-primary-foreground':''}`} onClick={()=>setCurrency(c)}>{c}</button>)}</div>}
  <div className="mt-3 flex flex-wrap gap-3 text-sm"><Link className="underline" href={currency==='USD'?'/dxy':currency==='EUR'?'/euro':`/${currency.toLowerCase()}`}>View {currency} macro data →</Link><Link className="underline" href="/forecast">Add technical charts in Weekly Forecast →</Link></div>
  <label className="mt-4 block text-sm font-medium">Fundamental direction<select value={entry.bias} onChange={e=>patch('bias',e.target.value)} className="mt-2 block w-full rounded border bg-background p-2">{(['Unclear','Moderately Bearish','Bearish','Neutral','Moderately Bullish','Bullish'] as Bias[]).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
  {([{key:'changed',label:'What changed last week'},{key:'drivers',label:'Fundamental drivers and evidence'},{key:'catalysts',label:'Next week catalysts'},{key:'invalidation',label:'What would invalidate this bias'},{key:'reviewed',label:'Data verification / last reviewed'}] as const).map(f=><label key={f.key} className="mt-4 block text-sm font-medium">{f.label}<textarea className="mt-2 min-h-28 w-full rounded border bg-background p-3 text-sm font-normal" value={entry[f.key]} maxLength={20000} onChange={e=>patch(f.key,e.target.value)}/></label>)}
  <p role="status" className="mt-3 text-xs text-muted-foreground">{loaded?status:'Loading notes…'} · Week starting {week}</p>
 </section>;
}
