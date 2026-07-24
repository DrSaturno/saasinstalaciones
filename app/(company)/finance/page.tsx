import { getTranslations } from "next-intl/server";
import { FinanceBreakdowns } from "@/components/company/finance-breakdowns";
import { FinanceExportButton } from "@/components/company/finance-export-button";
import { FinanceProjects } from "@/components/company/finance-projects";
import { FinanceSummary } from "@/components/company/finance-summary";
import { fetchFinancialOverview } from "@/lib/data/finance";
import { createClient } from "@/lib/supabase/server";
import { FinancePeriodFilter } from "@/components/company/finance-period-filter";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "company_manager") redirect("/dashboard");
  const query = await searchParams;
  const period = ["week", "fortnight", "month", "semester", "custom"].includes(query.period ?? "") ? query.period! : "month";
  const toDate = new Date();
  const days = period === "week" ? 7 : period === "fortnight" ? 15 : period === "semester" ? 180 : 30;
  const fromDate = new Date(toDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - days + 1);
  const from = period === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(query.from ?? "") ? query.from! : dateOnly(fromDate);
  const to = period === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(query.to ?? "") ? query.to! : dateOnly(toDate);
  const [t, supabase] = await Promise.all([getTranslations("Finance"), createClient()]);
  const data = await fetchFinancialOverview(supabase, { from, to });
  return (
    <main className="mx-auto max-w-[1480px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("eyebrow")}</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("description")}</p></div><FinanceExportButton rows={data.projects} /></header>
      <FinancePeriodFilter period={period} from={from} to={to} />
      <FinanceSummary data={data} />
      <FinanceProjects projects={data.projects} />
      <FinanceBreakdowns zones={data.zones} installers={data.installers} />
      <p className="text-xs leading-relaxed text-muted-foreground">{t("allocationNote")}</p>
    </main>
  );
}
