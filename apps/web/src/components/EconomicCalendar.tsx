'use client';
import {useEffect,useState} from 'react';
import {ForecastCatalysts} from './ForecastCatalysts';
import {FOREX_PAIRS} from '@/lib/pair-macro';
export function EconomicCalendar(){
 const [week,setWeek]=useState(''),[pair,setPair]=useState('ALL');
 useEffect(()=>{const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tallinn',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);setWeek(d.toISOString().slice(0,10));},[]);
 return <div className="space-y-6"><header><h1 className="text-3xl font-bold">Economic Calendar</h1><p className="mt-2 text-muted-foreground">This week’s scheduled economic releases and central bank events. Focus on the news that can change your pair’s theme.</p>{week&&<p className="mt-2 text-sm text-muted-foreground">Week starting {new Intl.DateTimeFormat('en-GB',{dateStyle:'long',timeZone:'UTC'}).format(new Date(week+'T00:00:00Z'))} · Europe/Tallinn</p>}</header><label className="block max-w-xs text-sm">Filter by pair<select className="mt-2 w-full rounded border bg-background p-3" value={pair} onChange={e=>setPair(e.target.value)}><option value="ALL">All major currencies</option>{FOREX_PAIRS.map(p=><option key={p}>{p}</option>)}</select></label>{week?<ForecastCatalysts pair={pair} week={week} expanded/>:<p role="status">Opening economic calendar…</p>}</div>;
}
