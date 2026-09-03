"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import {
  orderAttachmentRegistrationSchema,
  orderEditSchema,
  orderIntakeSchema,
  databaseIdSchema,
  type OrderAttachmentRegistration,
} from "@/lib/domain/order-intake";
import { hasActiveCompanyRole } from "@/lib/data/company-membership-roles";
import { requestPushDelivery } from "@/lib/push/events";
import { activitiesFor } from "@/lib/domain/activity-kind";
import type { TablesInsert } from "@/types/database";
import { syncOrderConditions } from "./conditions";
import { syncActivitySchedule } from "./schedule";
import { operatedCompany, requireOperator } from "./context";
import type {
  ActionState,
  CreateOrderResult,
  OrderFormSite,
  OrderFormSitesResult,
} from "./types";

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
    activityKind: formData.get("activityKind") ?? "execution",
    description: formData.get("description") ?? "",
    status: formData.get("status") ?? "pendiente",
    scheduledDate: formData.get("scheduledDate") ?? "",
    scheduledEndDate: formData.get("scheduledEndDate") ?? "",
    priority: formData.get("priority") ?? "media",
    indoor: formData.get("indoor") === "on",
    requiresFreight: formData.get("requiresFreight") === "on",
    conditions: formData.getAll("conditions"),
    scheduledStartTime: formData.get("scheduledStartTime") ?? "",
    scheduledEndTime: formData.get("scheduledEndTime") ?? "",
    estimatedDurationMinutes: formData.get("estimatedDurationMinutes") ?? "",
    freightDetails: formData.get("freightDetails") ?? "",
    logisticsNotes: formData.get("logisticsNotes") ?? "",
    amount: formData.get("amount") ?? "",
    installerAmount: formData.get("installerAmount") ?? "",
    installerId: formData.get("installerId") ?? "",
  });
  if (!parsed.success) {
    return { error: t("invalidData") };
  }

  try {
    const { supabase, user } = await requireOperator();

    // El punto debe ser de esta empresa: resolvemos project_id desde él,
    // nunca confiamos en un project_id que venga del cliente.
    const { data: site } = await supabase
      .from("sites")
      .select("id, project_id, company_id, archived_at")
      .eq("id", parsed.data.siteId)
      .single();
    if (!site || site.archived_at) return { error: t("siteNotFound") };
    const companyId = operatedCompany(user, site.company_id);

    const [installerIsActive, { data: project }] = await Promise.all([
      parsed.data.installerId
        ? hasActiveCompanyRole(
            supabase,
            companyId,
            parsed.data.installerId,
            "installer",
          )
        : Promise.resolve(false),
      supabase
        .from("projects")
        .select("billing_mode, currency")
        .eq("id", site.project_id)
        .eq("company_id", companyId)
        .single(),
    ]);
    if (
      parsed.data.installerId &&
      !installerIsActive
    ) {
      return { error: t("installerNotActive") };
    }
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
        amount:
          user.role === "company_manager" &&
          project.billing_mode === "per_installation"
            ? parsed.data.amount
            : null,
        // El costo del instalador NO depende de la modalidad de cobro: aunque
        // al cliente se le facture el proyecto entero, a cada instalador se le
        // paga por orden. Sí queda reservado al gerente, igual que el ingreso.
        installer_amount:
          user.role === "company_manager" ? parsed.data.installerAmount : null,
        currency: project.currency,
        assigned_installer_id: parsed.data.installerId,
        created_by: user.id,
        // order_number lo asigna el trigger work_orders_assign_number.
      })
      .select("id, order_number")
      .single();
    if (error || !order) return { error: error?.message ?? t("unexpected") };

    // Las actividades de la orden. Se crean acá y no por trigger porque el
    // tipo es una decisión de quien la carga, no algo derivable de la fila.
    //
    // Si esto fallara, la orden ya existe y quedaría sin actividades — que es
    // exactamente el estado en que están las 30 órdenes viejas, y del que se
    // sale volviendo a llamar al comando. Por eso no se aborta el alta: una
    // orden creada es mejor que un error después de haberla escrito.
    const { includeSurvey, includeExecution } = activitiesFor(
      parsed.data.activityKind,
    );
    await supabase.rpc("create_order_activities", {
      p_order_id: order.id,
      p_include_survey: includeSurvey,
      p_include_execution: includeExecution,
    });

    await syncOrderConditions(
      supabase,
      order.id,
      companyId,
      user.id,
      parsed.data.conditions,
    );

    await syncActivitySchedule(supabase, order.id, {
      date: parsed.data.scheduledDate,
      startTime: parsed.data.scheduledStartTime,
      endTime: parsed.data.scheduledEndTime,
      durationMinutes: parsed.data.estimatedDurationMinutes,
    });

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

/**
 * Edita los datos de una orden existente.
 *
 * NO toca el estado: las transiciones pasan exclusivamente por `transitionOrder`
 * (regla no negociable #4), que valida la máquina de estados contra el trigger.
 * Tampoco permite mudar la orden de punto: eso cambiaría el proyecto y la
 * numeración, así que sería otra orden.
 */
