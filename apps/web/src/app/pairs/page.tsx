import { MacroRegionNav } from "@/components/MacroRegionNav";
import { MacroPageHeader } from "@/components/MacroPageHeader";
import { ForexPairComparison } from "@/components/ForexPairComparison";
export default function Page() {
  return <main className="mx-auto w-full max-w-7xl p-4 md:p-8">
    <MacroRegionNav region="pairs" />
    <MacroPageHeader title="FX pairs · relative macro support" description="Compare the main USD pairs and crosses · rates, GDP, inflation and jobs." />
    <ForexPairComparison />
  </main>;
}
