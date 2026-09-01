import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Archive, CalendarDays, History, TriangleAlert, UserRound } from "lucide-react";
import type { LocationProjectHistory as ProjectHistory } from "@/lib/domain/location-detail";
import { PROJECT_STATUS } from "@/lib/domain/status";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function associationKey(status: string): "planned" | "active" | "paused" | "completed" | "cancelled" | "archived" | "unreconciled" {
  switch (status) {
    case "planned":
    case "active":
    case "paused":
    case "completed":
    case "cancelled":
    case "archived":
      return status;
    default:
      return "unreconciled";
  }
}

export async function LocationProjectHistory({ projects }: { projects: ProjectHistory[] }) {
  const [t, statusT, format] = await Promise.all([
    getTranslations("CanonicalLocation"),
    getTranslations("Status"),
    getFormatter(),
  ]);

  return (
    <section id="trayectoria" aria-labelledby="location-history-title">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
          <History className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 id="location-history-title" className="text-lg font-semibold">
            {t("history.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("history.description")}</p>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("history.empty")}
        </div>
      ) : (
        <div className="relative space-y-4 pl-6 before:absolute before:bottom-4 before:left-[7px] before:top-4 before:w-px before:bg-border">
          {projects.map((project) => {
            const dateParts = [project.startsAt, project.endsAt]
              .filter((date): date is string => Boolean(date))
              .map((date) => format.dateTime(new Date(`${date}T12:00:00`), { dateStyle: "medium" }));
            return (
              <article key={project.projectId} className="relative">
                <span className="absolute -left-6 top-6 size-[15px] rounded-full border-[4px] border-background bg-primary" />
                <Card className="overflow-visible">
                  <CardContent className="pt-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <Link href={`/projects/${project.projectId}`} className="text-base font-semibold transition-colors hover:text-primary">
                          {project.projectName ?? t("history.unknownProject")}
                        </Link>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {project.projectStatus ? (
                            <Badge variant="secondary">
                              {statusT(PROJECT_STATUS[project.projectStatus].key)}
                            </Badge>
                          ) : null}
                          <Badge variant={project.associationStatus === "unreconciled" ? "destructive" : "outline"}>
                            {t(`association.${associationKey(project.associationStatus)}`)}
                          </Badge>
                          {project.archivedAt ? (
                            <span className="inline-flex items-center gap-1">
                              <Archive className="size-3" aria-hidden="true" />
                              {t("history.archivedProject")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {dateParts.length ? (
                        <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                          <CalendarDays className="size-3.5" aria-hidden="true" />
                          {dateParts.join(" — ")}
                        </span>
                      ) : null}
                    </div>

                    {project.scope || project.unitQuantity > 1 ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {project.scope || t("history.noScope")}
                        {project.unitQuantity > 1
                          ? ` · ${t("history.units", { count: project.unitQuantity })}`
                          : null}
                      </p>
                    ) : null}

                    <div className="mt-4 divide-y overflow-hidden rounded-xl border bg-background">
                      {project.orders.length === 0 ? (
                        <p className="px-4 py-5 text-sm text-muted-foreground">{t("history.noOrders")}</p>
                      ) : (
                        project.orders.map((order) => (
                          <Link key={order.id} href={`/orders/${order.id}`} className="grid gap-2 px-4 py-3 transition-colors hover:bg-muted/40 sm:grid-cols-[110px_1fr_auto] sm:items-center">
                            <span className="font-mono text-xs text-muted-foreground">{order.order_number}</span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{order.title}</p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                <span>
                                  {order.scheduled_date
                                    ? format.dateTime(new Date(`${order.scheduled_date}T12:00:00`), { dateStyle: "medium" })
                                    : t("history.unscheduled")}
                                </span>
                                {order.installerName ? (
                                  <span className="inline-flex items-center gap-1">
                                    <UserRound className="size-3" aria-hidden="true" />
                                    {order.installerName}
                                  </span>
                                ) : null}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                              {order.incidentCount > 0 ? (
                                <span className={order.openIncidentCount > 0 ? "inline-flex items-center gap-1 text-xs text-destructive" : "inline-flex items-center gap-1 text-xs text-muted-foreground"}>
                                  <TriangleAlert className="size-3.5" aria-hidden="true" />
                                  {t("history.incidents", { count: order.incidentCount })}
                                </span>
                              ) : null}
                              <StatusBadge status={order.status} kind="order" />
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
