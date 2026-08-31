import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EarningsFilters } from "@/components/installer/earnings-filters";
import { EarningsList } from "@/components/installer/earnings-list";
import { EarningsSummary } from "@/components/installer/earnings-summary";
import { getCurrentUser } from "@/lib/auth";
import { fetchInstallerEarnings } from "@/lib/data/installer-finance";
import { createClient } from "@/lib/supabase/server";
import type { PaymentStatus } from "@/types/database";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Los ingresos del instalador: lo suyo, de todas las empresas para las que
 * trabaja, y nada más.
 *
 * El id que se consulta sale SIEMPRE de la sesión, nunca de la URL. Aunque la
 * base ya lo impediría, tomarlo de un parámetro dejaría insinuada una puerta
 * para mirar los ingresos de otra persona.
 */
export default async function InstallerFinancePage({
  searchParams,
}: {
  searchParams: Promise<{
    company?: string;
    from?: string;
    to?: string;
    order?: string;
    payment?: string;
  }>;
}) {
  const [user, query, t] = await Promise.all([
    getCurrentUser(),
    searchParams,
    getTranslations("InstallerFinance"),
  ]);
  if (!user) redirect("/login");

  const payment: PaymentStatus | undefined =
    query.payment === "paid" || query.payment === "pending" ? query.payment : undefined;
  const filters = {
    companyId: query.company || undefined,
    from: DATE.test(query.from ?? "") ? query.from : undefined,
    to: DATE.test(query.to ?? "") ? query.to : undefined,
    orderNumber: query.order?.trim() || undefined,
    paymentStatus: payment,
  };

  const supabase = await createClient();
  const data = await fetchInstallerEarnings(supabase, user.id, filters);

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5">
      <div className="rounded-2xl bg-brand-purple px-5 py-6 text-white sm:px-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/60">{t("eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-white/70">{t("description")}</p>
      </div>

      <EarningsSummary totals={data.totals} />
      <EarningsFilters
        companies={data.companies}
        active={{
          companyId: filters.companyId,
          from: filters.from,
          to: filters.to,
          orderNumber: filters.orderNumber,
          paymentStatus: filters.paymentStatus,
        }}
      />
      <EarningsList rows={data.rows} />
    </div>
  );
}
