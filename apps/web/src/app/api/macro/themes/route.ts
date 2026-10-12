import {NextResponse} from 'next/server';
import {GET as weekly} from '../weekly/route';
import {fred} from '@/lib/international-macro-server';
import {forexSeries,dollarValues} from '@/lib/pair-theme';
import type {ThemeData} from '@/lib/pair-theme';
import type {Currency} from '@/lib/pair-macro';
export const maxDuration=60;
export async function GET(){
 const weeklyTask=weekly().then(r=>r.json());
 const results=await Promise.allSettled(Object.entries(forexSeries).map(async([currency,series])=>({currency:currency as Currency,rows:dollarValues(await fred(series.id),series.inverse)})));
 const prices:ThemeData['prices']={};const errors:string[]=[];
 results.forEach((r,i)=>{if(r.status==='fulfilled')prices[r.value.currency]=r.value.rows;else errors.push(`${Object.keys(forexSeries)[i]} daily FX history unavailable`);});
 const allDates=[...new Set(Object.values(prices).flatMap(rows=>rows?.map(r=>r.date)??[]))];prices.USD=allDates.map(date=>({date,value:1}));
 return NextResponse.json({weekly:await weeklyTask,prices,errors});
}
