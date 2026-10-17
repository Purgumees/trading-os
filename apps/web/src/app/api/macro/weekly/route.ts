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
   currency==='EUR'?download(`https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y?startPeriod=${new Date(Date.now()-200*86400000).toISOString().slice(0,10)}&format=csvdata`).then(r=>r.text()).then(csv=>({country:'eur',rows:euroTwoYearRows(csv),source:'https://data.ecb.europa.eu/data/datasets/YC/YC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y',definition:'ECB euro-area AAA fitted nominal 2Y spot yield · continuous compounding',note:'AAA issuer subset, not a single euro-area Treasury benchmark; yield definitions differ across countries.'})):currency==='USD'?fred('DGS2').then(rows=>({country:'usd',rows:rows.slice(-130).map(r=>({date:r.date,two:r.value,ten:null,thirty:null})),source:'https://fred.stlouisfed.org/series/DGS2',definition:'US Treasury constant-maturity 2Y · FRED',note:'Daily observations; not live.'})):internationalYields(currency.toLowerCase() as Country),
  ] as const);
  const [macro,watch,yields]=tasks;
  return {currency,macro:macro.status==='fulfilled'?macro.value:null,watch:watch.status==='fulfilled'?watch.value:null,yields:yields.status==='fulfilled'?yields.value:null,errors:tasks.flatMap((t,i)=>t.status==='rejected'?[["Macro","Expectations","Yields"][i]+' unavailable']:[])};
 }));
 return NextResponse.json({asOf,inputs,calendar:requested?{events:[],error:null,source:''}:await calendarTask});
}
