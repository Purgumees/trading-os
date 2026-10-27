import {parseCsv} from '@luxalgo/journal-importers';
import type {YieldRow} from './international-yields';
import {sortYields} from './international-yields';
export function euroTwoYearRows(csv:string,term:'2Y'|'10Y'|'30Y'='2Y'):YieldRow[]{
 const rows=parseCsv(csv.replace(/^\uFEFF/,'')),header=rows[0]??[];const d=header.indexOf('TIME_PERIOD'),v=header.indexOf('OBS_VALUE'),key=header.indexOf('KEY');
 if(d<0||v<0||key<0)throw Error('ECB yield columns unavailable');
 return sortYields(rows.slice(1).flatMap(r=>r[key]===`YC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_${term}`&&/^\d{4}-\d{2}-\d{2}$/.test(r[d]??'')&&r[v]?.trim()&&Number.isFinite(Number(r[v]))?[{date:r[d]!,two:Number(r[v]),ten:null,thirty:null}]:[]));
}
