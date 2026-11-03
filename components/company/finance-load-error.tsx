import { getTranslations } from "next-intl/server";
export async function FinanceLoadError() {
  const t=await getTranslations('FinanceV2');
  return <div role="alert" className="rounded-xl border bg-orange-50 p-6"><h1 className="font-semibold">{t('unavailableTitle')}</h1><p className="mt-2 text-sm">{t('unavailableBody')}</p></div>;
}
