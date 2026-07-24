import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { CreateProjectDialog } from "@/components/company/create-project-dialog";
import { PROJECT_STATUS } from "@/lib/domain/status";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchClients } from "@/lib/data/clients";
import { fetchCoordinators } from "@/lib/data/team";
import { getCurrentUser } from "@/lib/auth";

export default async function ProjectsPage() {
  const [t, statusT] = await Promise.all([
    getTranslations("Projects"),
    getTranslations("Status"),
  ]);
  const supabase = await createClient();
  const [clients, coordinators, user] = await Promise.all([
    fetchClients(supabase),
    fetchCoordinators(supabase),
    getCurrentUser(),
  ]);

  // RLS filtra por empresa: no hace falta (ni conviene) filtrar acá.
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, client_name, status, starts_at, created_at")
    .order("created_at", { ascending: false });

  // Conteo de puntos por proyecto para el resumen de cada tarjeta.
  const { data: sites } = await supabase.from("sites").select("project_id, status");

  const siteStats = (sites ?? []).reduce<
    Record<string, { total: number; done: number }>
  >((acc, s) => {
    const entry = (acc[s.project_id] ??= { total: 0, done: 0 });
    entry.total++;
    if (s.status === "finalizada") entry.done++;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <CreateProjectDialog
          clients={clients.map(({ id, name }) => ({ id, name }))}
          coordinators={coordinators}
          canManageFinance={user?.role === "company_manager"}
          fixedCoordinatorId={
            user?.role === "coordinator" ? user.id : undefined
          }
        />
      </div>

      {(projects ?? []).length === 0 ? (
        <Card className="mt-8">
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">
              {t("empty")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(projects ?? []).map((project) => {
            const stats = siteStats[project.id] ?? { total: 0, done: 0 };
            const pct = stats.total
              ? Math.round((stats.done / stats.total) * 100)
              : 0;
            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-medium">{project.name}</h2>
                      <Badge variant="secondary" className="shrink-0">
                        {statusT(PROJECT_STATUS[project.status].key)}
                      </Badge>
                    </div>
                    {project.client_name && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {project.client_name}
                      </p>
                    )}

                    <div className="mt-6">
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-2xl">{stats.total}</span>
                        <span className="font-mono text-sm text-muted-foreground">
                          {pct}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("progress", { total: stats.total, done: stats.done })}
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-[var(--success)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
