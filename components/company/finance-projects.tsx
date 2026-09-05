import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { FinancialOverview } from "@/lib/domain/finance";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function FinanceProjects({ projects }: { projects: FinancialOverview["projects"] }) {
  const t = useTranslations("Finance");
  const format = useFormatter();
  const money = (value: number, currency: string) => format.number(value, { style: "currency", currency, maximumFractionDigits: 0 });
  return (
    <Card>
      <CardHeader className="border-b"><CardTitle>{t("projectsTitle")}</CardTitle><p className="text-xs text-muted-foreground">{t("projectsDescription")}</p></CardHeader>
      <CardContent className="overflow-x-auto px-0">
        {projects.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("empty")}</p> : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b bg-muted/30 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">{t("project")}</th><th className="px-4 py-3 font-medium">{t("modeLabel")}</th><th className="px-4 py-3 text-right font-medium">{t("contracted")}</th><th className="px-4 py-3 text-right font-medium">{t("completed")}</th><th className="px-4 py-3 text-right font-medium">{t("installerCost")}</th><th className="px-4 py-3 text-right font-medium">{t("margin")}</th><th className="px-4 py-3 text-right font-medium">{t("progress")}</th></tr></thead>
            <tbody className="divide-y">{projects.map((project) => <tr key={project.id} className="hover:bg-muted/30"><td className="px-4 py-3"><Link className="font-medium hover:text-primary" href={`/projects/${project.id}`}>{project.name}</Link><p className="font-mono text-caption text-muted-foreground">{t("ordersCount", { count: project.orders })}</p></td><td className="px-4 py-3"><Badge variant="outline">{t(`mode.${project.mode}`)}</Badge></td><td className="px-4 py-3 text-right font-mono">{money(project.contracted, project.currency)}</td><td className="px-4 py-3 text-right font-mono text-emerald-600">{money(project.completed, project.currency)}</td><td className="px-4 py-3 text-right font-mono">{project.installerCost ? money(project.installerCost, project.currency) : <span className="text-muted-foreground">{t("noCostLoaded")}</span>}</td><td className={`px-4 py-3 text-right font-mono font-semibold ${project.margin < 0 ? "text-destructive" : ""}`}>{project.installerCost ? money(project.margin, project.currency) : <span className="font-normal text-muted-foreground">—</span>}</td><td className="px-4 py-3 text-right font-mono font-semibold">{project.progress}%</td></tr>)}</tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
