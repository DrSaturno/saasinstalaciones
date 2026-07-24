import Link from "next/link";
import { ArrowUpRight, ShieldCheck, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DashboardOverview } from "@/lib/data/dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardQuality({
  quality,
  incidents,
}: Pick<DashboardOverview, "quality" | "incidents">) {
  const t = useTranslations("Dashboard");
  const open = incidents.filter((item) => item.status === "open");

  return (
    <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="border-primary/20 bg-[linear-gradient(145deg,var(--card),color-mix(in_oklab,var(--primary-soft)_35%,var(--card)))]">
        <CardHeader className="border-b"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" aria-hidden="true" /><CardTitle>{t("firstResolutionTitle")}</CardTitle></div></CardHeader>
        <CardContent>
          <p className="font-mono text-4xl font-semibold tracking-tight">{quality.firstResolutionRate}%</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t("firstResolutionDescription")}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t pt-4">
            <div><p className="font-mono text-lg font-semibold">{quality.finalized}</p><p className="text-[11px] text-muted-foreground">{t("finalizedOrders")}</p></div>
            <div><p className="font-mono text-lg font-semibold">{quality.repeatVisits}</p><p className="text-[11px] text-muted-foreground">{t("repeatVisits")}</p></div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><TriangleAlert className="size-4 text-warning" aria-hidden="true" /><CardTitle>{t("incidentsTitle")}</CardTitle></div>
            <Badge variant={open.length ? "outline" : "default"}>{t("openIncidents", { count: open.length })}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{t("incidentsDescription")}</p>
        </CardHeader>
        <CardContent className="p-0">
          {incidents.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("emptyIncidents")}</p> : (
            <div className="divide-y">
              {incidents.slice(0, 8).map((incident) => (
                <Link key={incident.id} href={`/orders/${incident.orderId}`} className="group grid gap-2 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:grid-cols-[120px_1fr_auto] sm:items-center">
                  <span className="font-mono text-xs text-muted-foreground">{incident.number}</span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 truncate text-sm font-medium">{t(`incidentCategories.${incident.category}`)}<ArrowUpRight className="size-3.5 opacity-0 group-hover:opacity-100" aria-hidden="true" /></p>
                    <p className="truncate text-xs text-muted-foreground">{incident.siteName}{incident.description ? ` · ${incident.description}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {incident.requiresRevisit ? <Badge variant="outline">{t("requiresRevisit")}</Badge> : null}
                    <Badge variant={incident.severity === "critical" ? "destructive" : "outline"}>{t(`incidentSeverity.${incident.severity}`)}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
