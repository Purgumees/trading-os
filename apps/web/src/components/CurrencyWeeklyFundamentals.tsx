'use client';
import {WeeklyFundamentalBias} from './WeeklyFundamentalBias';
import {outlookWeek} from '@/lib/weekly-outlook';
export function CurrencyWeeklyFundamentals({currency}:{currency:'USD'|'EUR'|'GBP'|'JPY'|'AUD'|'CAD'|'NZD'}){
 const week=outlookWeek(new Date(Date.now()+7*86400000).toISOString());
 return <div className="mx-auto my-6 w-full max-w-7xl px-4 md:px-8"><WeeklyFundamentalBias week={week} initialCurrency={currency} locked/></div>;
}
