import {CurrencyWeeklyFundamentals} from "@/components/CurrencyWeeklyFundamentals";
import { MacroDashboard } from "@/components/MacroDashboard";
export default function Page() {
  return <><MacroDashboard region="euro" /><CurrencyWeeklyFundamentals currency="EUR" /></>;
}
