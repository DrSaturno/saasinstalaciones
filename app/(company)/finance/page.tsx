import { getTranslations } from "next-intl/server";
import { FinanceBreakdowns } from "@/components/company/finance-breakdowns";
import { FinanceExportButton } from "@/components/company/finance-export-button";
import { FinanceProjects } from "@/components/company/finance-projects";
import { FinanceSummary } from "@/components/company/finance-summary";
import { fetchFinancialOverview } from "@/lib/data/finance";
import { createClient } from "@/lib/supabase/server";

export default async function FinancePage() {
  const [t, supabase] = await Promise.all([getTranslations("Finance"), createClient()]);
  const data = await fetchFinancialOverview(supabase);
  return (
    <main className="mx-auto max-w-[1480px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("eyebrow")}</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("description")}</p></div><FinanceExportButton rows={data.projects} /></header>
      <FinanceSummary data={data} />
      <FinanceProjects projects={data.projects} />
      <FinanceBreakdowns zones={data.zones} installers={data.installers} />
      <p className="text-xs leading-relaxed text-muted-foreground">{t("allocationNote")}</p>
    </main>
  );
}
