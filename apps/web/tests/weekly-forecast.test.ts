import {it,expect} from 'vitest';
import {createForecast,readForecast,nextWeek,validWeek,safeChartUrl} from '../src/lib/weekly-forecast';
it('keeps each week separate and handles year boundaries',()=>{const f=createForecast('2026-12-28');expect(f.pairs.EURUSD.enabled).toBe(false);expect(nextWeek(f.week,1)).toBe('2027-01-04');expect(nextWeek('2026-10-12',-1)).toBe('2026-10-05');expect(readForecast(JSON.parse(JSON.stringify(f))).week).toBe(f.week);});
it('rejects incomplete backups and invalid Mondays without silently accepting them',()=>{expect(validWeek('2026-10-13')).toBe(false);expect(validWeek('2026-02-30')).toBe(false);const f=createForecast('2026-10-12');const partial=JSON.parse(JSON.stringify(f));delete partial.pairs.EURUSD.longScenario;expect(()=>readForecast(partial)).toThrow();expect(()=>readForecast({...f,version:2})).toThrow();});
it('only opens secure TradingView links, not lookalikes or executable URLs',()=>{expect(safeChartUrl('https://www.tradingview.com/chart/abc/')).toBeTruthy();for(const u of ['javascript:alert(1)','https://tradingview.com.evil.example/','https://eviltradingview.com/','http://www.tradingview.com/'])expect(safeChartUrl(u)).toBeNull();});
it('restores old plans with empty extra chart slots and keeps all three charts and custom titles in backups',()=>{
 const old=JSON.parse(JSON.stringify(createForecast('2026-10-12')));
 old.pairs.EURUSD.beforeImage='original-image';
 for(const p of Object.values(old.pairs) as Record<string,unknown>[])for(const key of ['beforeImage2','beforeImage3','chartTitle1','chartTitle2','chartTitle3'])delete p[key];
 const restored=readForecast(old);
 expect(restored.pairs.EURUSD.beforeImage).toBe('original-image');
 expect(restored.pairs.EURUSD.beforeImage2).toBe('');expect(restored.pairs.EURUSD.chartTitle1).toBe('');
 restored.pairs.EURUSD.beforeImage2='second-image';restored.pairs.EURUSD.beforeImage3='third-image';restored.pairs.EURUSD.chartTitle2='My own timeframe';
 expect(readForecast(JSON.parse(JSON.stringify(restored))).pairs.EURUSD).toEqual(restored.pairs.EURUSD);
 expect(()=>readForecast({...restored,pairs:{...restored.pairs,EURUSD:{...restored.pairs.EURUSD,beforeImage3:42}}})).toThrow();
});
