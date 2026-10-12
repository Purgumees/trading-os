import Link from 'next/link';
import {MacroRegionNav} from '@/components/MacroRegionNav';
import {MacroPageHeader} from '@/components/MacroPageHeader';
import {PairThemes} from '@/components/PairThemes';
import {WeeklyOutlook} from '@/components/WeeklyOutlook';
export default function Page(){return <main className="mx-auto w-full max-w-7xl p-4 md:p-8"><MacroRegionNav region="weekly"/><MacroPageHeader title="WEEKLY OUTLOOK · currency themes" description="Evidence → theme → pairs to watch → your trade plan. Tallinn time. No automatic trade signal."/><Link href="/forecast" className="mb-5 inline-block rounded-lg border border-amber-500/40 px-5 py-3 font-semibold">Koosta oma Weekly Forecast →</Link><PairThemes/><WeeklyOutlook/></main>;}
