"use client";
import { useTranslations } from "next-intl";
import type { FinancePeriod } from "@/lib/domain/finance-ledger";

export function FinancePeriodControls({period,from,to,onChange}:{period:FinancePeriod;from:string;to:string;onChange:(period:FinancePeriod,from?:string,to?:string)=>void}) {
  const t=useTranslations('FinanceV2');
  return <fieldset className="flex flex-wrap items-end gap-2"><legend className="sr-only">{t('period')}</legend>
    <label className="text-xs text-muted-foreground">{t('period')}<select className="mt-1 block rounded-lg border bg-white p-2 text-sm text-foreground" value={period} onChange={(e)=>onChange(e.target.value as FinancePeriod)}>
      {(['day','week','fortnight','month','quarter','semester','year','custom'] as const).map((p)=><option value={p} key={p}>{t(`periods.${p}`)}</option>)}
    </select></label>
    <label className="text-xs text-muted-foreground">{t('from')}<input className="mt-1 block rounded-lg border bg-white p-2 text-sm" type="date" value={from} onChange={(e)=>onChange('custom',e.target.value,to)}/></label>
    <label className="text-xs text-muted-foreground">{t('to')}<input className="mt-1 block rounded-lg border bg-white p-2 text-sm" type="date" value={to} onChange={(e)=>onChange('custom',from,e.target.value)}/></label>
  </fieldset>;
}
