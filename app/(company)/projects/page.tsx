import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { CreateProjectDialog } from "@/components/company/create-project-dialog";
import { ProjectsView } from "@/components/company/projects-view";
import { Card, CardContent } from "@/components/ui/card";
import { fetchClients } from "@/lib/data/clients";
import { fetchCoordinators } from "@/lib/data/team";
import { getCurrentUser } from "@/lib/auth";

export default async function ProjectsPage() {
  const t = await getTranslations("Projects");
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
        <ProjectsView
          projects={(projects ?? []).map((project) => ({
            id: project.id,
            name: project.name,
            clientName: project.client_name ?? "",
            status: project.status,
            total: siteStats[project.id]?.total ?? 0,
            done: siteStats[project.id]?.done ?? 0,
          }))}
        />
      )}
    </div>
  );
}
