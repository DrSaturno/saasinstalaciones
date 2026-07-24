import Link from "next/link";
import { ArrowRight, CircleDollarSign, TrendingUp } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { DashboardOverview } from "@/lib/data/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardFinancePulse({ finances }: { finances: DashboardOverview["finances"] }) {
  const t = useTranslations("Dashboard");
  const format = useFormatter();

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><CircleDollarSign className="size-4 text-primary" aria-hidden="true" /><CardTitle>{t("financePulseTitle")}</CardTitle></div>
            <p className="mt-1 text-xs text-muted-foreground">{t("financePulseDescription")}</p>
          </div>
          <Link href="/finance" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">{t("viewFinance")}<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
        </div>
      </CardHeader>
      <CardContent>
        {finances.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{t("emptyFinance")}</p> : (
          <div className="grid gap-4 lg:grid-cols-2">
            {finances.map((row) => (
              <div key={row.currency} className="rounded-xl border p-4">
                <div className="flex items-center justify-between"><p className="font-mono text-xs font-semibold">{row.currency}</p>{row.growth !== null ? <span className={`flex items-center gap-1 font-mono text-xs ${row.growth >= 0 ? "text-success" : "text-destructive"}`}><TrendingUp className="size-3" aria-hidden="true" />{row.growth >= 0 ? "+" : ""}{row.growth}%</span> : null}</div>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Value label={t("contracted")} value={format.number(row.contracted, { style: "currency", currency: row.currency, maximumFractionDigits: 0 })} />
                  <Value label={t("realized")} value={format.number(row.completed, { style: "currency", currency: row.currency, maximumFractionDigits: 0 })} />
                  <Value label={t("financialPending")} value={format.number(row.pending, { style: "currency", currency: row.currency, maximumFractionDigits: 0 })} />
                  <Value label={t("projectedClose")} value={format.number(row.projectedMonth, { style: "currency", currency: row.currency, maximumFractionDigits: 0 })} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
function Value({ label, value }: { label: string; value: string }) {
  return <div><p className="font-mono text-sm font-semibold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}
