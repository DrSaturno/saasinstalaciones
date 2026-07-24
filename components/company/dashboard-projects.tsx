import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DashboardOverview } from "@/lib/data/dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardProjects({ projects }: { projects: DashboardOverview["projects"] }) {
  const t = useTranslations("Dashboard");

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{t("projectsTitle")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("projectsDescription")}</p>
      </CardHeader>
      <CardContent className="px-0">
        {projects.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("emptyProjects")}</p>
        ) : (
          <div className="divide-y">
            {projects.slice(0, 8).map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="group block px-4 py-4 transition-colors hover:bg-muted/40">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{project.name}</p>
                      <Badge
                        variant={project.health === "delayed" ? "destructive" : "outline"}
                        className={project.health === "atRisk" ? "border-amber-300 bg-amber-50 text-amber-900" : project.health === "onTrack" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}
                      >
                        {t(`projectHealth.${project.health}`)}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{project.clientName}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 font-mono text-sm font-semibold text-primary">
                    {project.progress}% <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${project.progress}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
                  <span>{t("ordersProgress", { done: project.completed, total: project.total })}</span>
                  <span className={project.variance < 0 ? "text-destructive" : "text-success"}>{t("planVariance", { value: project.variance })}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{project.forecastDate ? t("forecastDate", { date: project.forecastDate }) : t("forecastPending")}</span>
                  {project.requiredPerWeek > 0 ? <span>{t("requiredPerWeek", { count: project.requiredPerWeek })}</span> : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
