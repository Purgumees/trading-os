import {MacroPageHeader} from '@/components/MacroPageHeader';
import {WeeklyOutlook} from '@/components/WeeklyOutlook';
import {WeeklyForecast} from '@/components/WeeklyForecast';
export default function Page(){return <main className="mx-auto w-full max-w-7xl p-4 md:p-8"><MacroPageHeader title="WEEKLY OUTLOOK · fundamentals & charts" description="This week's economic evidence and fundamental outlook first, then your TradingView charts, scenarios and weekly review."/><WeeklyOutlook/><section className="mt-8" id="my-charts"><h2 className="mb-3 text-2xl font-bold">My Charts & Scenarios</h2><WeeklyForecast/></section></main>;}
