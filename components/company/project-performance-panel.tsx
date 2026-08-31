import {
  AlertTriangle,
  CalendarClock,
  CircleDollarSign,
  HandCoins,
  TrendingDown,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ProjectPerformance } from "@/lib/domain/project-performance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Cómo le fue al proyecto: plata a la izquierda, ejecución a la derecha.
 *
 * Cuando no hay ningún costo cargado no muestra un margen del 100% —que sería
 * mentira—, sino que dice que falta el dato. Un número inventado es peor que
 * ninguno cuando alguien va a decidir con él.
 */
export async function ProjectPerformancePanel({
  performance,
}: {
  performance: ProjectPerformance;
}) {
  const [t, format] = await Promise.all([
    getTranslations("ProjectPerformance"),
    getFormatter(),
  ]);
  const money = (value: number) =>
    format.number(value, {
      style: "currency",
      currency: performance.currency,
      maximumFractionDigits: 0,
    });

  const profitable = performance.profit >= 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="size-4 text-primary" aria-hidden="true" />
            <div>
              <CardTitle>{t("financialTitle")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("financialDescription")}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="font-mono text-xl font-semibold text-emerald-600">{money(performance.revenue)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("revenue")}</p>
            </div>
            <div>
              <p className="font-mono text-xl font-semibold">
                {performance.costMissing ? <span className="text-muted-foreground">—</span> : money(performance.installerCost)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t("installerCost")}</p>
            </div>
          </div>

          {performance.costMissing ? (
            <div className="rounded-xl border border-warning/40 bg-cream/30 p-3 text-xs leading-relaxed">
              {t("costMissing")}
            </div>
          ) : (
            <div className="flex items-end justify-between gap-4 rounded-xl border bg-muted/30 p-4">
              <div>
                <p className={`font-mono text-2xl font-semibold ${profitable ? "" : "text-destructive"}`}>
                  {money(performance.profit)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("profit")}</p>
              </div>
              {performance.marginPct !== null ? (
                <span className={`flex items-center gap-1 font-mono text-sm font-semibold ${profitable ? "text-emerald-600" : "text-destructive"}`}>
                  {profitable ? <TrendingUp className="size-4" aria-hidden="true" /> : <TrendingDown className="size-4" aria-hidden="true" />}
                  {t("margin", { value: performance.marginPct })}
                </span>
              ) : null}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("budgetVsReal")}</span>
              <span className="font-mono">
                {money(performance.revenue)} <span className="text-muted-foreground">/ {money(performance.budget)}</span>
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, performance.budgetUsedPct ?? 0)}%` }}
              />
            </div>
          </div>

          {!performance.costMissing && performance.committedCost > performance.installerCost ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HandCoins className="size-3.5 shrink-0" aria-hidden="true" />
              {t("committedCost", { value: money(performance.committedCost) })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <UsersRound className="size-4 text-primary" aria-hidden="true" />
            <div>
              <CardTitle>{t("executionTitle")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("executionDescription")}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 pt-5 sm:grid-cols-3">
          <div>
            <p className="font-mono text-xl font-semibold">{performance.orders.done}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("ordersDone")}</p>
          </div>
          <div>
            <p className="font-mono text-xl font-semibold">{performance.orders.open}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("ordersOpen")}</p>
          </div>
          <div>
            <p className={`flex items-center gap-1.5 font-mono text-xl font-semibold ${performance.orders.delayed ? "text-destructive" : ""}`}>
              {performance.orders.delayed ? <CalendarClock className="size-4" aria-hidden="true" /> : null}
              {performance.orders.delayed}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("ordersDelayed")}</p>
          </div>
          <div>
            <p className="font-mono text-xl font-semibold">{performance.installers}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("installersInvolved")}</p>
          </div>
          <div className="col-span-2">
            <p className={`flex items-center gap-1.5 font-mono text-xl font-semibold ${performance.incidents.open ? "text-warning" : ""}`}>
              {performance.incidents.open ? <AlertTriangle className="size-4" aria-hidden="true" /> : null}
              {performance.incidents.open}
              <span className="font-sans text-xs font-normal text-muted-foreground">
                {t("ofTotalIncidents", { total: performance.incidents.total })}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("openIncidents")}
              {performance.incidents.critical > 0 ? (
                <span className="ml-1.5 text-destructive">{t("criticalIncidents", { count: performance.incidents.critical })}</span>
              ) : null}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
