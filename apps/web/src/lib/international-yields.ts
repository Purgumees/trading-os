import { parseCsv } from "@luxalgo/journal-importers";
import type { Country } from "./international-macro";
export type YieldRow={date:string;two:number|null;ten:number|null;thirty:number|null};
export type YieldData={country:Country;rows:YieldRow[];source:string;definition:string;note:string;error?:string};
export function isoDay(value:unknown):string|null {
 if(value instanceof Date)return Number.isFinite(value.getTime())?value.toISOString().slice(0,10):null;
 if(typeof value!=='string')return null;
 const t=Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value)?value:`${value} UTC`);return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):null;
}
const numeric=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&v.trim()&&Number.isFinite(Number(v))?Number(v):null;
export function csvYields(text:string,headerName:string,columns:[string,string,string|null]):YieldRow[] {
 const lines=parseCsv(text.replace(/^\uFEFF/,''));const headerIndex=lines.findIndex(r=>r[0]?.trim()===headerName);if(headerIndex<0)throw Error('Yield headers unavailable');
 const header=lines[headerIndex]!;const indexes=columns.map(c=>c===null?-1:header.findIndex(h=>h.trim()===c));if(indexes[0]!<0||indexes[1]!<0)throw Error('Yield columns unavailable');
 const rows=lines.slice(headerIndex+1).flatMap(r=>{const date=isoDay(r[0]);if(!date||!/^\d/.test(r[0]??''))return [];const values=indexes.map(i=>i>=0?numeric(r[i]):null);return values.every(v=>v===null)?[]:[{date,two:values[0] ?? null,ten:values[1] ?? null,thirty:values[2] ?? null}];});
 return sortYields(rows);
}
export function sortYields(rows:YieldRow[]) {
 return [...new Map(rows.map(r=>[r.date,r])).values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-130);
}
export function curveState(rows:YieldRow[]) {
 const shared=rows.filter((r):r is YieldRow&{two:number;ten:number}=>r.two!==null&&r.ten!==null);
 const last=shared.at(-1),previous=shared.at(-2);if(!last)return null;
 const gap=last.ten-last.two;const change=previous?gap-(previous.ten-previous.two):null;
 const twoChange=previous?last.two-previous.two:null,tenChange=previous?last.ten-previous.ten:null;
 const move=change===null?'History insufficient':Math.abs(change)<0.005?'Little change':change>0?'Steepening':'Flattening';
 const direction=twoChange!==null&&tenChange!==null?(twoChange<0&&tenChange<0?'Both yields fell':twoChange>0&&tenChange>0?'Both yields rose':'Yields moved in different directions or one was unchanged'):'';
 return {last,previous,gap,change,move,direction};
}
