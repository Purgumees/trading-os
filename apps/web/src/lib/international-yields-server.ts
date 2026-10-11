import ExcelJS from "exceljs";
import { unzipSync } from "fflate";
import { download } from "./international-macro-server";
import { csvYields,isoDay,sortYields,type YieldData,type YieldRow } from "./international-yields";
import type { Country } from "./international-macro";
const sources={
 jpy:"https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/index.htm",
 cad:"https://www.bankofcanada.ca/rates/interest-rates/canadian-bonds/",
 aud:"https://www.rba.gov.au/statistics/tables/",
 nzd:"https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/wholesale-interest-rates",
 gbp:"https://www.bankofengland.co.uk/statistics/yield-curves",
};
async function workbook(bytes:Uint8Array){const w=new ExcelJS.Workbook();await w.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof w.xlsx.load>[0]);return w;}
function excelRows(sheet:ExcelJS.Worksheet,columns:number[],start:number):YieldRow[]{
 const rows:YieldRow[]=[];sheet.eachRow((row,index)=>{if(index<start)return;const date=isoDay(row.getCell(1).value);if(!date)return;const v=columns.map(c=>c>0?row.getCell(c).value:null).map(v=>typeof v==='number'&&Number.isFinite(v)?v:null);if(v.some(x=>x!==null))rows.push({date,two:v[0] ?? null,ten:v[1] ?? null,thirty:v[2] ?? null});});return sortYields(rows);
}
export async function internationalYields(country:Country):Promise<YieldData>{
 const result:YieldData={country,rows:[],source:sources[country],definition:"Nominal government bond yields · daily observations",note:"Publication dates and yield definitions vary by country. These are not TradingView live quotes."};
 try{
  if(country==='jpy'){
   const root='https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/';
   const texts=await Promise.all([download(`${root}historical/jgbcme_all.csv`).then(r=>r.text()),download(`${root}jgbcme.csv`).then(r=>r.text())]);
   result.rows=sortYields(texts.flatMap(t=>csvYields(t,'Date',['2Y','10Y','30Y'])));result.definition="Japan MOF · nominal JGB maturity yields";
  }else if(country==='cad'){
   const json=await(await download('https://www.bankofcanada.ca/valet/observations/group/bond_yields_benchmark/json?recent=130')).json();
   result.rows=sortYields((json.observations??[]).map((r:Record<string,unknown>)=>{const get=(key:string)=>{const raw=(r[key] as {v?:string})?.v;return raw?.trim()&&Number.isFinite(Number(raw))?Number(raw):null;};return {date:r.d as string,two:get('BD.CDN.2YR.DQ.YLD'),ten:get('BD.CDN.10YR.DQ.YLD'),thirty:get('BD.CDN.LONG.DQ.YLD')};}));
   result.definition="Canada · benchmark bond closing yields; 30Y uses the long-term benchmark";
   result.note+=" Benchmark bonds have approximate remaining maturities and may change when a new issue becomes the benchmark.";
  }else if(country==='aud'){
   result.rows=csvYields(await(await download('https://www.rba.gov.au/statistics/tables/csv/f2-data.csv')).text(),'Series ID',['FCMYGBAG2D','FCMYGBAG10D',null]);
   result.definition="Australia RBA F2 · interpolated government bond closing yields";result.note+=" F2 publishes 2Y and 10Y; a 30Y series is not supplied. Daily observations are published weekly.";
  }else if(country==='nzd'){
   const bytes=new Uint8Array(await(await download('https://www.rbnz.govt.nz/-/media/project/sites/rbnz/files/statistics/series/b/b2/hb2-daily-close.xlsx')).arrayBuffer());
   const w=await workbook(bytes),sheet=w.getWorksheet('Data');if(!sheet)throw Error('RBNZ data sheet unavailable');
   const header=sheet.getRow(5);const find=(id:string)=>{let column=-1;header.eachCell((cell,index)=>{if(cell.value===id)column=index;});return column;};
   const columns=[find('INM.DG102.NZZCF'),find('INM.DG110.NZZCF'),-1];if(columns[0]!<0||columns[1]!<0)throw Error('RBNZ maturity series unavailable');
   result.rows=excelRows(sheet,columns,6);result.definition="New Zealand RBNZ B2 · 2Y and 10Y secondary-market government yields";result.note+=" A constant 30Y series is not supplied; individual dated bonds are not substituted for it.";
  }else{
   const zipped=new Uint8Array(await(await download('https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip')).arrayBuffer());
   const files=unzipSync(zipped),name=Object.keys(files).find(n=>n==='GLC Nominal daily data current month.xlsx');if(!name)throw Error('BOE nominal workbook unavailable');
   const w=await workbook(files[name]!),sheet=w.getWorksheet('4. spot curve');if(!sheet)throw Error('BOE nominal spot sheet unavailable');
   const find=(years:number)=>{let column=-1;sheet.getRow(4).eachCell((cell,index)=>{if(typeof cell.value==='number'&&Math.abs(cell.value-years)<0.001)column=index;});return column;};
   const columns=[2,10,30].map(find);if(columns.some(c=>c<0))throw Error('BOE maturities unavailable');result.rows=excelRows(sheet,columns,6);
   result.definition="UK BOE · fitted nominal gilt spot yields (zero-coupon curve), not benchmark bond yields";result.note+=" Current-month archive only. These model-fitted spot rates should not be treated as the same series as US Treasury constant-maturity yields.";
  }
  if(!result.rows.length)throw Error('No valid yield observations');
 }catch(e){result.error=e instanceof Error?e.message:'Yield source unavailable';}
 return result;
}
