import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Clock3, Gauge, Landmark } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { FinancialOverview } from "@/lib/domain/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function FinanceSummary({ data }: { data: FinancialOverview }) {
  const t = useTranslations("Finance");
  const format = useFormatter();
  const maxMonth = Math.max(1, ...data.months.map((month) => month.value));
  const icons = [Landmark, CircleDollarSign, Clock3, Gauge];

  return (
    <div className="space-y-4">
      {data.currencies.map((currency) => {
        const values = [currency.contracted, currency.completed, currency.pending, currency.average];
        const labels = [t("contracted"), t("completed"), t("pending"), t("average")];
        return (
          <section key={currency.currency} className="space-y-3">
            <div className="flex items-center gap-2"><h2 className="font-mono text-xs font-semibold uppercase tracking-widest">{currency.currency}</h2>{currency.growth === null ? <span className="text-xs text-muted-foreground">{t("growthNew")}</span> : <span className={`flex items-center text-xs font-medium ${currency.growth >= 0 ? "text-emerald-600" : "text-destructive"}`}>{currency.growth >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{t("growth", { value: currency.growth })}</span>}</div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {values.map((value, index) => { const Icon = icons[index]; return <Card key={labels[index]}><CardContent className="flex items-start justify-between gap-4 py-1"><div><p className="font-mono text-xl font-semibold">{format.number(value, { style: "currency", currency: currency.currency, maximumFractionDigits: 0 })}</p><p className="mt-1 text-xs text-muted-foreground">{labels[index]}</p></div><Icon className="size-4 text-primary" aria-hidden="true" /></CardContent></Card>; })}
            </div>
          </section>
        );
      })}
      <Card>
        <CardHeader className="border-b"><CardTitle>{t("trendTitle")}</CardTitle><p className="text-xs text-muted-foreground">{t("trendDescription")}</p></CardHeader>
        <CardContent>
          {data.months.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t("emptyTrend")}</p> : <div className="flex min-h-48 items-end gap-2 overflow-x-auto pt-8">{data.months.slice(-18).map((month) => <div key={`${month.currency}-${month.month}`} className="flex min-w-14 flex-1 flex-col items-center justify-end gap-2"><span className="font-mono text-[10px] text-muted-foreground">{format.number(month.value, { notation: "compact", maximumFractionDigits: 1 })}</span><div className="w-full max-w-14 rounded-t-md bg-primary/80" style={{ height: `${Math.max(6, (month.value / maxMonth) * 120)}px` }} /><span className="font-mono text-[10px] text-muted-foreground">{month.month.slice(2)} · {month.currency}</span></div>)}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
