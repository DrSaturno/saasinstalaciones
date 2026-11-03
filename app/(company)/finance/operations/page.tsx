import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FinanceEntryForm } from "@/components/company/finance-entry-form";
import { FinanceSupplierForm } from "@/components/company/finance-supplier-form";
import { FinanceRulesForm } from "@/components/company/finance-rules-form";
import { FinanceOperationsTable } from "@/components/company/finance-operations-table";
import { getCurrentUser } from "@/lib/auth";
import { fetchFinanceOperations } from "@/lib/data/finance-operations";
import { createClient } from "@/lib/supabase/server";
import { countryTimezone } from "@/lib/domain/availability";
import { financeBusinessDate } from "@/lib/domain/finance-business-date";
import { buildFinanceDemo } from "@/lib/domain/finance-demo";
import { buildFinanceForecast } from "@/lib/domain/finance-forecast";

export default async function FinanceOperationsPage({ searchParams }: {
  searchParams: Promise<{ status?: string; direction?: string; from?: string; to?: string; q?: string; demo?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "company_manager" || !user.companyId ||
      ("canManageFinance" in user && !user.canManageFinance)) redirect("/dashboard");
  const [t, supabase, filters] = await Promise.all([
    getTranslations("FinanceOperations"), createClient(), searchParams,
  ]);
  const demo = filters.demo === "1";
  const { data: company } = await supabase.from("companies").select("country").eq("id", user.companyId).maybeSingle();
  const today = financeBusinessDate(new Date(), countryTimezone(company?.country ?? "AR"));
  const data = demo ? buildFinanceDemo(today, filters) : await fetchFinanceOperations(supabase, user.companyId, filters);
  if (data.error) return <main className="mx-auto max-w-6xl space-y-4 p-4">
    <Link href="/finance" className="text-sm text-primary hover:underline">← {t("back")}</Link>
    <h1 className="text-2xl font-bold">{t("title")}</h1>
    <p className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm">{t("schemaPending")}</p>
    <Link href="/finance/operations?demo=1" className="text-sm font-semibold text-primary hover:underline">{t("demoLink")}</Link>
  </main>;
  const { forecast, fixed, unscheduled, importedReview } = buildFinanceForecast(data.overview, today);
  return <main className="mx-auto max-w-[1480px] space-y-5 pb-12">
    <div>
      <Link href="/finance" className="text-sm text-primary hover:underline">← {t("back")}</Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      {demo && <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{t("demoBanner")}</p>}
    </div>
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border bg-white p-4"><p className="text-xs text-muted-foreground">{t("nextPayments")}</p>
        <p className="mt-2 text-lg font-semibold">{forecast.size} {t("scheduledGroups")}</p>
        <p className="text-xs text-muted-foreground">{t("rules", { amba: t(`weekdays.${data.rules?.amba_weekday ?? 1}` as "weekdays.1"), interior: t(`weekdays.${data.rules?.interior_weekday ?? 2}` as "weekdays.2") })}</p>
      </div>
      <div className="rounded-xl border bg-white p-4"><p className="text-xs text-muted-foreground">{t("withoutDate")}</p>
        <p className="mt-2 text-lg font-semibold">{unscheduled}</p>
        <p className="text-xs text-muted-foreground">{t("waitingCompletion")}</p>
      </div>
      <div className="rounded-xl border bg-white p-4"><p className="text-xs text-muted-foreground">{t("fixedCosts")}</p>
        {[...fixed].map(([currency, amount]) => <p key={currency} className="font-mono text-lg font-semibold">{new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(amount)}</p>)}
        {fixed.size === 0 && <p className="mt-2 text-lg font-semibold">—</p>}
      </div>
    </div>
    <section className="rounded-xl border bg-white p-4">
      <h2 className="font-semibold">{t("forecast")}</h2>
      <p className="text-xs text-muted-foreground">{t("forecastNote")}</p>
      {importedReview > 0 && <p className="mt-2 text-xs text-orange-700">{t("excludedImported", { count: importedReview })}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {[...forecast].sort(([a], [b]) => a.localeCompare(b)).map(([key, amount]) => {
          const [date, zone, currency] = key.split("|");
          return <div key={key} className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
            <span className="font-mono">{date}</span> · {zone === "other" ? t("notApplicable") : zone.toUpperCase()}
            <strong className="ml-2 font-mono">{new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(amount)}</strong>
          </div>;
        })}
        {forecast.size === 0 && <p className="text-sm text-muted-foreground">{t("emptyForecast")}</p>}
      </div>
    </section>
    {!demo && <><FinanceSupplierForm installers={data.installers} />
      <FinanceRulesForm key={`${data.rules?.amba_weekday ?? 1}-${data.rules?.interior_weekday ?? 2}`} amba={data.rules?.amba_weekday ?? 1} interior={data.rules?.interior_weekday ?? 2} />
      <FinanceEntryForm suppliers={data.suppliers} clients={data.clients} /></>}
    <FinanceOperationsTable entries={data.entries} documents={data.documents} filters={filters} today={today} demo={demo} />
  </main>;
}
