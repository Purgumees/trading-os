import { InternationalMacroDashboard } from "@/components/InternationalMacroDashboard";
import { AudUsdMacroBias } from "@/components/AudUsdMacroBias";
import { AbsLabourLatest } from "@/components/AbsLabourLatest";
export default function Page() {
  return <>
    <AbsLabourLatest />
    <AudUsdMacroBias />
    <InternationalMacroDashboard country="aud" />
    
  </>;
}
