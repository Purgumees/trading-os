import {describe,it,expect} from "vitest";
import {parseBankWatch} from "../src/lib/central-bank-watch";
import {rbaPolicyObservations} from "../src/lib/international-macro";
import {csvYields,curveState} from "../src/lib/international-yields";
const now=new Date('2026-10-11T12:00:00Z');
const html='<span class=data-as-of-label>October 9, 2026</span><script>(function(){var t=[{bars:[{color:"grey",label:"3.75%",order:0,value:20},{color:"red",label:"4.00%",order:25,value:80}],label:"05-Nov-2026"}],s="chart"})()</script><script>(function(){var e={currentRate:3.75,oneWeekPath:[{date:"2026-11-05",rate:3.9}],fourWeekPath:[],todayPath:[{date:"2026-11-05",rate:3.95}]},n=0})()</script>';
it('uses the RBA target rate and preserves its actual date, skipping missing publication cells',()=>{expect(rbaPolicyObservations('Metadata\nSeries ID,FIRMMCRTD,FIRMMCRID\n08-Oct-2026,4.60,4.55\n09-Oct-2026,,4.55')).toEqual([{date:'2026-10-08',value:4.6}]);});
describe('market expectations and government yields',()=>{
 it('extracts bounded data without executing JavaScript and matches history by meeting',()=>{const r=parseBankWatch(html,'GBP',now);expect(r.meetings[0]?.expected).toBeCloseTo(3.95);expect(r.meetings[0]?.weekAgo).toBe(3.9);expect(r.current).toBe(3.75);});
 it('rejects stale, invalid and inconsistent probabilities',()=>{expect(parseBankWatch(html,'GBP',new Date('2026-11-11')).meetings).toEqual([]);expect(parseBankWatch(html.replace('value:80','value:150'),'GBP',now).meetings).toEqual([]);expect(parseBankWatch(html.replace('rate:3.95','rate:4.95'),'GBP',now).meetings).toEqual([]);expect(parseBankWatch(html,'CAD',now).meetings).toEqual([]);expect(parseBankWatch(html,'JPY',now).meetings).toEqual([]);});
 it('parses blank yields as unavailable and handles metadata, chronology and negative yields',()=>{const rows=csvYields('Metadata\nDate,2Y,10Y,30Y\n2026/10/8,-0.1,1.2,\n2026/10/7,-0.2,1.4,2.1','Date',['2Y','10Y','30Y']);expect(rows[1]?.two).toBe(-0.1);expect(rows[1]?.thirty).toBeNull();expect(curveState(rows)?.move).toBe('Flattening');});
 it('does not bridge dates with missing curve maturities',()=>{expect(curveState([{date:'2026-10-07',two:1,ten:null,thirty:2},{date:'2026-10-08',two:null,ten:2,thirty:3}])).toBeNull();});
});
