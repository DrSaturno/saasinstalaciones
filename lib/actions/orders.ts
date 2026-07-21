"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { canTransition } from "@/lib/domain/transitions";
import { requestPushDelivery } from "@/lib/push/events";
import type { OrderStatus, TablesInsert } from "@/types/database";

/** Toda acción de empresa resuelve company_id desde la sesión, nunca del cliente. */
async function requireManager() {
  const user = await getCurrentUser();
  if (!user || user.role !== "company_manager" || !user.companyId) {
    throw new Error("Acceso denegado");
  }
  return { user, supabase: await createClient(), companyId: user.companyId };
}

export type ActionState = { error: string | null; ok?: boolean };

// ---------------------------------------------------------------------------
// Crear orden individual
// ---------------------------------------------------------------------------

const createOrderSchema = z.object({
  siteId: z.string().uuid("Punto inválido"),
  title: z.string().min(2, "El título es muy corto").max(200),
  description: z.string().max(2000).optional().default(""),
  scheduledDate: z.string().optional(),
});

export async function createOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = createOrderSchema.safeParse({
    siteId: formData.get("siteId"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    scheduledDate: formData.get("scheduledDate") || undefined,
  });
  if (!parsed.success) {
    return { error: t("invalidData") };
  }

  try {
    const { supabase, companyId, user } = await requireManager();

    // El punto debe ser de esta empresa: resolvemos project_id desde él,
    // nunca confiamos en un project_id que venga del cliente.
    const { data: site } = await supabase
      .from("sites")
      .select("id, project_id, company_id")
      .eq("id", parsed.data.siteId)
      .eq("company_id", companyId)
      .single();
    if (!site) return { error: t("siteNotFound") };

    const { error } = await supabase.from("work_orders").insert({
      company_id: companyId,
      project_id: site.project_id,
      site_id: site.id,
      title: parsed.data.title,
      description: parsed.data.description,
      scheduled_date: parsed.data.scheduledDate || null,
      created_by: user.id,
      // order_number lo asigna el trigger work_orders_assign_number.
    });
    if (error) return { error: error.message };

    revalidatePath("/orders");
    revalidatePath(`/projects/${site.project_id}`);
  } catch {
    return { error: t("unexpected") };
  }
  return { error: null, ok: true };
}

// ---------------------------------------------------------------------------
// Crear órdenes masivas: una por punto de un proyecto
// ---------------------------------------------------------------------------

export type BulkResult = {
  error: string | null;
  created: number;
  skipped: number;
};

const BATCH_SIZE = 500;

/**
 * Crea una orden por cada punto del proyecto que todavía no tenga una orden
 * abierta (evita duplicar trabajo si se corre dos veces).
 */
export async function createOrdersForProject(
  projectId: string,
  titleTemplate: string,
): Promise<BulkResult> {
  const [t, createOrdersT] = await Promise.all([
    getTranslations("Errors"),
    getTranslations("CreateOrders"),
  ]);
  let ctx;
  try {
    ctx = await requireManager();
  } catch {
    return { error: t("accessDenied"), created: 0, skipped: 0 };
  }
  const { supabase, companyId, user } = ctx;

  const title = titleTemplate.trim() || createOrdersT("defaultTitle");

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("company_id", companyId)
    .single();
  if (!project) {
    return { error: t("projectNotFound"), created: 0, skipped: 0 };
  }

  // Todos los puntos del proyecto (paginado: PostgREST corta en 1000).
  const siteIds: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("sites")
      .select("id")
      .eq("project_id", projectId)
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
    created_by: user.id,
  }));

  let created = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("work_orders").insert(batch);
    if (error) {
      return {
        error: t("orderBatch", { count: created, error: error.message }),
        created,
        skipped,
      };
    }
    created += batch.length;
  }

  revalidatePath("/orders");
  revalidatePath(`/projects/${projectId}`);
  return { error: null, created, skipped };
}

// ---------------------------------------------------------------------------
// Máquina de estados: única vía para cambiar el status (regla no negociable #4)
// ---------------------------------------------------------------------------

export async function transitionOrder(
  orderId: string,
  toStatus: OrderStatus,
  note?: string,
): Promise<ActionState> {
  const [t, statusT] = await Promise.all([
    getTranslations("Errors"),
    getTranslations("Status"),
  ]);
  try {
    const { supabase, companyId } = await requireManager();

    const { data: order } = await supabase
      .from("work_orders")
      .select("id, status, project_id")
      .eq("id", orderId)
      .eq("company_id", companyId)
      .single();
    if (!order) return { error: t("orderNotFound") };

    // Validamos acá para dar un error claro; el trigger valida igual en la DB.
    if (!canTransition(order.status, toStatus)) {
      return {
        error: t("invalidOrderTransition", {
          from: statusT(`order.${order.status}`),
          to: statusT(`order.${toStatus}`),
        }),
      };
    }

    const { error } = await supabase
      .from("work_orders")
      .update({ status: toStatus })
      .eq("id", orderId)
      .eq("company_id", companyId);
    if (error) return { error: error.message };

    // Rastro en el historial (order_updates). id generado en server acá:
    // esta acción no es de área installer, no necesita idempotencia offline.
    await supabase.from("order_updates").insert({
      id: crypto.randomUUID(),
      order_id: orderId,
      company_id: companyId,
      type: "system",
      note: note?.trim()
        ? t("systemStatusChangeNote", {
            status: statusT(`order.${toStatus}`),
            note: note.trim(),
          })
        : t("systemStatusChange", { status: statusT(`order.${toStatus}`) }),
    });

    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath(`/projects/${order.project_id}`);
  } catch {
    return { error: t("unexpected") };
  }
  return { error: null, ok: true };
}

// ---------------------------------------------------------------------------
// Asignar instalador (del roster de la empresa)
// ---------------------------------------------------------------------------

export async function assignInstaller(
  orderId: string,
  installerId: string | null,
): Promise<ActionState> {
  const t = await getTranslations("Errors");
  try {
    const { supabase, companyId } = await requireManager();

    // Si se asigna alguien, debe estar en el roster activo de la empresa.
    if (installerId) {
      const { data: roster } = await supabase
        .from("company_installers")
        .select("installer_id")
        .eq("company_id", companyId)
        .eq("installer_id", installerId)
        .eq("status", "active")
        .single();
      if (!roster) {
        return { error: t("installerNotActive") };
      }
    }

    const { error } = await supabase
      .from("work_orders")
      .update({ assigned_installer_id: installerId })
      .eq("id", orderId)
      .eq("company_id", companyId);
    if (error) return { error: error.message };

    if (installerId) {
      await requestPushDelivery(supabase, "order_assigned", orderId, installerId);
    }

    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
  } catch {
    return { error: t("unexpected") };
  }
  return { error: null, ok: true };
}
