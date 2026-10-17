import {euroTwoYearRows} from '@/lib/weekly-euro-yields';
import {parseWeeklyEvents} from '@/lib/weekly-calendar';
import {NextResponse} from 'next/server';
import {currencies,type WeeklyInput} from '@/lib/weekly-outlook';
import {comparisonSnapshot} from '@/lib/pair-macro-server';
import {internationalYields} from '@/lib/international-yields-server';
import {parseBankWatch,watchBanks} from '@/lib/central-bank-watch';
import {download,fred} from '@/lib/international-macro-server';
import type {Country} from '@/lib/international-macro';

export const maxDuration=60;
export async function GET(request:Request){
 const pair=new URL(request.url).searchParams.get('pair')?.toUpperCase();
 const requested=pair&&/^[A-Z]{6}$/.test(pair)?[pair.slice(0,3),pair.slice(3)]:null;
 const selected=requested&&requested.every(c=>currencies.includes(c as typeof currencies[number]))?currencies.filter(c=>requested.includes(c)):currencies;
 const asOf=new Date().toISOString();
 const calendarTask=download('https://nfs.faireconomy.media/ff_calendar_thisweek.json').then(r=>r.json()).then(json=>({events:parseWeeklyEvents(json,asOf),error:null,source:'https://www.forexfactory.com/calendar'})).catch(()=>({events:[],error:'Weekly calendar unavailable; check the official calendars below.',source:'https://www.forexfactory.com/calendar'}));
 const inputs:WeeklyInput[]=await Promise.all(selected.map(async currency=>{
  const tasks=await Promise.allSettled([
   comparisonSnapshot(currency),
   (currency==='CAD'||currency==='JPY'?Promise.resolve(''):download(`https://centralbank.watch/${watchBanks[currency].path}/`).then(r=>r.text())).then(html=>parseBankWatch(html,currency)),
   currency==='EUR'?Promise.all(['2Y','10Y'].map(term=>download(`https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_${term}?startPeriod=${new Date(Date.now()-200*86400000).toISOString().slice(0,10)}&format=csvdata`).then(r=>r.text()).then(euroTwoYearRows))).then(([two,ten])=>{const tenMap=new Map((ten??[]).map(r=>[r.date,r.two]));return {country:'eur',rows:(two??[]).map(r=>({...r,ten:tenMap.get(r.date)??null})),source:'https://data.ecb.europa.eu/data/datasets/YC',definition:'ECB euro-area AAA fitted nominal 2Y and 10Y spot yields',note:'AAA fitted yields, not individual sovereign benchmark yields.'};}):currency==='USD'?Promise.all([fred('DGS2'),fred('DGS10')]).then(([two,ten])=>{const tenMap=new Map(ten.map(r=>[r.date,r.value]));return {country:'usd',rows:two.slice(-130).map(r=>({date:r.date,two:r.value,ten:tenMap.get(r.date)??null,thirty:null})),source:'https://fred.stlouisfed.org/series/DGS2',definition:'US Treasury constant-maturity 2Y and 10Y · FRED',note:'Daily observations; not live.'};}):internationalYields(currency.toLowerCase() as Country),
  ] as const);
  const [macro,watch,yields]=tasks;
  return {currency,macro:macro.status==='fulfilled'?macro.value:null,watch:watch.status==='fulfilled'?watch.value:null,yields:yields.status==='fulfilled'?yields.value:null,errors:tasks.flatMap((t,i)=>t.status==='rejected'?[["Macro","Expectations","Yields"][i]+' unavailable']:[])};
 }));
 return NextResponse.json({asOf,inputs,calendar:requested?{events:[],error:null,source:''}:await calendarTask});
}
