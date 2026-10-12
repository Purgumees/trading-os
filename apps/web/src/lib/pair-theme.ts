import review from './data/pair-themes-review.json';
import {FOREX_PAIRS,type ForexPair,type Currency} from './pair-macro';
import {weeklyOutlook,type WeeklyData} from './weekly-outlook';
import type {Observation} from './international-macro';
import {yieldChanges} from './international-yields';
export type ThemeData={weekly:WeeklyData;prices:Partial<Record<Currency,Observation[]>>;errors:string[]};
export const themeReview=review;
export function pairPriceRows(pair:ForexPair,prices:ThemeData['prices']){
 const b=prices[pair.slice(0,3) as Currency]??[],q=prices[pair.slice(3) as Currency]??[];const quote=new Map(q.map(r=>[r.date,r.value]));
 return b.flatMap(r=>quote.has(r.date)&&r.value>0&&quote.get(r.date)!>0?[{date:r.date,value:r.value/quote.get(r.date)!}]:[]).sort((a,b)=>a.date.localeCompare(b.date));
}
export function themeState(pair:ForexPair,data:ThemeData){
 const assessment=weeklyOutlook(data.weekly).pairs.find(p=>p.pair===pair)!;
 const rows=pairPriceRows(pair,data.prices),rateEnd=assessment.yieldPeriod?.split(' → ')[1],changes=yieldChanges(rateEnd?rows.filter(r=>r.date<=rateEnd):rows,r=>r.value,1),latest=changes.latest,week=changes.changes.oneWeek;
 const age=latest?(Date.parse(data.weekly.asOf)-Date.parse(latest.date))/86400000:Infinity;
 const priceChange=latest&&week&&age>=0&&age<=7?(latest.value/week.previous-1)*100:null;
 const gap=assessment.yieldGapChange;
 const rateDirection=gap===null?null:Math.abs(gap)<1?0:Math.sign(gap);
 const priceDirection=priceChange===null?null:Math.abs(priceChange)<.1?0:Math.sign(priceChange);
 const pricePeriod=latest&&week?`${week.date} → ${latest.date}`:null;
 const matchedWindow=pricePeriod!==null&&pricePeriod===assessment.yieldPeriod;
 const newsAge=(Date.parse(data.weekly.asOf)-Date.parse(review.reviewedAt))/86400000;
 const newsFresh=newsAge>=0&&newsAge<=7;
 const state=!newsFresh?'Uudiste ülevaatus aegunud':rateDirection===null||priceDirection===null||!matchedWindow?'Automaatseks hinnanguks andmeid napib':rateDirection===0||priceDirection===0?'Teema kinnitus ebaselge':rateDirection===priceDirection?rateDirection===1?'Intressi- ja hinnapool toetavad tõusustsenaariumi':'Intressi- ja hinnapool toetavad langusstsenaariumi':'Intressid ja hind annavad vastukäiva pildi';
 return {pair,definition:review.pairs[pair],assessment,rows,priceChange,pricePeriod,state,newsFresh,latest,evidence:review.evidence.filter(e=>review.pairs[pair].evidenceIds.includes(e.id))};
}
export const forexSeries={EUR:{id:'DEXUSEU',inverse:false},GBP:{id:'DEXUSUK',inverse:false},JPY:{id:'DEXJPUS',inverse:true},CAD:{id:'DEXCAUS',inverse:true},AUD:{id:'DEXUSAL',inverse:false},NZD:{id:'DEXUSNZ',inverse:false}};
export function dollarValues(rows:Observation[],inverse:boolean){return rows.filter(r=>r.value>0&&Number.isFinite(r.value)).map(r=>({date:r.date,value:inverse?1/r.value:r.value}));}
export function isThemePair(pair:string):pair is ForexPair{return FOREX_PAIRS.includes(pair as ForexPair);}
