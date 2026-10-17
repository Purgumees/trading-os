import {NextResponse} from 'next/server';
import {fred} from '@/lib/international-macro-server';
export const revalidate=3600;
const series=[{id:'BAMLH0A0HYM2',label:'High Yield OAS'},{id:'BAMLC0A4CBBB',label:'BBB OAS'},{id:'BAMLH0A3HYC',label:'CCC & Lower OAS'}];
function diff(rows:{date:string;value:number}[],days:number){const last=rows.at(-1);if(!last)return null;const target=new Date(last.date+'T00:00:00Z');target.setUTCDate(target.getUTCDate()-days);const old=rows.findLast(r=>r.date<=target.toISOString().slice(0,10));return old&&Date.parse(target.toISOString())-Date.parse(old.date+'T00:00:00Z')<=4*86400000?Math.round((last.value-old.value)*100):null;}
export async function GET(){const results=await Promise.all(series.map(async s=>{try{const rows=await fred(s.id);const last=rows.at(-1);return {...s,value:last?.value??null,date:last?.date??null,oneDay:diff(rows,1),oneWeek:diff(rows,7),oneMonth:diff(rows,30),error:null};}catch{return {...s,value:null,date:null,oneDay:null,oneWeek:null,oneMonth:null,error:'Source unavailable'};}}));return NextResponse.json({asOf:new Date().toISOString(),results});}
