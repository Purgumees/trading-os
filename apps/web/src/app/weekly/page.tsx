import {MacroRegionNav} from '@/components/MacroRegionNav';
import {MacroPageHeader} from '@/components/MacroPageHeader';
import {PairThemes} from '@/components/PairThemes';
import {WeeklyOutlook} from '@/components/WeeklyOutlook';
export default function Page(){return <main className="mx-auto w-full max-w-7xl p-4 md:p-8"><MacroRegionNav region="weekly"/><MacroPageHeader title="WEEKLY OUTLOOK · currency themes" description="Evidence → theme → pairs to watch → your trade plan. Tallinn time. No automatic trade signal."/><PairThemes/><WeeklyOutlook/></main>;}
