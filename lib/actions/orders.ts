"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import {
  orderAttachmentRegistrationSchema,
  orderIntakeSchema,
  databaseIdSchema,
  type OrderAttachmentRegistration,
} from "@/lib/domain/order-intake";
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
export type CreateOrderResult = ActionState & {
  orderId?: string;
  companyId?: string;
  orderNumber?: string;
};

export type OrderFormSite = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zone: string;
  externalRef: string | null;
};

export type OrderFormSitesResult = {
  error: string | null;
  sites: OrderFormSite[];
};

// ---------------------------------------------------------------------------
// Crear orden individual
// ---------------------------------------------------------------------------

export async function createOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<CreateOrderResult> {
  const t = await getTranslations("Errors");
  const parsed = orderIntakeSchema.safeParse({
    siteId: formData.get("siteId"),
    title: formData.get("title"),
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
    return { error: t("invalidData") };
  }

  try {
    const { supabase, companyId, user } = await requireManager();

    // El punto debe ser de esta empresa: resolvemos project_id desde él,
    // nunca confiamos en un project_id que venga del cliente.
    const [siteResult, rosterResult] = await Promise.all([
      supabase
        .from("sites")
        .select("id, project_id, company_id, archived_at")
        .eq("id", parsed.data.siteId)
        .eq("company_id", companyId)
        .single(),
      parsed.data.installerId
        ? supabase
            .from("company_installers")
            .select("installer_id")
            .eq("company_id", companyId)
            .eq("installer_id", parsed.data.installerId)
            .eq("status", "active")
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const site = siteResult.data;
    if (!site || site.archived_at) return { error: t("siteNotFound") };
    if (parsed.data.installerId && !rosterResult.data) {
      return { error: t("installerNotActive") };
    }

    const { data: project } = await supabase
      .from("projects")
      .select("billing_mode, currency")
      .eq("id", site.project_id)
      .eq("company_id", companyId)
      .single();
    if (!project) return { error: t("projectNotFound") };

    const { data: order, error } = await supabase
      .from("work_orders")
      .insert({
        company_id: companyId,
        project_id: site.project_id,
        site_id: site.id,
        title: parsed.data.title,
        description: parsed.data.description,
        status: parsed.data.status,
        scheduled_date: parsed.data.scheduledDate,
        scheduled_end_date: parsed.data.scheduledEndDate,
        priority: parsed.data.priority,
        indoor: parsed.data.indoor,
        requires_freight: parsed.data.requiresFreight,
        freight_details: parsed.data.freightDetails,
        logistics_notes: parsed.data.logisticsNotes,
        amount: project.billing_mode === "per_installation" ? parsed.data.amount : null,
        currency: project.currency,
        assigned_installer_id: parsed.data.installerId,
        created_by: user.id,
        // order_number lo asigna el trigger work_orders_assign_number.
      })
      .select("id, order_number")
      .single();
    if (error || !order) return { error: error?.message ?? t("unexpected") };

    if (parsed.data.installerId) {
      await requestPushDelivery(
        supabase,
        "order_assigned",
        order.id,
        parsed.data.installerId,
      );
    }

    revalidatePath("/orders");
    revalidatePath(`/projects/${site.project_id}`);
    return {
      error: null,
      ok: true,
      orderId: order.id,
      companyId,
      orderNumber: order.order_number,
    };
  } catch {
    return { error: t("unexpected") };
  }
}

/** Carga bajo demanda los puntos del proyecto para no serializar miles al abrir /orders. */
export async function getOrderFormSites(
  projectId: string,
): Promise<OrderFormSitesResult> {
  const t = await getTranslations("Errors");
  if (!databaseIdSchema.safeParse(projectId).success) {
    return { error: t("invalidData"), sites: [] };
  }

  try {
    const { supabase, companyId } = await requireManager();
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("company_id", companyId)
      .single();
    if (!project) return { error: t("projectNotFound"), sites: [] };

    const sites: OrderFormSite[] = [];
    for (let from = 0; ; from += 1_000) {
      const { data, error } = await supabase
        .from("sites")
        .select("id, name, address, city, state, zone, external_ref")
        .eq("project_id", projectId)
        .eq("company_id", companyId)
        .is("archived_at", null)
        .order("name")
        .range(from, from + 999);
      if (error) return { error: error.message, sites: [] };
      const page = data ?? [];
      sites.push(
        ...page.map((site) => ({
          id: site.id,
          name: site.name,
          address: site.address,
          city: site.city,
          state: site.state,
          zone: site.zone,
          externalRef: site.external_ref,
        })),
      );
      if (page.length < 1_000) break;
    }
    return { error: null, sites };
  } catch {
    return { error: t("unexpected"), sites: [] };
  }
}

export async function registerOrderAttachments(
  orderId: string,
  attachments: OrderAttachmentRegistration[],
): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const idResult = databaseIdSchema.safeParse(orderId);
  const filesResult = orderAttachmentRegistrationSchema.safeParse(attachments);
  if (!idResult.success || !filesResult.success) {
    return { error: t("invalidData") };
  }

  try {
    const { supabase, companyId, user } = await requireManager();
    const { data: order } = await supabase
      .from("work_orders")
      .select("id")
      .eq("id", idResult.data)
      .eq("company_id", companyId)
      .single();
    if (!order) return { error: t("orderNotFound") };

    const expectedPrefix = `${companyId}/${order.id}/`;
    if (
      filesResult.data.some(
        (attachment) => !attachment.storagePath.startsWith(expectedPrefix),
      )
    ) {
      return { error: t("invalidData") };
    }

    const rows: TablesInsert<"order_attachments">[] = filesResult.data.map(
      (attachment) => ({
        order_id: order.id,
        company_id: companyId,
        storage_path: attachment.storagePath,
        file_name: attachment.fileName,
        mime_type: attachment.mimeType,
        size_bytes: attachment.sizeBytes,
        uploaded_by: user.id,
      }),
    );
    const { error } = await supabase.from("order_attachments").upsert(rows, {
      onConflict: "order_id,storage_path",
      ignoreDuplicates: true,
    });
    if (error) return { error: error.message };

    revalidatePath(`/orders/${order.id}`);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
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
    .select("id, currency")
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
    currency: project.currency,
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
