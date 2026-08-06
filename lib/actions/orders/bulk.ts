"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { orderBatchSchema } from "@/lib/domain/order-intake";
import { hasActiveCompanyRole } from "@/lib/data/company-membership-roles";
import { createCorrelationId, logEvent } from "@/lib/observability";
import type { TablesInsert } from "@/types/database";
import { operatedCompany, requireOperator } from "./context";
import type { BulkResult } from "./types";

const BATCH_SIZE = 500;

/**
 * Crea una orden por cada punto del proyecto que todavía no tenga una orden
 * abierta (evita duplicar trabajo si se corre dos veces).
 *
 * Los campos del formulario se aplican **a todo el lote**: cuando un proyecto
 * tiene 30 locaciones con la misma tarea, cargar fecha, prioridad y logística
 * una sola vez es la diferencia entre generar el trabajo de una y editar 30
 * órdenes a mano después.
 *
 * No acepta adjuntos a propósito: la evidencia es de cada orden, y subir el
 * mismo archivo 30 veces multiplicaría el storage sin agregar nada.
 */
export async function createOrdersForProject(
  projectId: string,
  formData: FormData,
): Promise<BulkResult> {
  const [t, createOrdersT] = await Promise.all([
    getTranslations("Errors"),
    getTranslations("CreateOrders"),
  ]);
  const parsed = orderBatchSchema.safeParse({
    title: formData.get("title") || createOrdersT("defaultTitle"),
    description: formData.get("description") ?? "",
    status: formData.get("status") ?? "pendiente",
    scheduledDate: formData.get("scheduledDate") ?? "",
    scheduledEndDate: formData.get("scheduledEndDate") ?? "",
    priority: formData.get("priority") ?? "media",
    indoor: formData.get("indoor") === "on",
    requiresFreight: formData.get("requiresFreight") === "on",
    freightDetails: formData.get("freightDetails") ?? "",
    logisticsNotes: formData.get("logisticsNotes") ?? "",
    amount: formData.get("amount") ?? "",
    installerId: formData.get("installerId") ?? "",
  });
  if (!parsed.success) {
    return { error: t("invalidData"), created: 0, skipped: 0 };
  }

  let ctx;
  try {
    ctx = await requireOperator();
  } catch {
    return { error: t("accessDenied"), created: 0, skipped: 0 };
  }
  const { supabase, user } = ctx;

  // Un alta masiva puede crear cientos de filas en varios lotes: sin un hilo
  // común, un fallo a mitad de camino queda como líneas sueltas sin relación.
  const correlationId = createCorrelationId();
  const title = parsed.data.title;

  const { data: project } = await supabase
    .from("projects")
    .select("id, company_id, currency, country, zones, planned_installations, billing_mode")
    .eq("id", projectId)
    .single();
  if (!project) {
    return { error: t("projectNotFound"), created: 0, skipped: 0 };
  }
  let companyId: string;
  try {
    companyId = operatedCompany(user, project.company_id);
  } catch {
    return { error: t("accessDenied"), created: 0, skipped: 0 };
  }

  // Mismo criterio que el alta individual: sólo se asigna a alguien que esté
  // activo en el roster y tenga la capacidad de instalación. Un usuario dual
  // sigue siendo asignable mientras conserve esa capacidad.
  if (parsed.data.installerId) {
    const installerIsActive = await hasActiveCompanyRole(
      supabase,
      companyId,
      parsed.data.installerId,
      "installer",
    );
    if (!installerIsActive) {
      return { error: t("installerNotActive"), created: 0, skipped: 0 };
    }
  }

  const { count: activeSiteCount } = await supabase
    .from("sites")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .is("archived_at", null);
  const missingSites = Math.max(
    0,
    project.planned_installations - (activeSiteCount ?? 0),
  );
  if (missingSites > 0) {
    const start = (activeSiteCount ?? 0) + 1;
    const zone = project.zones[0] ?? (project.country === "BR" ? "BR" : "Interior");
    const placeholders: TablesInsert<"sites">[] = Array.from(
      { length: missingSites },
      (_, index) => ({
        company_id: companyId,
        project_id: projectId,
        name: createOrdersT("placeholderName", { number: start + index }),
        zone,
        state: project.country === "BR" ? zone : "",
        external_ref: `PEND-${String(start + index).padStart(5, "0")}`,
        is_placeholder: true,
      }),
    );
    for (let i = 0; i < placeholders.length; i += BATCH_SIZE) {
      const { error } = await supabase
        .from("sites")
        .insert(placeholders.slice(i, i + BATCH_SIZE));
      if (error) {
        return { error: error.message, created: 0, skipped: 0 };
      }
    }
  }

  // Todos los puntos del proyecto (paginado: PostgREST corta en 1000).
  const siteIds: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("sites")
      .select("id")
      .eq("project_id", projectId)
      .is("archived_at", null)
      .range(from, from + 999);
    if (error || !data) break;
    siteIds.push(...data.map((s) => s.id));
    if (data.length < 1000) break;
  }

  // Puntos que YA tienen una orden no cancelada: los salteamos.
  const withOrders = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("work_orders")
      .select("site_id")
      .eq("project_id", projectId)
      .neq("status", "cancelada")
      .range(from, from + 999);
    if (error || !data) break;
    for (const o of data) withOrders.add(o.site_id);
    if (data.length < 1000) break;
  }

  const toCreate = siteIds.filter((id) => !withOrders.has(id));
  const skipped = siteIds.length - toCreate.length;

  const rows: TablesInsert<"work_orders">[] = toCreate.map((siteId) => ({
    company_id: companyId,
    project_id: projectId,
    site_id: siteId,
    title,
    description: parsed.data.description,
    status: parsed.data.status,
    scheduled_date: parsed.data.scheduledDate,
    scheduled_end_date: parsed.data.scheduledEndDate,
    priority: parsed.data.priority,
    indoor: parsed.data.indoor,
    requires_freight: parsed.data.requiresFreight,
    freight_details: parsed.data.freightDetails,
    logistics_notes: parsed.data.logisticsNotes,
    // El importe es por instalación: repartirlo cuando el proyecto se cobra
    // como un todo duplicaría el monto contratado.
    amount:
      user.role === "company_manager" && project.billing_mode === "per_installation"
        ? parsed.data.amount
        : null,
    currency: project.currency,
    assigned_installer_id: parsed.data.installerId,
    created_by: user.id,
  }));

  let created = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("work_orders").insert(batch);
    if (error) {
      // Un lote que corta a la mitad deja el proyecto con órdenes parciales:
      // hay que poder saber cuántas entraron sin recontar a mano.
      logEvent("error", "orders.bulk_create.failed", {
        correlation_id: correlationId,
        company_id: companyId,
        project_id: projectId,
        created,
        pending: rows.length - created,
        database_code: error.code ?? null,
      });
      return {
        error: t("orderBatch", { count: created, error: error.message }),
        created,
        skipped,
      };
    }
    created += batch.length;
  }

  logEvent("info", "orders.bulk_create.completed", {
    correlation_id: correlationId,
    company_id: companyId,
    project_id: projectId,
    created,
    skipped,
  });

  // Un solo aviso por lote: treinta notificaciones seguidas por el mismo
  // trabajo son una alarma inútil, no información.
  if (parsed.data.installerId && created > 0) {
    await supabase.from("notifications").insert({
      user_id: parsed.data.installerId,
      type: "order_assigned",
      title: createOrdersT("batchNotificationTitle"),
      body: createOrdersT("batchNotificationBody", { count: created }),
      data: { url: "/tasks", project_id: projectId },
    });
  }

  revalidatePath("/orders");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  return { error: null, created, skipped };
}
