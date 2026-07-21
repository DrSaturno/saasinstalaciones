import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { ORDER_STATUS } from "@/lib/domain/status";
import type { OrderStatus } from "@/types/database";

export default async function CompanyDashboard() {
  const t = await getTranslations("Dashboard");
  const supabase = await createClient();

  const [{ count: projectCount }, { count: siteCount }, { data: orders }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      supabase.from("sites").select("*", { count: "exact", head: true }),
      supabase.from("work_orders").select("status"),
    ]);

  const byStatus = (orders ?? []).reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});
  const openOrders = (orders ?? []).filter(
    (o) => o.status !== "finalizada" && o.status !== "cancelada",
  ).length;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <Button asChild>
          <Link href="/projects">{t("viewProjects")}</Link>
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { value: projectCount ?? 0, label: t("activeProjects") },
          { value: siteCount ?? 0, label: t("totalSites") },
          { value: openOrders, label: t("openOrders") },
          { value: byStatus.finalizada ?? 0, label: t("completedOrders") },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-6">
              <p className="font-mono text-2xl font-medium">{kpi.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mt-10 text-sm font-medium text-muted-foreground">
        {t("ordersByStatus")}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(ORDER_STATUS) as OrderStatus[])
          .filter((s) => (byStatus[s] ?? 0) > 0)
          .map((status) => (
            <div
              key={status}
              className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2"
            >
              <StatusBadge status={status} kind="order" />
              <span className="font-mono text-sm">{byStatus[status]}</span>
            </div>
          ))}
        {openOrders === 0 && (byStatus.finalizada ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        )}
      </div>
    </div>
  );
}
