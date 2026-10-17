import {CurrencyWeeklyFundamentals} from "@/components/CurrencyWeeklyFundamentals";
import { InternationalMacroDashboard } from "@/components/InternationalMacroDashboard";
export default function Page() {
  return <><InternationalMacroDashboard country="jpy" /><CurrencyWeeklyFundamentals currency="JPY" /></>;
}
