export type TradeExample={id:string;category:string;title:string;pair:string;date:string;session:string;setupTime:string;entryTime:string;timezone:string;timing:string;context:string;recognition:string;entry:string;invalidates:string;lesson:string;archived:boolean;images:string[];chartTitles:string[]};
export type BestTrades={version:1;categories:string[];examples:TradeExample[]};
export const BEST_TRADES_KEY='trading-best-trades-v1';
export const emptyCollection=():BestTrades=>({version:1,categories:['Weekly Expansion Phases'],examples:[]});
export function newExample(category:string):TradeExample{return {id:crypto.randomUUID(),category,title:'',pair:'',date:'',session:'',setupTime:'',entryTime:'',timezone:'',timing:'',context:'',recognition:'',entry:'',invalidates:'',lesson:'',archived:false,images:['','',''],chartTitles:['','','']};}
export function readCollection(raw:unknown):BestTrades{
 const v=raw as BestTrades;
 if(!v||v.version!==1||!Array.isArray(v.categories)||!v.categories.length||v.categories.length>100||v.categories.some(c=>typeof c!=='string'||!c.trim()||c.length>200)||new Set(v.categories).size!==v.categories.length||!Array.isArray(v.examples)||v.examples.length>500)throw Error('Invalid Best Trades backup');
 const ids=new Set<string>();
 for(const e of v.examples){if(!e||typeof e.archived!=='boolean'||!v.categories.includes(e.category)||!e.id||ids.has(e.id))throw Error('Invalid trade example');ids.add(e.id);for(const key of ['session','setupTime','entryTime','timezone','timing'] as const){if(e[key]===undefined)e[key]='';if(typeof e[key]!=='string'||e[key].length>20000)throw Error('Invalid timing field');}for(const k of ['id','category','title','pair','date','context','recognition','entry','invalidates','lesson'] as const)if(typeof e[k]!=='string'||e[k].length>20000)throw Error('Invalid example field');for(const a of [e.images,e.chartTitles])if(!Array.isArray(a)||a.length!==3||a.some(x=>typeof x!=='string'||x.length>20000))throw Error('Invalid chart fields');}
 return v;
}
