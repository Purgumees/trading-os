import {blankExecution,readExecution,type ExecutionReview} from './account-journal';
import {validWeek} from './weekly-forecast';
export const BEFORE_TRADE_KEY='trading-before-trade-v1';
export type TradePlan={mt5Source?:string;journal:ExecutionReview;id:string;createdAt:string;updatedAt:string;style:'swing'|'intraday';pair:string;direction:'long'|'short';title:string;date:string;time:string;session:string;timezone:string;week:string;forecastSnapshot:string;exampleId:string;exampleSnapshot:string;reason:string;invalidation:string;newsPlan:string;entry:string;stop:string;target:string;balance:string;riskPercent:string;checklist:{id:string;label:string;checked:boolean}[];beforeImages:string[];afterImage:string;readyAt:string;outcome:'pending'|'win'|'loss'|'breakeven'|'not_taken';actualR:string;resultNotes:string;lesson:string;archived:boolean};
export type TradePlans={version:1;plans:TradePlan[]};
export function newTradePlan(week:string):TradePlan{return {journal:blankExecution(),id:crypto.randomUUID(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),style:'swing',pair:'EURUSD',direction:'long',title:'',date:'',time:'',session:'',timezone:'',week,forecastSnapshot:'',exampleId:'',exampleSnapshot:'',reason:'',invalidation:'',newsPlan:'',entry:'',stop:'',target:'',balance:'',riskPercent:'',checklist:[],beforeImages:['','',''],afterImage:'',readyAt:'',outcome:'pending',actualR:'',resultNotes:'',lesson:'',archived:false};}
export function riskSummary(p:Pick<TradePlan,'entry'|'stop'|'target'|'direction'|'balance'|'riskPercent'>){
 const number=(s:string)=>s.trim()!==''&&Number.isFinite(Number(s))?Number(s):null;
 const entry=number(p.entry),stop=number(p.stop),target=number(p.target),balance=number(p.balance),percent=number(p.riskPercent);
 const valid=entry!==null&&stop!==null&&target!==null&&entry>0&&stop>0&&target>0&&(p.direction==='long'?stop<entry&&target>entry:stop>entry&&target<entry);
 return {valid,rr:valid?Math.abs(target!-entry!)/Math.abs(entry!-stop!):null,riskAmount:balance!==null&&balance>0&&percent!==null&&percent>0&&percent<=100?balance*percent/100:null};
}
export function readiness(p:TradePlan){const issues:string[]=[];
 if(!p.pair.trim())issues.push('Choose a pair / instrument.');if(!p.date||!p.time||!p.session.trim()||!p.timezone.trim())issues.push('Complete trade date, time, session and timezone.');
 if(!p.reason.trim()||!p.invalidation.trim())issues.push('Write the entry confirmation and invalidation.');if(!p.newsPlan.trim())issues.push('Write your plan for upcoming news.');
 if(!riskSummary(p).valid)issues.push('Set valid entry, stop and target for the chosen direction.');if(!p.riskPercent.trim()||!Number.isFinite(Number(p.riskPercent))||Number(p.riskPercent)<=0||Number(p.riskPercent)>100)issues.push('Enter a valid risk percentage.');
 if(!p.beforeImages.some(Boolean))issues.push('Add at least one before-trade chart.');if(!p.checklist.length||p.checklist.some(c=>!c.label.trim()||!c.checked))issues.push('Add your own checklist and complete every item.');
 return issues;
}
export function readTradePlans(raw:unknown):TradePlans{const v=raw as TradePlans;if(!v||v.version!==1||!Array.isArray(v.plans)||v.plans.length>1000)throw Error('Invalid Before Trade backup');const ids=new Set<string>();
 for(const p of v.plans){if(!p||!['swing','intraday'].includes(p.style)||!['long','short'].includes(p.direction)||!['pending','win','loss','breakeven','not_taken'].includes(p.outcome)||typeof p.archived!=='boolean')throw Error('Invalid trade plan');
 if(p.mt5Source!==undefined&&(typeof p.mt5Source!=='string'||p.mt5Source.length>500))throw Error('Invalid MT5 source');
 if(p.journal===undefined)p.journal=blankExecution();readExecution(p.journal);
 for(const k of Object.keys(newTradePlan('2026-10-12')) as (keyof TradePlan)[]){if(['journal','archived','checklist','beforeImages'].includes(k))continue;if(typeof p[k]!=='string'||(p[k] as string).length>20000)throw Error('Invalid plan field');}
 if(!p.id||ids.has(p.id)||!validWeek(p.week)||!Number.isFinite(Date.parse(p.createdAt))||!Number.isFinite(Date.parse(p.updatedAt))||(p.readyAt&&!Number.isFinite(Date.parse(p.readyAt))))throw Error('Invalid plan identity or date');ids.add(p.id);
 if(!Array.isArray(p.beforeImages)||p.beforeImages.length!==3||p.beforeImages.some(x=>typeof x!=='string'||x.length>20000)||!Array.isArray(p.checklist)||p.checklist.length>100||p.checklist.some(c=>!c||typeof c.id!=='string'||typeof c.label!=='string'||c.label.length>1000||typeof c.checked!=='boolean')||new Set(p.checklist.map(c=>c.id)).size!==p.checklist.length)throw Error('Invalid checklist or chart fields');}
 return v;
}
