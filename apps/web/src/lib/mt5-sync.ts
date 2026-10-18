import {newTradePlan,type TradePlan} from './before-trade';
import {validDay,executionTimestamp,type JournalAccount} from './account-journal';
export const MT5_KEY='trading-mt5-connection-v1';
export type Mt5Deal={ticket:string;position:string;symbol:string;type:number;entry:number;date:string;time:string;volume:number;price:number;profit:number;commission:number;swap:number;fee:number};
export type Mt5Snapshot={version:1;account:string;server:string;currency:string;mode:'demo'|'live';balance:number;timezone:string;deals:Mt5Deal[];openPositionIds:string[];receivedAt?:string};
export function readMt5(v:unknown):Mt5Snapshot{
 const s=v as Mt5Snapshot;if(!s||s.version!==1||!/^\d{5,20}$/.test(s.account)||typeof s.server!=='string'||s.server.length>200||!/^[A-Z]{3}$/.test(s.currency)||!['demo','live'].includes(s.mode)||!Number.isFinite(s.balance)||typeof s.timezone!=='string'||s.timezone.length>100||!Array.isArray(s.deals)||s.deals.length>5000||!Array.isArray(s.openPositionIds)||s.openPositionIds.length>1000||s.openPositionIds.some(id=>typeof id!=='string'||!/^\d+$/.test(id)))throw Error('Invalid MT5 snapshot');
 try{new Intl.DateTimeFormat('en-GB',{timeZone:s.timezone});}catch{throw Error('Set a valid broker IANA timezone in the EA.');}
 const ids=new Set<string>();for(const d of s.deals){if(!d||!/^\d+$/.test(d.ticket)||ids.has(d.ticket)||!/^\d+$/.test(d.position)||typeof d.symbol!=='string'||d.symbol.length>100||!Number.isInteger(d.type)||d.type<0||!Number.isInteger(d.entry)||d.entry<0||d.entry>3||!validDay(d.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time))throw Error('Invalid deal identity or date');ids.add(d.ticket);for(const k of ['volume','price','profit','commission','swap','fee'] as const)if(!Number.isFinite(d[k]))throw Error('Invalid deal number');if(d.volume<0||d.price<0)throw Error('Negative deal volume or price');}return s;
}
export function mt5Candidates(snapshot:Mt5Snapshot,account:JournalAccount){
 const s=readMt5(snapshot);if(account.currency!==s.currency||account.environment!==s.mode)throw Error('Journal account currency/environment must match MT5.');
 const groups=new Map<string,Mt5Deal[]>();const warnings:string[]=[];
 for(const d of s.deals){if(d.type!==0&&d.type!==1){if(d.profit||d.commission||d.swap||d.fee)warnings.push(`Deal ${d.ticket}: balance/standalone fee excluded from trade results.`);continue;}if(d.position==='0')continue;const g=groups.get(d.position)||[];g.push(d);groups.set(d.position,g);}
 const plans:TradePlan[]=[];
 for(const [id,raw] of groups){const g=raw.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)||Number(BigInt(a.ticket)-BigInt(b.ticket))),entries=g.filter(d=>d.entry===0),exits=g.filter(d=>d.entry===1||d.entry===3),first=entries[0];
 const fail=(why:string)=>warnings.push(`Position ${id}: ${why}; retained in raw snapshot, not imported.`);
 if(g.some(d=>d.entry===2)){fail('netting reversal requires manual review');continue;}if(!first){fail('opening deals missing');continue;}
 if(g.some(d=>d.price<=0)||exits.some(d=>d.date+d.time<first.date+first.time)){fail('invalid prices or closing chronology');continue;}
 if(entries.some(d=>d.type!==first.type)||exits.some(d=>d.type===first.type)||g.some(d=>d.symbol!==first.symbol)){fail('inconsistent direction or instrument');continue;}
 const vin=entries.reduce((n,d)=>n+d.volume,0),vout=exits.reduce((n,d)=>n+d.volume,0);if(vin<=0||vout>vin+1e-7){fail('inconsistent volume');continue;}
 const open=s.openPositionIds.includes(id),closed=Math.abs(vin-vout)<1e-7;if(open&&closed||!open&&!closed){fail('history and current positions do not reconcile');continue;}
 if(!closed){warnings.push(`Position ${id}: still open or partially closed; imported after full close.`);continue;}
 const last=exits.at(-1)!;if(executionTimestamp(first.date,first.time,s.timezone)===null||executionTimestamp(last.date,last.time,s.timezone)===null){fail('ambiguous/nonexistent broker clock; review timezone');continue;}
 const day=new Date(first.date+'T00:00:00Z');day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);const p=newTradePlan(day.toISOString().slice(0,10));p.mt5Source=`${s.server}|${s.account}|${id}`;p.id=`mt5-${s.account}-${encodeURIComponent(s.server)}-${id}`;p.style=account.style;p.pair=first.symbol;p.direction=first.type===0?'long':'short';p.title=`MT5 ${s.account} · position ${id}`;p.journal={...p.journal,accountId:account.id,state:'closed',actualDate:first.date,actualTime:first.time,timezone:s.timezone,actualEntry:String(entries.reduce((n,d)=>n+d.volume*d.price,0)/vin),exitPrice:String(exits.reduce((n,d)=>n+d.volume*d.price,0)/vout),closedDate:last.date,closedTime:last.time,netPnl:String(g.reduce((n,d)=>n+d.profit+d.commission+d.swap+d.fee,0)),recordedWithoutPlan:true};
 p.resultNotes=`Imported MT5 position ${id}; ${g.length} deals; volume-weighted entry/exit. Initial risk and setup require your review. Standalone account fees are excluded.`;plans.push(p);
 }
 // Group separate MT5 positions into one idea only when account, symbol, direction,
 // opening volume and first-entry time all match within a five-minute window.
 const ordered=[...plans].sort((a,b)=>(a.journal.actualDate+a.journal.actualTime).localeCompare(b.journal.actualDate+b.journal.actualTime));
 const merged:TradePlan[]=[];
 const firstVolume=(p:TradePlan)=>{const id=p.mt5Source?.split('|').at(-1);const deals=s.deals.filter(d=>d.position===id&&d.entry===0);return deals.reduce((n,d)=>n+d.volume,0);};
 const originalVolumes=new WeakMap<TradePlan,number>();
 const firstMs=(p:TradePlan)=>executionTimestamp(p.journal.actualDate,p.journal.actualTime,s.timezone);
 for(const p of ordered){
  const volume=firstVolume(p),at=firstMs(p);originalVolumes.set(p,volume);
  const anchor=merged.find(m=>m.pair===p.pair&&m.direction===p.direction&&m.style===p.style&&m.journal.accountId===p.journal.accountId&&Math.abs((originalVolumes.get(m)??firstVolume(m))-volume)<1e-7&&at!==null&&firstMs(m)!==null&&at-firstMs(m)!>=0&&at-firstMs(m)!<=300000);
  if(!anchor){merged.push(p);continue;}
  const ids=[anchor.mt5Source!,p.mt5Source!].flatMap(x=>x.split('::')).sort();
  const oldIds=anchor.mt5Source!.split('::');
  const groupCount=oldIds.length+1;
  const oldPnl=Number(anchor.journal.netPnl),newPnl=Number(p.journal.netPnl);
  anchor.mt5Source=ids.join('::');
  anchor.id='mt5-idea-'+encodeURIComponent(ids.join('::'));
  anchor.title='MT5 '+s.account+' · '+groupCount+' positions / 1 trade idea';
  anchor.journal.netPnl=String(oldPnl+newPnl);
  if((p.journal.closedDate+p.journal.closedTime)>(anchor.journal.closedDate+anchor.journal.closedTime)){anchor.journal.closedDate=p.journal.closedDate;anchor.journal.closedTime=p.journal.closedTime;}
  anchor.resultNotes='MT5 grouped trade idea ('+groupCount+' positions). Combined realized P&L. Review initial risk and setup.';
 }
 return {plans:merged,warnings};
}
