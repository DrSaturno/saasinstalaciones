import { loadFinancePage } from "@/lib/data/finance-page";
import { FinanceLoadError } from "@/components/company/finance-load-error";
import { FinancePaymentsV2 } from "@/components/company/finance-payments-v2";
export default async function PaymentsPage({searchParams}:{searchParams:Promise<{zone?:string}>}) {
  const [context,params]=await Promise.all([loadFinancePage(),searchParams]);
  return context?<FinancePaymentsV2 {...context} direction="payable" zone={['amba','interior'].includes(params.zone??'')?params.zone:undefined}/>:<FinanceLoadError/>;
}
