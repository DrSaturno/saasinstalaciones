import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DashboardOverview } from "@/lib/data/dashboard";
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
                    <p className="truncate font-medium">{project.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{project.clientName}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 font-mono text-sm font-semibold text-primary">
                    {project.progress}% <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${project.progress}%` }} />
                </div>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">{t("ordersProgress", { done: project.completed, total: project.total })}</p>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
