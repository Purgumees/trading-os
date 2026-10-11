import { MacroRegionNav } from "@/components/MacroRegionNav";
import { ForexPairComparison } from "@/components/ForexPairComparison";
export default function Page() {
  return <main className="mx-auto max-w-7xl p-4 md:p-8">
    <MacroRegionNav region="pairs" />
    <h1 className="mb-4 text-3xl font-bold">FX pairs · relative macro support</h1>
    <ForexPairComparison />
  </main>;
}
