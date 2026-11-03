import { loadFinancePage } from "@/lib/data/finance-page";
import { FinanceLoadError } from "@/components/company/finance-load-error";
import { FinanceQueriesV2 } from "@/components/company/finance-queries-v2";
export default async function QueriesPage() {
  const context=await loadFinancePage();
  return context?<FinanceQueriesV2 {...context}/>:<FinanceLoadError/>;
}
