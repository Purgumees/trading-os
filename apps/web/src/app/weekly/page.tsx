import {MacroPageHeader} from '@/components/MacroPageHeader';
import {WeeklyForecast} from '@/components/WeeklyForecast';
export default function Page(){return <main className="mx-auto w-full max-w-7xl p-4 md:p-8"><MacroPageHeader title="WEEKLY OUTLOOK" description="Choose a currency pair → short automatic macro summary → your fundamental outlook → TradingView charts."/><WeeklyForecast/></main>;}
