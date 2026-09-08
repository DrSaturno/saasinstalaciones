import Link from "next/link";
import { ArrowRight, CircleDollarSign, TrendingDown, TrendingUp } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { DashboardOverview } from "@/lib/data/dashboard";
import { Metric } from "@/components/shared/metric";
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
          <div className="flex flex-col gap-6">
            {finances.map((row) => {
              const money = (value: number) =>
                format.number(value, { style: "currency", currency: row.currency, maximumFractionDigits: 0 });
              const Trend = row.growth !== null && row.growth < 0 ? TrendingDown : TrendingUp;
              return (
                <section key={row.currency} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-label font-semibold">{row.currency}</h3>
                    {row.growth !== null ? (
                      <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-caption font-medium ${row.growth >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        <Trend className="size-3" aria-hidden="true" />
                        {row.growth >= 0 ? "+" : ""}{row.growth}%
                      </span>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Metric label={t("contracted")} value={money(row.contracted)} />
                    <Metric label={t("realized")} value={money(row.completed)} />
                    <Metric label={t("financialPending")} value={money(row.pending)} />
                    <Metric label={t("projectedClose")} value={money(row.projectedMonth)} />
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
