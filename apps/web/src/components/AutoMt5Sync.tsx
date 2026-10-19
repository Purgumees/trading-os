'use client';
import {useEffect} from 'react';
import {MT5_KEY,mt5Candidates,readMt5} from '@/lib/mt5-sync';
import {BEFORE_TRADE_KEY,readTradePlans,type TradePlan} from '@/lib/before-trade';
import {JOURNAL_ACCOUNTS_KEY,readJournalAccounts} from '@/lib/account-journal';

type Link={number:string;style:'swing'|'intraday';accountId:string;token:string};
type Connection={version:1;key:string;links:Link[]};
const ids=(s?:string)=>new Set((s||'').split('::').filter(Boolean));
const sameSource=(a?:string,b?:string)=>{const aa=ids(a),bb=ids(b);return [...aa].some(x=>bb.has(x));};

async function synchronize(){
 let imported=0, stale=0, failed=0;
 const raw=localStorage.getItem(MT5_KEY),accountRaw=localStorage.getItem(JOURNAL_ACCOUNTS_KEY);
 if(!raw||!accountRaw)return;
 const c=JSON.parse(raw) as Connection;
 if(c.version!==1||!Array.isArray(c.links)||!/^([a-f0-9]{64})$/.test(c.key))return;
 const accounts=readJournalAccounts(JSON.parse(accountRaw)).accounts;
 for(const link of c.links){
  const account=accounts.find(a=>a.id===link.accountId&&a.style===link.style);
  if(!account)continue;
  try{
   const response=await fetch('/api/mt5/snapshots',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+c.key},body:JSON.stringify({account:link.number}),cache:'no-store'});
   if(!response.ok){failed++;continue;}
   const body=await response.json();
   if(!body.snapshot){stale++;continue;}
   const snapshot=readMt5(body.snapshot);
   if(snapshot.account!==link.number)continue;
   const received=Date.parse(snapshot.receivedAt||'');
   if(!Number.isFinite(received)||Date.now()-received>15*60*1000){stale++;continue;}
   const candidates=mt5Candidates(snapshot,account).plans;
   if(!candidates.length)continue;
   const currentRaw=localStorage.getItem(BEFORE_TRADE_KEY);
   const current=currentRaw?readTradePlans(JSON.parse(currentRaw)):{version:1 as const,plans:[] as TradePlan[]};
   let changed=false;
   for(const candidate of candidates){
    const matches=current.plans.filter(p=>p.mt5Source&&sameSource(p.mt5Source,candidate.mt5Source));
    // Do not automatically collapse existing records with personal notes or charts.
    if(matches.length>1)continue;
    const previous=matches[0];
    if(previous&&(previous.style!==candidate.style||previous.journal.accountId!==candidate.journal.accountId))continue;
    if(previous){
     if(previous.mt5Source===candidate.mt5Source&&previous.journal.netPnl===candidate.journal.netPnl&&previous.journal.closedDate===candidate.journal.closedDate)continue;
     const next={...previous,pair:candidate.pair,direction:candidate.direction,mt5Source:candidate.mt5Source,updatedAt:new Date().toISOString(),journal:{...previous.journal,...candidate.journal,initialRisk:previous.journal.initialRisk,setup:previous.journal.setup,adherence:previous.journal.adherence,actualSession:previous.journal.actualSession,recordedWithoutPlan:previous.journal.recordedWithoutPlan}};
     current.plans=current.plans.map(p=>p.id===previous.id?next:p);
    }else current.plans.unshift(candidate);
    changed=true;
   }
   if(changed){
    readTradePlans(current);
    localStorage.setItem(BEFORE_TRADE_KEY,JSON.stringify(current));
    window.dispatchEvent(new Event('trading-os-journal-updated'));
    imported+=candidates.length;
   }
  }catch(e){failed++;console.warn('MT5 automatic journal sync skipped:',e);}
 }
 window.dispatchEvent(new CustomEvent('trading-os-mt5-sync-status',{detail:{at:new Date().toISOString(),imported,stale,failed}}));
}
export function AutoMt5Sync(){
 useEffect(()=>{
  let running=false;
  const run=async()=>{if(running||document.visibilityState!=='visible')return;running=true;try{await synchronize();}finally{running=false;}};
  void run();
  const timer=window.setInterval(()=>void run(),300000);
  const onVisible=()=>{if(document.visibilityState==='visible')void run();};
  const onFocus=()=>void run();
  document.addEventListener('visibilitychange',onVisible);
  window.addEventListener('focus',onFocus);
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('focus',onFocus);};
 },[]);
 return null;
}
