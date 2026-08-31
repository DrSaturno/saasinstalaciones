import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { InstallerEarningsOverview } from "@/lib/domain/installer-finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Filtros de la vista de ingresos del instalador.
 *
 * Formulario GET, sin JavaScript: esta área se usa desde el celular y muchas
 * veces con señal mala. Un formulario nativo funciona apenas llega el HTML.
 */
export async function EarningsFilters({
  companies,
  active,
}: {
  companies: InstallerEarningsOverview["companies"];
  active: {
    companyId?: string;
    from?: string;
    to?: string;
    orderNumber?: string;
    paymentStatus?: string;
  };
}) {
  const t = await getTranslations("InstallerFinance");
  const hasFilters = Boolean(
    active.companyId || active.from || active.to || active.orderNumber || active.paymentStatus,
  );

  const selectClass =
    "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20";

  return (
    <form method="get" className="rounded-2xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {companies.length > 1 ? (
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            {t("filterCompany")}
            <select name="company" defaultValue={active.companyId ?? ""} className={selectClass}>
              <option value="">{t("allCompanies")}</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="grid gap-1.5 text-xs text-muted-foreground">
          {t("filterPaymentStatus")}
          <select name="payment" defaultValue={active.paymentStatus ?? ""} className={selectClass}>
            <option value="">{t("allPayments")}</option>
            <option value="pending">{t("statusPending")}</option>
            <option value="paid">{t("statusPaid")}</option>
          </select>
        </label>

        <label className="grid gap-1.5 text-xs text-muted-foreground">
          {t("filterOrder")}
          <Input name="order" defaultValue={active.orderNumber ?? ""} placeholder={t("filterOrderPlaceholder")} className="h-10 font-mono" />
        </label>

        <label className="grid gap-1.5 text-xs text-muted-foreground">
          {t("filterFrom")}
          <Input type="date" name="from" defaultValue={active.from ?? ""} className="h-10" />
        </label>

        <label className="grid gap-1.5 text-xs text-muted-foreground">
          {t("filterTo")}
          <Input type="date" name="to" defaultValue={active.to ?? ""} className="h-10" />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="submit" size="sm">{t("applyFilters")}</Button>
        {hasFilters ? (
          <Button asChild size="sm" variant="ghost">
            <Link href="/earnings">{t("clearFilters")}</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
