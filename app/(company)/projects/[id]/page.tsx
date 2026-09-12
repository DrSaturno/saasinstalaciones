import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAllSites } from "@/lib/data/sites";
import { SitesTable } from "@/components/company/sites-table";
import { ManageInstallationsDialog } from "@/components/company/manage-installations-dialog";
import { ReuseSitesDialog } from "@/components/company/reuse-sites-dialog";
import { EditProjectDialog } from "@/components/company/edit-project-dialog";
import { ArchiveProjectButton } from "@/components/company/archive-project-button";
import { PROJECT_STATUS } from "@/lib/domain/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fetchClients } from "@/lib/data/clients";
import { fetchCoordinators } from "@/lib/data/team";
import { fetchActiveRoster } from "@/lib/data/orders";
import { BackLink } from "@/components/shared/back-link";
import { ProjectPerformancePanel } from "@/components/company/project-performance-panel";
import { ProjectSitesActions } from "@/components/company/project-sites-actions";
import { buildProjectPerformance } from "@/lib/domain/project-performance";

/**
 * El alta masiva de órdenes vive en esta ruta, y es trabajo O(n) con viajes
 * secuenciales a la base: por cada orden creada van la RPC de actividades, la
 * sincronización de agenda y —si hay instalador— la compuerta de asignación.
 * Con el proyecto insignia del blueprint (~2000 puntos) eso son miles de
 * viajes, y sin este valor regía el límite por defecto de la plataforma, que es
 * de segundos: la acción se cortaba a mitad del lote.
 *
 * 60 s es el techo del plan Hobby y es válido también en Pro, así que no ata el
 * despliegue a un plan. No alcanza para 2000 órdenes de una: para eso la acción
 * ahora es REANUDABLE —`create_order_activities` es idempotente y la pasada de
 * reparación recupera lo que quedó a medias—, de modo que reintentar avanza en
 * vez de condenar las órdenes incompletas. El alta en segundo plano queda como
 * el paso siguiente.
 */
