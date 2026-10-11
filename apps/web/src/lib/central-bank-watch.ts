export const watchBanks = {
 EUR: {bank:"ECB", path:"european-central-bank", note:"Independent ESTR-futures model; constant spread assumption. Not an official ECB forecast."},
 USD: {bank:"Fed", path:"federal-reserve", note:"Independent Fed-funds-futures model, not CME FedWatch. The existing Polymarket section is a separate source."},
 GBP: {bank:"BOE", path:"bank-of-england", note:"Independent SONIA-futures model; constant spread assumption. Not an official BOE forecast."},
 JPY: {bank:"BOJ", path:"bank-of-japan", note:"Quarterly TONA futures require meeting-level assumptions. Provider dates conflict with the official BOJ meeting calendar; decision probabilities are withheld."},
 AUD: {bank:"RBA", path:"reserve-bank-of-australia", note:"Independent futures-based probability chart; may differ from the ASX next-meeting tracker."},
 NZD: {bank:"RBNZ", path:"reserve-bank-of-new-zealand", note:"NZ bank-bill futures proxy assumes a constant BKBM–OCR credit/liquidity spread. Coverage may omit nearer meetings."},
 CAD: {bank:"BOC", path:"bank-of-canada", note:"The public page contains old illustrative probabilities. They are excluded; a current licensed CORRA/OIS feed is not connected."},
} as const;
export type WatchCurrency = keyof typeof watchBanks;
export type WatchMeeting = {date:string; expected:number; weekAgo:number|null; monthAgo:number|null; outcomes:{rate:number;probability:number}[]};
export type BankWatch = {currency:WatchCurrency; bank:string; source:string; asOf:string|null; current:number|null; meetings:WatchMeeting[]; status:string; note:string};
// Only parses a bounded data literal. Never executes a provider's JavaScript.
function literal(text:string, start:number) {
 if(start<0) return null;
 let depth=0, quoted=false, escaped=false;
 for(let i=start;i<text.length;i++) {
  const c=text[i];
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
  if(c==='"'){quoted=true;continue;}
  if(c==='['||c==='{')depth++; else if(c===']'||c==='}')depth--;
  if(depth===0){try{return JSON.parse(text.slice(start,i+1).replace(/([{,])\s*([A-Za-z][A-Za-z0-9]*)\s*:/g,'$1"$2":').replace(/([:,\[])\s*(-?)\.(\d+)/g,'$1$20.$3'));}catch{return null;}}
 }
 return null;
}
function dateLabel(label:string) {
 const t=Date.parse(`${label} UTC`); return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):null;
}
export function parseBankWatch(html:string,currency:WatchCurrency,now=new Date()):BankWatch {
 const bank=watchBanks[currency];const result:BankWatch={currency,bank:bank.bank,source:`https://centralbank.watch/${bank.path}/`,asOf:null,current:null,meetings:[],status:"Current market probabilities unavailable",note:bank.note};
 if(currency==='CAD')return result;
 if(currency==='JPY'){result.status="Provider meeting dates conflict with the official BOJ calendar; decision probabilities withheld";return result;}
 const raw=html.match(/class=["']?data-as-of-label["']?[^>]*>([^<]+)</)?.[1];result.asOf=raw?dateLabel(raw):null;
 if(!result.asOf||now.getTime()-Date.parse(result.asOf)>7*86400000||Date.parse(result.asOf)>now.getTime()){result.status="Source date missing, future-dated or older than 7 days";return result;}
 const index=html.indexOf('currentRate:');const object=index>=0?literal(html,html.lastIndexOf('{',index)):null;
 const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1] ?? "");
 const chart=scripts.find(s=>/var \w+=\[\{bars:\[\{color:.*label:/.test(s));
 const rows=chart?literal(chart,chart.indexOf('[{bars:')):null;
 if(!Array.isArray(rows)){result.status="Probability chart data unavailable";return result;}
 const baseline=rows.flatMap(r=>Array.isArray(r.bars)?r.bars:[]).find(r=>r.order===0);
 result.current=Number.isFinite(object?.currentRate)?object.currentRate:baseline?Number.parseFloat(baseline.label):null;
 if(result.current===null||!Number.isFinite(result.current))return result;
 const prior=(key:string,date:string)=>{const row=object?.[key]?.find((r:{date:string})=>r.date===date);return Number.isFinite(row?.rate)?row.rate:null;};
 for(const row of rows){
  const date=dateLabel(row.label);if(!date||date<=now.toISOString().slice(0,10)||!Array.isArray(row.bars))continue;
  const outcomes: {rate:number;probability:number}[]=row.bars.map((b:{label:string;value:number})=>({rate:Number.parseFloat(b.label),probability:b.value}));
  if(!outcomes.length||outcomes.some(o=>!Number.isFinite(o.rate)||!Number.isFinite(o.probability)||o.probability<0||o.probability>100)||Math.abs(outcomes.reduce((s,o)=>s+o.probability,0)-100)>0.5)continue;
  const expected=outcomes.reduce((s,o)=>s+o.rate*o.probability/100,0);
  const reported=object?.todayPath?.find((r:{date:string})=>r.date===date)?.rate;
  if(Number.isFinite(reported)&&Math.abs(expected-reported)>0.02)continue;
  result.meetings.push({date,expected,weekAgo:prior('oneWeekPath',date),monthAgo:prior('fourWeekPath',date),outcomes});
 }
 result.meetings.sort((a,b)=>a.date.localeCompare(b.date));result.meetings=result.meetings.slice(0,3);
 if(result.meetings.length)result.status="Published market-model estimates";
 return result;
}
