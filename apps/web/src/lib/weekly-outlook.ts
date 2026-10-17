import type {WeeklyEvent} from './weekly-calendar';
import {FOREX_PAIRS,type Currency,type ComparisonSnapshot} from './pair-macro';
import {pairSupport} from './pair-support';
import type {YieldData} from './international-yields';
import type {BankWatch} from './central-bank-watch';
import {comparisonSeries} from './pair-macro';
export const currencies:Currency[]=['EUR','USD','GBP','JPY','AUD','CAD','NZD'];
export type WeeklyYields=Omit<YieldData,'country'>&{country:string};
export type WeeklyInput={currency:Currency;macro:ComparisonSnapshot|null;watch:BankWatch|null;yields:WeeklyYields|null;errors:string[]};
export type WeeklyData={asOf:string;inputs:WeeklyInput[];calendar?:{events:WeeklyEvent[];error:string|null;source:string}};
export type Driver={label:string;value:number|null;unit:string;period:string;direction:number|null;reason:string};
const days=(a:string,b:string)=>(Date.parse(a)-Date.parse(b))/86400000;
const sign=(v:number,threshold:number)=>Math.abs(v)<threshold?0:Math.sign(v);
export function fridayYieldChange(rows:{date:string;two:number|null;ten:number|null}[],term:'two'|'ten',asOf:string){
 const now=new Date(asOf);const today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
 const weekday=today.getUTCDay();const daysSinceFriday=(weekday+2)%7;
 const lastFriday=new Date(today);lastFriday.setUTCDate(today.getUTCDate()-daysSinceFriday-(daysSinceFriday===0?7:0));
 const previousFriday=new Date(lastFriday);previousFriday.setUTCDate(lastFriday.getUTCDate()-7);
 const iso=(d:Date)=>d.toISOString().slice(0,10);
 const available=rows.filter(r=>r[term]!==null).sort((a,b)=>a.date.localeCompare(b.date));
 const pick=(friday:Date)=>{const cutoff=iso(friday);const earliest=new Date(friday);earliest.setUTCDate(friday.getUTCDate()-3);return available.findLast(r=>r.date<=cutoff&&r.date>=iso(earliest));};
 const start=pick(previousFriday),end=pick(lastFriday);
 return start&&end?{value:(end[term]!-start[term]!)*100,period:`${start.date} → ${end.date}`,start:start.date,end:end.date}:null;
}
export function currencyDrivers(input:WeeklyInput,asOf:string):Driver[]{
 const out:Driver[]=[];const m=input.watch?.meetings[0];const w=input.watch;
 const repricing=m&&m.weekAgo!==null&&w?.asOf&&days(asOf,w.asOf)>=0&&days(asOf,w.asOf)<=7?(m.expected-m.weekAgo)*100:null;
 out.push({label:'Expected rate · weekly repricing',value:repricing,unit:'bp',period:m?`Meeting ${m.date} · source ${w?.asOf}`:'No verified meeting history',direction:repricing===null?null:sign(repricing,1),reason:'Same meeting now versus week ago. Higher expected rates = potential support; independent model, not official forecast.'});
 for(const [term,label] of [['two','2Y'],['ten','10Y']] as const){const change=fridayYieldChange(input.yields?.rows??[],term,asOf);out.push({label:`${label} yield · Friday-to-Friday`,value:change?.value??null,unit:'bp',period:change?.period??'Friday observations unavailable',direction:change?sign(change.value,1):null,reason:input.yields?.definition??'No comparable government yield feed connected.'});}
 const series=input.macro?comparisonSeries(input.macro):null;const g=series?.gdp.at(-1),old=series?.gdp.at(-2);
 const quarterEnd=(p:string)=>Date.UTC(Number(p.slice(0,4)),Number(p.at(-1))*3,0);
 const gFresh=g&&old&&Date.parse(asOf)>=quarterEnd(g.date)&&Date.parse(asOf)-quarterEnd(g.date)<=150*86400000;
 const consecutive=g&&old&&quarterEnd(g.date)-quarterEnd(old.date)<100*86400000;
 const gv=gFresh&&consecutive?g!.value-old!.value:null;
 out.push({label:'GDP · QoQ growth acceleration',value:gv,unit:'pp',period:g&&old?`${old.date} → ${g.date}`:'Unavailable',direction:gv===null?null:sign(gv,.1),reason:'Change in real quarterly growth, not annualized GDP or currency prediction.'});
 const jobs=series?.jobs.at(-1);let prior:string|null=null;
 if(jobs){if(input.macro?.quarterlyLabour){const year=Number(jobs.date.slice(0,4)),q=Number(jobs.date.at(-1));prior=q===1?`${year-1}-Q4`:`${year}-Q${q-1}`;}else{const d=new Date(`${jobs.date}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()-3);prior=d.toISOString().slice(0,7);}}
 const oldJobs=series?.jobs.find(x=>x.date===prior);
 const end=jobs?(jobs.date.includes('Q')?quarterEnd(jobs.date):Date.UTC(Number(jobs.date.slice(0,4)),Number(jobs.date.slice(5,7)),0)):0;
 const jv=jobs&&oldJobs&&Date.parse(asOf)>=end&&Date.parse(asOf)-end<=(input.macro?.quarterlyLabour?150:100)*86400000?jobs.value-oldJobs.value:null;
 out.push({label:`Unemployment · ${input.macro?.quarterlyLabour?'1Q':'3M'} trend`,value:jv,unit:'pp',period:jobs&&prior?`${prior} → ${jobs.date}`:'Unavailable',direction:jv===null?null:-sign(jv,.1),reason:'A fall in unemployment receives support. Monthly and quarterly measures are labelled separately.'});
 return out;
}
export function weeklyOutlook(data:WeeklyData){
 const rows=data.inputs.map(input=>{const drivers=currencyDrivers(input,data.asOf);const available=drivers.filter(x=>x.direction!==null).length;const positive=drivers.filter(x=>x.direction===1).length,negative=drivers.filter(x=>x.direction===-1).length;const status=available<3?'Insufficient coverage':positive>=2&&negative===0?'Strengthening support':negative>=2&&positive===0?'Weakening support':'Mixed / neutral';return {input,drivers,available,positive,negative,status};});
 const pairs=FOREX_PAIRS.map(pair=>{const b=rows.find(r=>r.input.currency===pair.slice(0,3)),q=rows.find(r=>r.input.currency===pair.slice(3));if(!b?.input.macro||!q?.input.macro)return {pair,winner:null,reason:'Macro data unavailable',signals:[],yieldGapChange:null,yieldPeriod:null};
 const result=pairSupport({pair,base:b.input.macro,quote:q.input.macro},data.asOf);
 const quoteYields=new Map((q.input.yields?.rows??[]).filter(r=>r.two!==null).map(r=>[r.date,r.two!]));
 const matched=(b.input.yields?.rows??[]).flatMap(r=>r.two!==null&&quoteYields.has(r.date)?[{date:r.date,value:r.two-quoteYields.get(r.date)!}]:[]);
 const delta=fridayYieldChange(matched.map(r=>({...r,two:r.value,ten:null})), 'two',data.asOf);
 const gap=delta?.value??null;
 const yieldPeriod=delta?.period??null;
 const yieldDirection=gap===null?null:sign(gap,1);
 const macroDirection=result.winner===b.input.currency?1:result.winner===q.input.currency?-1:0;
 const winner=macroDirection!==0&&yieldDirection===macroDirection?result.winner:null;
 return {pair,winner,reason:winner?`Matched macro support and weekly 2Y differential both favour ${winner}.`:'Wait: macro and matched-date weekly yield evidence do not provide aligned support.',signals:result.signals,yieldGapChange:gap,yieldPeriod};});
 const repricing=rows.filter(r=>r.drivers[0]!.direction!==null&&r.drivers[0]!.direction!==0);
 const theme=repricing.length?`Rate repricing watch: ${repricing.map(r=>`${r.input.currency} expected rates ${r.drivers[0]!.direction===1?'higher':'lower'}`).join('; ')}.`:'No verified common weekly rate-repricing theme in the connected feeds.';
 return {rows,pairs,theme};
}
export function outlookWeek(asOf:string){const local=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tallinn',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(asOf));const d=new Date(`${local}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+(d.getUTCDay()===0?1:-((d.getUTCDay()+6)%7))); return d.toISOString().slice(0,10);}