export async function updateOrder(
  orderId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("Errors");
  if (!databaseIdSchema.safeParse(orderId).success) return { error: t("invalidData") };
  const parsed = orderEditSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    scheduledDate: formData.get("scheduledDate") ?? "",
    scheduledEndDate: formData.get("scheduledEndDate") ?? "",
    priority: formData.get("priority") ?? "media",
    indoor: formData.get("indoor") === "on",
    requiresFreight: formData.get("requiresFreight") === "on",
    conditions: formData.getAll("conditions"),
    scheduledStartTime: formData.get("scheduledStartTime") ?? "",
    scheduledEndTime: formData.get("scheduledEndTime") ?? "",
    estimatedDurationMinutes: formData.get("estimatedDurationMinutes") ?? "",
    freightDetails: formData.get("freightDetails") ?? "",
    logisticsNotes: formData.get("logisticsNotes") ?? "",
    amount: formData.get("amount") ?? "",
    installerAmount: formData.get("installerAmount") ?? "",
    installerId: formData.get("installerId") ?? "",
  });
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const { supabase, user } = await requireOperator();

    const { data: order } = await supabase
      .from("work_orders")
      .select("id, project_id, company_id, status, assigned_installer_id")
      .eq("id", orderId)
      .single();
    if (!order) return { error: t("orderNotFound") };
    const companyId = operatedCompany(user, order.company_id);

    const [installerIsActive, { data: project }] = await Promise.all([
      parsed.data.installerId
        ? hasActiveCompanyRole(
            supabase,
            companyId,
            parsed.data.installerId,
            "installer",
          )
        : Promise.resolve(false),
      supabase
        .from("projects")
        .select("billing_mode")
        .eq("id", order.project_id)
        .eq("company_id", companyId)
        .single(),
    ]);
    if (parsed.data.installerId && !installerIsActive) {
      return { error: t("installerNotActive") };
    }
    if (!project) return { error: t("projectNotFound") };

    const { error } = await supabase
      .from("work_orders")
      .update({
        title: parsed.data.title,
        description: parsed.data.description,
        scheduled_date: parsed.data.scheduledDate,
        scheduled_end_date: parsed.data.scheduledEndDate,
        priority: parsed.data.priority,
        indoor: parsed.data.indoor,
        requires_freight: parsed.data.requiresFreight,
        freight_details: parsed.data.freightDetails,
        logistics_notes: parsed.data.logisticsNotes,
        // El importe sigue siendo potestad del gerente y sólo con cobro por
        // instalación; un coordinador no puede tocarlo.
        ...(user.role === "company_manager" && project.billing_mode === "per_installation"
          ? { amount: parsed.data.amount }
          : {}),
        ...(user.role === "company_manager"
          ? { installer_amount: parsed.data.installerAmount }
          : {}),
        assigned_installer_id: parsed.data.installerId,
      })
      .eq("id", orderId)
      .eq("company_id", companyId);
    if (error) return { error: error.message };

    await syncOrderConditions(
      supabase,
      orderId,
      companyId,
      user.id,
      parsed.data.conditions,
    );

    await syncActivitySchedule(supabase, orderId, {
      date: parsed.data.scheduledDate,
      startTime: parsed.data.scheduledStartTime,
      endTime: parsed.data.scheduledEndTime,
      durationMinutes: parsed.data.estimatedDurationMinutes,
    });

    // Si cambió el instalador, avisarle como en una asignación nueva.
    if (
      parsed.data.installerId &&
      parsed.data.installerId !== order.assigned_installer_id
    ) {
      await requestPushDelivery(supabase, "order_assigned", orderId, parsed.data.installerId);
    }

    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath(`/projects/${order.project_id}`);
    revalidatePath("/dashboard");
    revalidatePath("/clients");
    return { error: null, ok: true };
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
    const { supabase, user } = await requireOperator();
    const { data: project } = await supabase
      .from("projects")
      .select("id, company_id")
      .eq("id", projectId)
      .single();
    if (!project) return { error: t("projectNotFound"), sites: [] };
    const companyId = operatedCompany(user, project.company_id);

    const rawSites: (Omit<OrderFormSite, "hasOpenRequirements"> & {
      locationId: string | null;
    })[] = [];
    for (let from = 0; ; from += 1_000) {
      const { data, error } = await supabase
        .from("sites")
        .select("id, name, address, city, state, zone, external_ref, location_id")
        .eq("project_id", projectId)
        .eq("company_id", companyId)
        .is("archived_at", null)
        .order("name")
        .range(from, from + 999);
      if (error) return { error: error.message, sites: [] };
      const page = data ?? [];
      rawSites.push(
        ...page.map((site) => ({
          id: site.id,
          name: site.name,
          address: site.address,
          city: site.city,
          state: site.state,
          zone: site.zone,
          externalRef: site.external_ref,
          locationId: site.location_id,
        })),
      );
      if (page.length < 1_000) break;
    }

    // Un flag por sitio, no el detalle: con miles de sitios por proyecto,
    // traer los requisitos de todos de una sería carísimo por algo que el
    // usuario va a mirar sólo del sitio que efectivamente elija.
    const locationIds = [
      ...new Set(
        rawSites
          .map((site) => site.locationId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const flaggedLocationIds = new Set<string>();
    if (locationIds.length > 0) {
      const { data: openRequirements } = await supabase
        .from("location_requirements")
        .select("location_id")
        .in("location_id", locationIds)
        .in("status", ["pending", "expired", "rejected"]);
      for (const row of openRequirements ?? []) flaggedLocationIds.add(row.location_id);
    }

    const sites: OrderFormSite[] = rawSites.map(({ locationId, ...site }) => ({
      ...site,
      hasOpenRequirements: locationId ? flaggedLocationIds.has(locationId) : false,
    }));
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
    const { supabase, user } = await requireOperator();
    const { data: order } = await supabase
      .from("work_orders")
      .select("id, company_id")
      .eq("id", idResult.data)
      .single();
    if (!order) return { error: t("orderNotFound") };
    const companyId = operatedCompany(user, order.company_id);

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
