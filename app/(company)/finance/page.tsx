import { loadFinancePage } from "@/lib/data/finance-page";
import { FinanceLoadError } from "@/components/company/finance-load-error";
import { FinanceSummaryV2 } from "@/components/company/finance-summary-v2";
export default async function FinancePage() {
  const context=await loadFinancePage();
  return context?<FinanceSummaryV2 {...context}/>:<FinanceLoadError/>;
}
