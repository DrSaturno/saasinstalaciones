import { getFormatter, getTranslations } from "next-intl/server";
import type { InstallerEarningsOverview } from "@/lib/domain/installer-finance";

/**
 * Totales del instalador, por moneda.
 *
 * Un total por moneda y nunca sumados entre sí: alguien que trabaja en
 * Argentina y en Brasil tiene dos ingresos distintos, no uno mezclado.
 */
export async function EarningsSummary({
  totals,
}: {
  totals: InstallerEarningsOverview["totals"];
}) {
  const [t, format] = await Promise.all([
    getTranslations("InstallerFinance"),
    getFormatter(),
  ]);
  const money = (value: number, currency: string) =>
    format.number(value, { style: "currency", currency, maximumFractionDigits: 0 });

  if (totals.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {totals.map((total) => (
        <section key={total.currency} className="flex flex-col gap-3">
          {totals.length > 1 ? (
            <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {total.currency}
            </h2>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-card p-4">
              <p className="font-mono text-2xl font-semibold">{money(total.earned, total.currency)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("totalEarned")}</p>
              <p className="mt-0.5 text-caption text-muted-foreground">{t("doneOrders", { count: total.doneOrders })}</p>
            </div>
            <div className="rounded-2xl border border-warning/40 bg-cream/30 p-4">
              <p className="font-mono text-2xl font-semibold">{money(total.unpaid, total.currency)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("totalUnpaid")}</p>
              <p className="mt-0.5 text-caption text-muted-foreground">{t("ordersCount", { count: total.unpaidOrders })}</p>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <p className="font-mono text-2xl font-semibold text-emerald-600">{money(total.paid, total.currency)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("totalPaid")}</p>
              <p className="mt-0.5 text-caption text-muted-foreground">{t("ordersCount", { count: total.paidOrders })}</p>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