export const maxDuration = 60;

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reuse?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [t, statusT, format] = await Promise.all([
    getTranslations("ProjectDetail"),
    getTranslations("Status"),
    getFormatter(),
  ]);
  const supabase = await createClient();
  const [{ data: project }, sites, { data: orderAmounts }, { data: incidents }, clients, coordinators, roster] = await Promise.all([
    supabase.from("projects").select("id, name, client_name, client_id, coordinator_id, description, status, starts_at, ends_at, country, zones, planned_installations, billing_mode, contract_amount, currency, min_completion_photos, archived_at").eq("id", id).single(),
    fetchAllSites(supabase, id),
    // Se amplía la consulta que ya existía en vez de agregar otra: el
    // rendimiento necesita costo, asignación y fecha de fin de las mismas
    // órdenes que ya se traían para el importe.
    supabase
      .from("work_orders")
      .select("status, amount, installer_amount, assigned_installer_id, scheduled_end_date, finalized_at")
      .eq("project_id", id),
    supabase
      .from("order_incidents")
      .select("status, severity, work_orders!inner(project_id)")
      .eq("work_orders.project_id", id),
    fetchClients(supabase),
    fetchCoordinators(supabase),
    fetchActiveRoster(supabase),
  ]);

  if (!project) notFound();

  // Quién coordina el proyecto: define qué órdenes ve en /coordination.
  const coordinatorName = project.coordinator_id
    ? (coordinators.find((c) => c.id === project.coordinator_id)?.name ?? null)
    : null;

  const activeSites = sites.filter((site) => !site.archived_at);
  const completedSites = activeSites.filter((site) => site.order_count > 0 && site.progress === 100).length;
  // Lo que crearía «Generar órdenes»: una por cada locación que aún no tiene.
  const sitesWithoutOrders = activeSites.filter((site) => site.order_count === 0).length;
  const totalOrders = activeSites.reduce((sum, site) => sum + site.order_count, 0);
  const completedOrders = activeSites.reduce((sum, site) => sum + site.completed_count, 0);
  const progress = totalOrders ? Math.round((completedOrders / totalOrders) * 100) : 0;
  const performance = buildProjectPerformance(
    {
      billingMode: project.billing_mode,
      contractAmount: project.contract_amount,
      currency: project.currency,
    },
    (orderAmounts ?? []).map((order) => ({
      status: order.status,
      amount: order.amount,
      installerAmount: order.installer_amount,
      installerId: order.assigned_installer_id,
      scheduledEndDate: order.scheduled_end_date,
      finalizedAt: order.finalized_at,
    })),
    (incidents ?? []).map((incident) => ({
      status: incident.status,
      severity: incident.severity,
    })),
    new Date().toISOString().slice(0, 10),
  );
  // El valor del proyecto sale del mismo cálculo que el panel: antes se sumaba
  // aparte y podían discrepar.
  const amount = format.number(performance.budget, { style: "currency", currency: project.currency });

  // Los nombres salen de `profiles` y no del roster activo: alguien que ya no
  // está en la empresa igual hizo el trabajo que figura acá y tiene que
  // aparecer.
  const installerProfiles = performance.installerIds.length
    ? ((
        await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", performance.installerIds)
      ).data ?? [])
    : [];
  const projectInstallers = installerProfiles
    .map((profile) => ({ id: profile.id, name: profile.full_name ?? t("unnamedInstaller") }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const VISIBLE_INSTALLERS = 6;
  const hiddenInstallers = projectInstallers.slice(VISIBLE_INSTALLERS);

  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <BackLink href="/projects" label={t("back")} />
      {query.reuse === "1" ? (
        <ReuseSitesDialog projectId={id} autoOpen hideTrigger />
      ) : null}

      <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <Badge variant="secondary">{statusT(PROJECT_STATUS[project.status].key)}</Badge>
            <Badge
              variant="outline"
              className="max-w-full truncate font-mono"
              title={`${project.country} · ${project.zones.join(" / ")}`}
            >
              {project.country} · {project.zones.slice(0, 3).join(" / ")}
              {project.zones.length > 3 ? ` +${project.zones.length - 3}` : ""}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            {project.client_name}
            {" · "}
            <span className="text-foreground">
              {t("coordinatorLabel")}:{" "}
              {coordinatorName ? (
                <Link href={`/team/${project.coordinator_id}`} className="font-medium hover:text-primary">
                  {coordinatorName}
                </Link>
              ) : (
                <span className="italic">{t("noCoordinator")}</span>
              )}
            </span>
          </p>
          {/* Fila propia y con wrap: en mobile los nombres bajan uno debajo del
              otro en vez de superponerse con el coordinador. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
              {t("installersLabel")}
            </span>
            {projectInstallers.length === 0 ? (
              <span className="text-sm italic text-muted-foreground">{t("noInstallers")}</span>
            ) : (
              <>
                {projectInstallers.slice(0, VISIBLE_INSTALLERS).map((installer) => (
                  <Link
                    key={installer.id}
                    href={`/team/${installer.id}`}
                    className="max-w-[15rem] truncate rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    {installer.name}
                  </Link>
                ))}
                {hiddenInstallers.length > 0 ? (
                  <span
                    className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground"
                    title={hiddenInstallers.map((installer) => installer.name).join(", ")}
                  >
                    {t("moreInstallers", { count: hiddenInstallers.length })}
                  </span>
                ) : null}
              </>
            )}
          </div>
          {project.description ? <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{project.description}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <EditProjectDialog projectId={project.id} clients={clients.map(({ id, name }) => ({ id, name }))} coordinators={coordinators} canManageFinance defaults={{
            name: project.name, clientName: project.client_name, description: project.description,
            clientId: project.client_id ?? "", coordinatorId: project.coordinator_id ?? "",
            startsAt: project.starts_at ?? "", endsAt: project.ends_at ?? "", country: project.country,
            zones: project.zones, plannedInstallations: project.planned_installations,
            billingMode: project.billing_mode, contractAmount: project.contract_amount,
            minCompletionPhotos: project.min_completion_photos,
            currency: project.currency,
          }} />
          <ArchiveProjectButton projectId={project.id} archived={Boolean(project.archived_at)} name={project.name} />
          <ManageInstallationsDialog
            projectId={project.id}
            planned={project.planned_installations}
            activeCount={activeSites.length}
          />
        </div>
      </div>

      {/* Retrasadas e incidencias vivían en el panel de «Ejecución», que se
          quitó por repetir terminadas y en curso. Estas dos no se repetían en
          ningún lado, y son las que avisan que algo se está complicando. */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {[
          { label: t("contracted"), value: project.planned_installations },
          { label: t("loaded"), value: activeSites.length },
          { label: t("completedSites"), value: completedSites },
          { label: t("openOrders"), value: Math.max(0, totalOrders - completedOrders) },
          { label: t("delayedOrders"), value: performance.orders.delayed, alert: performance.orders.delayed > 0 ? ("danger" as const) : null },
          { label: t("openIncidents"), value: performance.incidents.open, alert: performance.incidents.open > 0 ? ("warning" as const) : null },
          { label: t("projectValue"), value: amount },
        ].map((metric) => (
          <Card key={metric.label}>
            <CardContent className="pt-5">
              <p className={`font-mono text-xl font-semibold ${metric.alert === "danger" ? "text-destructive" : metric.alert === "warning" ? "text-warning" : ""}`}>
                {metric.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{metric.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-medium">{t("overallProgress")}</p><p className="text-xs text-muted-foreground">{t("completedOrders", { done: completedOrders, total: totalOrders })}</p></div>
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:max-w-xl"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${progress}%` }} /></div><span className="w-12 text-right font-mono text-lg">{progress}%</span></div>
        </CardContent>
      </Card>

      <div className="mt-4">
        <ProjectPerformancePanel performance={performance} />
      </div>

      <div className="mt-4">
        <ProjectSitesActions
          projectId={project.id}
          country={project.country}
          zones={project.zones}
          activeCount={activeSites.length}
          pendingOrders={sitesWithoutOrders}
          sites={activeSites.map((site) => ({
            id: site.id,
            name: site.name,
            city: site.city,
            hasOrder: site.order_count > 0,
          }))}
          roster={roster.map(({ id: rosterId, name }) => ({ id: rosterId, name }))}
          currency={project.currency}
          canManageFinance
          perInstallation={project.billing_mode === "per_installation"}
        />
      </div>

      <div className="mt-9">
        <div className="mb-4"><h2 className="text-lg font-semibold">{t("installations")}</h2><p className="text-sm text-muted-foreground">{t("installationsDescription")}</p></div>
        <SitesTable sites={sites} projectId={project.id} />
      </div>
    </div>
  );
}
