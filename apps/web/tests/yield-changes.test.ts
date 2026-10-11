import {it,expect} from 'vitest';
import {yieldChanges,yieldSpreads} from '../src/lib/international-yields';
it('shows dated prior levels and basis-point changes across holidays and calendar horizons',()=>{
 const rows=[{date:'2026-07-08',value:3},{date:'2026-09-08',value:3.4},{date:'2026-10-01',value:3.5},{date:'2026-10-07',value:3.6},{date:'2026-10-08',value:3.7}];
 const {changes}=yieldChanges(rows,r=>r.value);
 expect(changes.oneDay?.value).toBeCloseTo(10);expect(changes.oneDay?.previous).toBe(3.6);expect(changes.oneWeek?.date).toBe('2026-10-01');expect(changes.oneMonth?.value).toBeCloseTo(30);expect(changes.threeMonths?.value).toBeCloseTo(70);
});
it('clamps calendar months and does not bridge long history gaps',()=>{
 const rows=[{date:'2026-01-01',value:1},{date:'2026-02-27',value:2},{date:'2026-03-31',value:3}];
 const {changes}=yieldChanges(rows,r=>r.value);
 expect(changes.oneMonth?.date).toBe('2026-02-27');expect(changes.oneDay).toBeNull();expect(changes.oneWeek).toBeNull();expect(changes.threeMonths).toBeNull();
});
it('computes curves only with same-date maturities and keeps spread changes in bp',()=>{
 const rows=[{date:'2026-10-07',two:3,ten:4,thirty:null},{date:'2026-10-08',two:3.1,ten:4.2,thirty:5}];
 const spreads=yieldSpreads(rows);expect(spreads[0]?.thirtySpread).toBeNull();expect(yieldChanges(spreads,r=>r.tenSpread,1).changes.oneDay?.value).toBeCloseTo(10);
});
