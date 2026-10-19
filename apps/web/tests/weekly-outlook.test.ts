import {it,expect} from 'vitest';
import {currencyDrivers,weeklyOutlook,outlookWeek,type WeeklyInput} from '../src/lib/weekly-outlook';
import type {ComparisonSnapshot} from '../src/lib/pair-macro';
const asOf='2026-10-11T16:00:00Z';
function input(currency:'EUR'|'USD'):WeeklyInput{
 const macro={currency,fetchedAt:asOf,policy:[{date:'2026-09-08',value:2},{date:'2026-10-08',value:2}],gdp:[{date:'2026-Q1',value:100},{date:'2026-Q2',value:currency==='EUR'?101:100.5}],labour:[{date:'2026-05',value:5},{date:'2026-08',value:currency==='EUR'?4.8:5.2}],inflation:[],quarterlyLabour:false} as unknown as ComparisonSnapshot;
 return {currency,macro,watch:null,yields:{country:'jpy',definition:'Test',note:'',source:'test',rows:[{date:'2026-10-01',two:2,ten:3,thirty:null},{date:'2026-10-08',two:currency==='EUR'?2.1:2,ten:3,thirty:null}]},errors:[]};
}
it('does not classify missing evidence as weak or manufacture shortlist candidates',()=>{
 const r=weeklyOutlook({asOf,inputs:[{currency:'EUR',macro:null,watch:null,yields:null,errors:[]}]});expect(r.rows[0]!.status).toBe('Insufficient coverage');expect(r.rows[0]!.available).toBe(0);expect(r.pairs.some(p=>p.winner)).toBe(false);
});
it('requires macro and matched-date yield differential to agree; divergent dates withhold a winner',()=>{
 const eur=input('EUR'),usd=input('USD');expect(weeklyOutlook({asOf,inputs:[eur,usd]}).pairs[0]!.winner).toBe('EUR');
 eur.yields!.rows[1]!.two=1.9;expect(weeklyOutlook({asOf,inputs:[eur,usd]}).pairs[0]!.winner).toBeNull();
 eur.yields!.rows[1]!.two=2.1;usd.yields!.rows[1]!.date='2026-10-07';expect(weeklyOutlook({asOf,inputs:[eur,usd]}).pairs[0]!.yieldGapChange).toBeNull();
});
it('excludes stale yield endpoints and preserves the unemployment improvement direction',()=>{
 const d=input('EUR');const signals=currencyDrivers(d,asOf);expect(signals[4]!.direction).toBe(1);expect(currencyDrivers(d,'2027-01-01T00:00:00Z')[1]!.direction).toBeNull();
});
it('Sunday plans the coming Monday in Tallinn, with DST-safe week dates',()=>{expect(outlookWeek(asOf)).toBe('2026-10-12');expect(outlookWeek('2026-10-12T00:00:00Z')).toBe('2026-10-12');expect(outlookWeek('2026-10-10T21:30:00Z')).toBe('2026-10-12');});
import {parseWeeklyEvents} from '../src/lib/weekly-calendar';
it('uses timezone-aware event dates, filters the planning week and rejects naive timestamps',()=>{
 const base={title:'CPI',country:'USD',impact:'High',forecast:'2%',previous:'1%'};
 const events=parseWeeklyEvents([{...base,date:'2026-10-11T19:00:00-04:00'},{...base,date:'2026-10-14T08:30:00'},{...base,date:'2026-10-20T08:30:00-04:00'}],asOf);
 expect(events).toHaveLength(1);expect(events[0]!.date).toBe('2026-10-11T23:00:00.000Z');expect(events[0]!.meaning).toContain('rate');
});
import {euroTwoYearRows} from '../src/lib/weekly-euro-yields';
it('parses only the exact ECB 2Y AAA spot series, including quoted CSV metadata and negative yields',()=>{expect(euroTwoYearRows('KEY,TIME_PERIOD,OBS_VALUE,TITLE\nYC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y,2026-10-08,-0.2,"AAA, spot"\nYC.WRONG,2026-10-09,5,wrong\nYC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y,2026-10-09,,missing')).toEqual([{date:'2026-10-08',two:-.2,ten:null,thirty:null}]);});
