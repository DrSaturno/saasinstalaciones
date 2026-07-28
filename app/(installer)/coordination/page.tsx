import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, ROLE_HOME } from "@/lib/auth";
import { CoordinationBoard } from "@/components/installer/coordination-board";

/**
 * Tablero de coordinación: exclusivo del coordinador dentro del área
 * instalador. Lista las órdenes de los proyectos que tiene a cargo para
 * aceptarlas, validarlas o moverlas de estado. RLS acota todo a sus proyectos.
 */
export default async function CoordinationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "coordinator") redirect(ROLE_HOME[user.role]);

  const t = await getTranslations("Coordination");
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("coordinator_id", user.id)
    .is("archived_at", null);

  const projectIds = (projects ?? []).map((project) => project.id);

  const { data: orders } = projectIds.length
    ? await supabase
        .from("work_orders")
        .select(
          "id, order_number, title, status, scheduled_date, assigned_installer_id, project_id, installer_accepted_at",
        )
        .in("project_id", projectIds)
        .order("scheduled_date", { ascending: true, nullsFirst: false })
    : { data: [] };

  const installerIds = [
    ...new Set(
      (orders ?? [])
        .map((order) => order.assigned_installer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: installers } = installerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", installerIds)
    : { data: [] };

  // ¿Cuáles tienen acta de relevamiento? Sólo hace falta para las que están en
  // ese estado: sin acta no se puede planificar.
  const surveying = (orders ?? [])
    .filter((order) => order.status === "relevamiento")
    .map((order) => order.id);
  const { data: surveys } = surveying.length
    ? await supabase
        .from("order_updates")
        .select("order_id")
        .in("order_id", surveying)
        .eq("type", "survey")
    : { data: [] };
  const withSurvey = new Set((surveys ?? []).map((row) => row.order_id));

  const installerName = new Map(
    (installers ?? []).map((profile) => [profile.id, profile.full_name]),
  );
  const projectName = new Map(
    (projects ?? []).map((project) => [project.id, project.name]),
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>

      {projectIds.length === 0 ? (
        <div className="mt-8 rounded-xl border bg-card py-16 text-center">
          <p className="text-sm text-muted-foreground">{t("noProjects")}</p>
        </div>
      ) : (
        <CoordinationBoard
          orders={(orders ?? []).map((order) => ({
            id: order.id,
            orderNumber: order.order_number,
            title: order.title,
            status: order.status,
            scheduledDate: order.scheduled_date,
            projectName: projectName.get(order.project_id) ?? "",
            installerId: order.assigned_installer_id,
            installerName: order.assigned_installer_id
              ? (installerName.get(order.assigned_installer_id) ?? "")
              : "",
            acceptedAt: order.installer_accepted_at,
            hasSurvey: withSurvey.has(order.id),
          }))}
          viewerId={user.id}
        />
      )}
    </div>
  );
}
