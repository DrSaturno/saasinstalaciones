import { getTranslations } from "next-intl/server";
import { loadFinancePage } from "@/lib/data/finance-page";
import { FinanceLoadError } from "@/components/company/finance-load-error";
import { FinanceChequeForm } from "@/components/company/finance-cheque-form";
import { FinanceChequeList } from "@/components/company/finance-cheque-list";
export default async function FinanceChequesPage({searchParams}:{searchParams:Promise<{entry?:string}>}) {
  const [context,t,params]=await Promise.all([loadFinancePage(),getTranslations('FinanceV2'),searchParams]);
  if(!context)return <FinanceLoadError/>;
  return <main className="space-y-5 pb-12"><header><h1 className="text-3xl font-bold">{t('cheques')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('chequesHint')}</p></header>
    <FinanceChequeForm {...context} initialEntry={params.entry}/><FinanceChequeList {...context}/></main>;
}
