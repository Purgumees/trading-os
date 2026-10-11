import {currencies,outlookWeek} from './weekly-outlook';
export type WeeklyEvent={title:string;currency:string;date:string;impact:string;forecast:string;previous:string;meaning:string};
export function eventMeaning(title:string){
 if(/unemployment|claim/i.test(title))return 'Higher unemployment / claims than expected can weaken the labour outlook. Check employment growth and revisions before changing bias.';
 if(/CPI|PCE|PPI|inflation/i.test(title))return 'An upside inflation surprise can reduce expected cuts / increase hike expectations; confirm in short-term rates. PPI is not consumer inflation.';
 if(/GDP|PMI|sales|employment|payroll/i.test(title))return 'A stronger growth / activity / employment surprise can support the outlook; revisions and rate repricing matter.';
 if(/rate|policy|minutes|speaks/i.test(title))return 'Watch changes in the policy outlook versus market pricing. Tone alone is insufficient: check expected rates and 2Y response.';
 return 'Compare the release with consensus and revisions, then check whether rates and price confirm a change in the weekly theme.';
}
export function parseWeeklyEvents(value:unknown,asOf:string):WeeklyEvent[]{
 if(!Array.isArray(value))throw Error('Calendar format unavailable');
 const start=outlookWeek(asOf),end=new Date(Date.parse(start)+7*86400000).toISOString().slice(0,10);
 const localDay=(s:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tallinn',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
 return value.flatMap(r=>{
  if(!r||typeof r.title!=='string'||!currencies.includes(r.country)||!['High','Medium'].includes(r.impact)||typeof r.date!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(r.date)||!Number.isFinite(Date.parse(r.date)))return [];
  const day=localDay(r.date);if(day<start||day>=end)return [];
  return [{title:r.title,currency:r.country,date:new Date(r.date).toISOString(),impact:r.impact,forecast:typeof r.forecast==='string'?r.forecast:'',previous:typeof r.previous==='string'?r.previous:'',meaning:eventMeaning(r.title)}];
 }).sort((a,b)=>a.date.localeCompare(b.date));
}
