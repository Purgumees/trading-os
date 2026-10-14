import type {TradePlan} from './before-trade';
export const JOURNAL_ACCOUNTS_KEY='trading-journal-accounts-v1';
export type JournalAccount={id:string;name:string;style:'swing'|'intraday';environment:'demo'|'live';currency:string;initialBalance:number;archived:boolean};
export type JournalAccounts={version:1;accounts:JournalAccount[]};
export type ExecutionReview={accountId:string;state:'planned'|'open'|'closed'|'not_taken';setup:string;actualDate:string;actualTime:string;actualSession:string;timezone:string;actualEntry:string;exitPrice:string;closedDate:string;closedTime:string;netPnl:string;initialRisk:string;adherence:'unknown'|'followed'|'deviated';recordedWithoutPlan:boolean};
export const blankExecution=():ExecutionReview=>({accountId:'',state:'planned',setup:'',actualDate:'',actualTime:'',actualSession:'',timezone:'',actualEntry:'',exitPrice:'',closedDate:'',closedTime:'',netPnl:'',initialRisk:'',adherence:'unknown',recordedWithoutPlan:false});
export function readExecution(v:unknown):ExecutionReview{const e=v as ExecutionReview;if(!e||!['planned','open','closed','not_taken'].includes(e.state)||!['unknown','followed','deviated'].includes(e.adherence)||typeof e.recordedWithoutPlan!=='boolean')throw Error('Invalid journal execution');for(const key of Object.keys(blankExecution()) as (keyof ExecutionReview)[])if(key!=='recordedWithoutPlan'&&(typeof e[key]!=='string'||(e[key] as string).length>20000))throw Error('Invalid execution field');return e;}
export function readJournalAccounts(v:unknown):JournalAccounts{const d=v as JournalAccounts;if(!d||d.version!==1||!Array.isArray(d.accounts)||d.accounts.length>100)throw Error('Invalid journal accounts');const ids=new Set<string>();for(const a of d.accounts){if(!a||typeof a.id!=='string'||!a.id||ids.has(a.id)||typeof a.name!=='string'||!a.name.trim()||a.name.length>200||!['swing','intraday'].includes(a.style)||!['demo','live'].includes(a.environment)||typeof a.currency!=='string'||!/^[A-Z]{3}$/.test(a.currency)||!Number.isFinite(a.initialBalance)||a.initialBalance<0||typeof a.archived!=='boolean')throw Error('Invalid journal account');ids.add(a.id);}return d;}
export const numeric=(v:string):number|null=>v.trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
export const validDay=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const validTime=(v:string)=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
export function executionTimestamp(day:string,time:string,zone:string):number|null{
 if(!validDay(day)||!validTime(time))return null;
 const local=Date.parse(`${day}T${time}:00Z`);
 try{
  const f=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const wall=(t:number)=>{const parts=Object.fromEntries(f.formatToParts(new Date(t)).map(p=>[p.type,p.value]));return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute));};
  let utc=local;for(let i=0;i<4;i++)utc+=local-wall(utc);
  if(wall(utc)!==local)return null;
  // Reject repeated local times around DST transitions; record those in UTC.
  if([-7200000,-3600000,-1800000,1800000,3600000,7200000].some(offset=>wall(utc+offset)===local))return null;
  return utc;
 }catch{return null;}
}
export function executionIssues(p:TradePlan,accounts:JournalAccount[]){const e=p.journal,a=accounts.find(a=>a.id===e.accountId),issues:string[]=[];if(!a)issues.push('Choose a journal account.');else if(a.style!==p.style)issues.push('Account style must match the trade.');if(e.state==='open'||e.state==='closed'){if(!p.pair.trim())issues.push('Enter an instrument.');if(!validDay(e.actualDate)||!validTime(e.actualTime)||!e.timezone.trim())issues.push('Enter actual entry date, time and timezone.');if((numeric(e.actualEntry)??0)<=0)issues.push('Enter the actual entry price.');}if((e.state==='open'||e.state==='closed')&&executionTimestamp(e.actualDate,e.actualTime,e.timezone)===null)issues.push('Use a valid IANA timezone (e.g. Europe/Tallinn) or UTC with an unambiguous entry time.');if(e.state==='closed'){if(!validDay(e.closedDate)||!validTime(e.closedTime))issues.push('Enter closing date and time.');if(executionTimestamp(e.closedDate,e.closedTime,e.timezone)===null)issues.push('Use a valid closing time and timezone; record ambiguous DST times in UTC.');if(e.closedDate<e.actualDate||(e.closedDate===e.actualDate&&e.closedTime<e.actualTime))issues.push('Closing time cannot precede entry in the same timezone.');if(numeric(e.netPnl)===null)issues.push('Enter net P&L including fees.');if((numeric(e.exitPrice)??0)<=0)issues.push('Enter actual exit price.');}return issues;}
export function resultR(p:TradePlan){const e=p.journal,pnl=numeric(e.netPnl),risk=numeric(e.initialRisk);return e.state==='closed'&&pnl!==null&&risk!==null&&risk>0?pnl/risk:null;}
export function closedRows(plans:TradePlan[],accounts:JournalAccount[]){return plans.filter(p=>p.journal.state==='closed'&&!executionIssues(p,accounts).length).sort((a,b)=>executionTimestamp(a.journal.closedDate,a.journal.closedTime,a.journal.timezone)!-executionTimestamp(b.journal.closedDate,b.journal.closedTime,b.journal.timezone)!||a.id.localeCompare(b.id));}
// Group complete closed MT5 positions into trading ideas by opening time (max 2 minutes from first entry).
// Preserve non-MT5/manual records as separate ideas. Never mix accounts, symbols or directions.
export function ideaRows(rows:TradePlan[]):TradePlan[]{
 const groups:TradePlan[][]=[];
 const ordered=[...rows].sort((a,b)=>(executionTimestamp(a.journal.actualDate,a.journal.actualTime,a.journal.timezone)??Infinity)-(executionTimestamp(b.journal.actualDate,b.journal.actualTime,b.journal.timezone)??Infinity));
 for(const p of ordered){const time=executionTimestamp(p.journal.actualDate,p.journal.actualTime,p.journal.timezone);
 const group=p.mt5Source&&time!==null?groups.find(g=>{const first=g[0],start=executionTimestamp(first.journal.actualDate,first.journal.actualTime,first.journal.timezone);return Boolean(first.mt5Source)&&start!==null&&time>=start&&time-start<=120000&&first.journal.accountId===p.journal.accountId&&first.pair===p.pair&&first.direction===p.direction;}):undefined;
 if(group)group.push(p);else groups.push([p]);
 }
 return groups.map(g=>{if(g.length===1)return g[0];const first=g[0],last=[...g].sort((a,b)=>(executionTimestamp(b.journal.closedDate,b.journal.closedTime,b.journal.timezone)??0)-(executionTimestamp(a.journal.closedDate,a.journal.closedTime,a.journal.timezone)??0))[0];
 const pnl=g.reduce((s,p)=>s+(numeric(p.journal.netPnl)??0),0);
 const risks=g.map(p=>numeric(p.journal.initialRisk));const riskKnown=risks.every(n=>n!==null&&n>0);
 return {...first,id:first.id,journal:{...first.journal,netPnl:String(pnl),initialRisk:riskKnown?String(risks.reduce((s,n)=>s+n!,0)):'',closedDate:last.journal.closedDate,closedTime:last.journal.closedTime}};
 });
}
export function statistics(rows:TradePlan[]){let sumR=0,peak=0,drawdownR=0;const rRows=rows.filter(p=>resultR(p)!==null),rs=rRows.map(p=>resultR(p)!);for(const r of rs){sumR+=r;peak=Math.max(peak,sumR);drawdownR=Math.max(drawdownR,peak-sumR);}const wins=rows.filter(p=>numeric(p.journal.netPnl)!>0).length,losses=rows.filter(p=>numeric(p.journal.netPnl)!<0).length;return {count:rows.length,wins,losses,breakeven:rows.length-wins-losses,winRate:rows.length?wins/rows.length*100:null,totalR:rs.length?sumR:null,averageR:rs.length?sumR/rs.length:null,averageWinR:rs.some(r=>r>0)?rs.filter(r=>r>0).reduce((a,b)=>a+b,0)/rs.filter(r=>r>0).length:null,averageLossR:rs.some(r=>r<0)?rs.filter(r=>r<0).reduce((a,b)=>a+b,0)/rs.filter(r=>r<0).length:null,rCount:rs.length,drawdownR:rs.length?drawdownR:null,followed:rows.filter(p=>p.journal.adherence==='followed').length,deviated:rows.filter(p=>p.journal.adherence==='deviated').length,unknown:rows.filter(p=>p.journal.adherence==='unknown').length};}
export function groupStatistics(rows:TradePlan[],key:(p:TradePlan)=>string){const groups=new Map<string,TradePlan[]>();for(const p of rows){const k=key(p)||'Unclassified';groups.set(k,[...(groups.get(k)??[]),p]);}return [...groups].map(([name,items])=>({name,...statistics(items)}));}
export function accountPerformance(rows:TradePlan[],account:JournalAccount){const own=rows.filter(p=>p.journal.accountId===account.id);let balance=account.initialBalance,peak=balance,drawdown=0;for(const p of own){balance+=numeric(p.journal.netPnl)!;peak=Math.max(peak,balance);drawdown=Math.max(drawdown,peak-balance);}return {balance,netPnl:balance-account.initialBalance,drawdown};}
