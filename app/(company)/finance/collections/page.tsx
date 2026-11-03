import { loadFinancePage } from "@/lib/data/finance-page";
import { FinanceLoadError } from "@/components/company/finance-load-error";
import { FinancePaymentsV2 } from "@/components/company/finance-payments-v2";
export default async function CollectionsPage() {
  const context=await loadFinancePage();
  return context?<FinancePaymentsV2 {...context} direction="receivable"/>:<FinanceLoadError/>;
}
