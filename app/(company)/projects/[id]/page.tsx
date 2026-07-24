import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAllSites } from "@/lib/data/sites";
import { SitesTable } from "@/components/company/sites-table";
import { ManageInstallationsDialog } from "@/components/company/manage-installations-dialog";
import { EditProjectDialog } from "@/components/company/edit-project-dialog";
import { PROJECT_STATUS } from "@/lib/domain/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fetchClients } from "@/lib/data/clients";
import { fetchCoordinators } from "@/lib/data/team";
import { getCurrentUser } from "@/lib/auth";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, statusT, format] = await Promise.all([
    getTranslations("ProjectDetail"),
    getTranslations("Status"),
    getFormatter(),
  ]);
  const supabase = await createClient();
  const [{ data: project }, sites, { data: orderAmounts }, clients, coordinators, user] = await Promise.all([
    supabase.from("projects").select("id, name, client_name, client_id, coordinator_id, description, status, starts_at, ends_at, country, zones, planned_installations, billing_mode, contract_amount, currency").eq("id", id).single(),
    fetchAllSites(supabase, id),
    supabase.from("work_orders").select("status, amount").eq("project_id", id).neq("status", "cancelada"),
    fetchClients(supabase),
    fetchCoordinators(supabase),
    getCurrentUser(),
  ]);

  if (!project) notFound();

  const activeSites = sites.filter((site) => !site.archived_at);
  const archivedCount = sites.length - activeSites.length;
  const completedSites = activeSites.filter((site) => site.order_count > 0 && site.progress === 100).length;
  const totalOrders = activeSites.reduce((sum, site) => sum + site.order_count, 0);
  const completedOrders = activeSites.reduce((sum, site) => sum + site.completed_count, 0);
  const progress = totalOrders ? Math.round((completedOrders / totalOrders) * 100) : 0;
  const financialTotal = project.billing_mode === "project"
    ? Number(project.contract_amount ?? 0)
    : (orderAmounts ?? []).reduce((sum, order) => sum + Number(order.amount ?? 0), 0);
  const amount = format.number(financialTotal, { style: "currency", currency: project.currency });

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">{t("back")}</Link>

      <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <Badge variant="secondary">{statusT(PROJECT_STATUS[project.status].key)}</Badge>
            <Badge variant="outline" className="font-mono">{project.country} · {project.zones.join(" / ")}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">{project.client_name}</p>
          {project.description ? <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{project.description}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <EditProjectDialog projectId={project.id} clients={clients.map(({ id, name }) => ({ id, name }))} coordinators={coordinators} canManageFinance={user?.role === "company_manager"} fixedCoordinatorId={user?.role === "coordinator" ? user.id : undefined} defaults={{
            name: project.name, clientName: project.client_name, description: project.description,
            clientId: project.client_id ?? "", coordinatorId: project.coordinator_id ?? "",
            startsAt: project.starts_at ?? "", endsAt: project.ends_at ?? "", country: project.country,
            zones: project.zones, plannedInstallations: project.planned_installations,
            billingMode: project.billing_mode, contractAmount: project.contract_amount,
            currency: project.currency,
          }} />
          <ManageInstallationsDialog projectId={project.id} country={project.country} zones={project.zones} planned={project.planned_installations} activeCount={activeSites.length} archivedCount={archivedCount} />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: t("contracted"), value: project.planned_installations },
          { label: t("loaded"), value: activeSites.length },
          { label: t("completedSites"), value: completedSites },
          { label: t("openOrders"), value: Math.max(0, totalOrders - completedOrders) },
          ...(user?.role === "company_manager"
            ? [{ label: t("projectValue"), value: amount }]
            : []),
        ].map((metric) => <Card key={metric.label}><CardContent className="pt-5"><p className="font-mono text-xl font-semibold">{metric.value}</p><p className="mt-1 text-xs text-muted-foreground">{metric.label}</p></CardContent></Card>)}
      </div>

      <Card className="mt-4">
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-medium">{t("overallProgress")}</p><p className="text-xs text-muted-foreground">{t("completedOrders", { done: completedOrders, total: totalOrders })}</p></div>
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:max-w-xl"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${progress}%` }} /></div><span className="w-12 text-right font-mono text-lg">{progress}%</span></div>
        </CardContent>
      </Card>

      <div className="mt-9">
        <div className="mb-4"><h2 className="text-lg font-semibold">{t("installations")}</h2><p className="text-sm text-muted-foreground">{t("installationsDescription")}</p></div>
        <SitesTable sites={sites} projectId={project.id} />
      </div>
    </div>
  );
}
