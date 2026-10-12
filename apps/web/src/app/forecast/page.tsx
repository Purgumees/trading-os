import {MacroRegionNav} from '@/components/MacroRegionNav';
import {MacroPageHeader} from '@/components/MacroPageHeader';
import {WeeklyForecast} from '@/components/WeeklyForecast';
export default function Page(){return <main className="mx-auto w-full max-w-7xl p-4 md:p-8"><MacroRegionNav region="forecast"/><MacroPageHeader title="WEEKLY FORECAST · minu nädalaplaan" description="Makroteema → TradingView graafik → hinnapiirkonnad → tingimuslikud stsenaariumid → nädala lõpu ülevaade."/><WeeklyForecast/></main>;}
