import { InternationalMacroDashboard } from "@/components/InternationalMacroDashboard";
import { AudUsdMacroBias } from "@/components/AudUsdMacroBias";
export default function Page() {
  return <>
    <AudUsdMacroBias />
    <InternationalMacroDashboard country="aud" />
  </>;
}
