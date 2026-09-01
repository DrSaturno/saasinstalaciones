"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import {
  canOperateCompany,
  getCurrentUser,
  isCoordinatorSomewhere,
  isInstallerArea,
  type CurrentUser,
} from "@/lib/auth";
import {
  applicationSchema,
  createBroadcastSchema,
  formalizeProjectSchema,
  resolveApplicationSchema,
  updateBroadcastSchema,
} from "@/lib/domain/broadcasts";
import { hasActiveCompanyRole } from "@/lib/data/company-membership-roles";
import { requestPushDelivery } from "@/lib/push/events";
import { createClient } from "@/lib/supabase/server";
import type { OrderCurrency } from "@/types/database";

export type BroadcastActionState = { error: string | null; ok?: boolean };

async function requireOperator() {
  const [user, supabase] = await Promise.all([
    getCurrentUser(),
    createClient(),
  ]);
  if (
    !user ||
    (user.role !== "company_manager" && !isCoordinatorSomewhere(user))
  ) {
    throw new Error("Acceso denegado");
  }
  return { user, supabase };
}

function operatedCompany(user: CurrentUser, companyId: string): string {
  if (!canOperateCompany(user, companyId)) {
    throw new Error("Acceso denegado");
  }
  return companyId;
}

async function requireOperatorForBroadcast(broadcastId: string) {
  const { user, supabase } = await requireOperator();
  const { data: broadcast } = await supabase
    .from("broadcasts")
    .select("id, company_id")
    .eq("id", broadcastId)
    .single();
  if (!broadcast) throw new Error("Acceso denegado");

  return {
    user,
    supabase,
    companyId: operatedCompany(user, broadcast.company_id),
  };
}

async function requireInstaller() {
  const user = await getCurrentUser();
  if (!user || !isInstallerArea(user)) throw new Error("Acceso denegado");
  return { user, supabase: await createClient() };
}

function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  return fallback;
}

export async function createBroadcast(
  _previous: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  const t = await getTranslations("Errors");
  const parsed = createBroadcastSchema.safeParse({
    projectId: formData.get("projectId") ?? "",
    clientId: formData.get("clientId") ?? "",
    zone: formData.get("zone"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    slots: formData.get("slots"),
    scheduledDate: formData.get("scheduledDate") ?? "",
    scheduledEndDate: formData.get("scheduledEndDate") ?? "",
    requirements: formData.get("requirements") ?? "",
    logisticsNotes: formData.get("logisticsNotes") ?? "",
    payVisible: formData.get("payVisible") === "on",
    payAmount: formData.get("payAmount") ?? "",
    lat: formData.get("lat") ?? "",
    lng: formData.get("lng") ?? "",
  });
  if (!parsed.success) {
    return { error: t("invalidData") };
  }

  try {
    const { supabase, user } = await requireOperator();

    // Dos orígenes posibles. Con proyecto, empresa y moneda salen de él, como
    // siempre. Sin proyecto —la etapa previa— hay que validar que el cliente
    // sea de una empresa que esta persona opera, y la moneda se deriva del
    // país de la empresa con el mismo criterio que usa `createProject`.
    let companyId: string;
    let projectId: string | null = null;
    let currency: OrderCurrency;

    if (parsed.data.projectId) {
      const { data: project } = await supabase
        .from("projects")
        .select("id, company_id, currency")
        .eq("id", parsed.data.projectId)
        .single();
      if (!project) return { error: t("projectNotFound") };
      companyId = operatedCompany(user, project.company_id);
      projectId = project.id;
      currency = project.currency;
    } else {
      // El `refine` del esquema ya garantiza que hay uno de los dos, pero el
      // tipo sigue siendo nullable: se corta explícito en vez de forzarlo.
      const clientId = parsed.data.clientId;
      if (!clientId) return { error: t("invalidData") };
      const { data: client } = await supabase
        .from("clients")
        .select("id, company_id, companies!inner(country)")
        .eq("id", clientId)
        .single();
      if (!client) return { error: t("clientNotFound") };
      companyId = operatedCompany(user, client.company_id);
      const country = Array.isArray(client.companies)
        ? client.companies[0]?.country
        : client.companies?.country;
      currency = country === "BR" ? "BRL" : "ARS";
    }

    const { data: broadcast, error } = await supabase
      .from("broadcasts")
      .insert({
        company_id: companyId,
        project_id: projectId,
        client_id: parsed.data.clientId,
        zone: parsed.data.zone,
        title: parsed.data.title,
        description: parsed.data.description,
        slots: parsed.data.slots,
        scheduled_date: parsed.data.scheduledDate,
        scheduled_end_date: parsed.data.scheduledEndDate,
        requirements: parsed.data.requirements,
        logistics_notes: parsed.data.logisticsNotes,
        pay_visible: user.role === "company_manager" && parsed.data.payVisible,
        pay_amount:
          user.role === "company_manager" && parsed.data.payVisible
            ? parsed.data.payAmount
            : null,
        currency,
        // Con coordenadas, el matching afina por radio; sin ellas, sólo provincia.
        lat: parsed.data.lat,
        lng: parsed.data.lng,
      })
      .select("id")
      .single();
    if (error || !broadcast) return { error: t("publishBroadcast") };

    await requestPushDelivery(supabase, "broadcast_created", broadcast.id);
    revalidatePath("/broadcasts");
    return { error: null, ok: true };
  } catch (error) {
    return { error: errorMessage(error, t("operation")) };
  }
}

export async function updateBroadcast(input: {
  broadcastId: string;
  title: string;
  description: string;
  slots: number;
}): Promise<BroadcastActionState> {
  const t = await getTranslations("Errors");
  const parsed = updateBroadcastSchema.safeParse(input);
  if (!parsed.success) {
    return { error: t("invalidData") };
  }

  try {
    const { companyId, supabase } = await requireOperatorForBroadcast(
      parsed.data.broadcastId,
    );
    const { count } = await supabase
      .from("broadcast_applications")
      .select("installer_id", { count: "exact", head: true })
      .eq("broadcast_id", parsed.data.broadcastId)
      .eq("status", "accepted");
    if ((count ?? 0) > parsed.data.slots) {
      return { error: t("slotsBelowAccepted") };
    }

    const { data, error } = await supabase
      .from("broadcasts")
      .update({
        title: parsed.data.title,
        description: parsed.data.description,
        slots: parsed.data.slots,
      })
      .eq("id", parsed.data.broadcastId)
      .eq("company_id", companyId)
      .eq("status", "open")
      .select("id")
      .single();
    if (error || !data) return { error: t("broadcastClosed") };

    revalidatePath("/broadcasts");
    return { error: null, ok: true };
  } catch (error) {
    return { error: errorMessage(error, t("operation")) };
  }
}

export async function closeBroadcast(
  broadcastId: string,
): Promise<BroadcastActionState> {
  const t = await getTranslations("Errors");
  try {
    const { supabase } = await requireOperatorForBroadcast(broadcastId);
    const { error } = await supabase.rpc("close_broadcast", {
      p_broadcast_id: broadcastId,
    });
    if (error) return { error: t("operation") };
    await requestPushDelivery(supabase, "application_rejected", broadcastId);
    revalidatePath("/broadcasts");
    return { error: null, ok: true };
  } catch (error) {
    return { error: errorMessage(error, t("operation")) };
  }
}

export async function applyToBroadcast(
  broadcastId: string,
  message: string,
  quotedAmount = "",
): Promise<BroadcastActionState> {
  const t = await getTranslations("Errors");
  const parsed = applicationSchema.safeParse({
    broadcastId,
    message,
    quotedAmount,
  });
  if (!parsed.success) {
    return { error: t("invalidData") };
  }

  try {
    const { user, supabase } = await requireInstaller();
    const { error } = await supabase.from("broadcast_applications").insert({
      broadcast_id: parsed.data.broadcastId,
      installer_id: user.id,
      message: parsed.data.message,
      quoted_amount: parsed.data.quotedAmount,
    });
    if (error) {
      if (error.code === "23505") return { error: t("alreadyApplied") };
      return { error: t("operation") };
    }

    await requestPushDelivery(
      supabase,
      "application_received",
      parsed.data.broadcastId,
    );
    revalidatePath("/jobs");
    return { error: null, ok: true };
  } catch (error) {
    return { error: errorMessage(error, t("operation")) };
  }
}

export async function acceptApplication(input: {
  broadcastId: string;
  installerId: string;
  orderIds: string[];
}): Promise<BroadcastActionState> {
  const t = await getTranslations("Errors");
  const parsed = resolveApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: t("invalidData") };
  }

  try {
    const { supabase } = await requireOperatorForBroadcast(
      parsed.data.broadcastId,
    );
    const { error } = await supabase.rpc("accept_broadcast_application", {
      p_broadcast_id: parsed.data.broadcastId,
      p_installer_id: parsed.data.installerId,
      p_order_ids: parsed.data.orderIds,
    });
    if (error) return { error: t("operation") };

    await Promise.all([
      requestPushDelivery(
        supabase,
        "application_accepted",
        parsed.data.broadcastId,
        parsed.data.installerId,
      ),
      requestPushDelivery(supabase, "application_rejected", parsed.data.broadcastId),
      ...parsed.data.orderIds.map((orderId) =>
        requestPushDelivery(supabase, "order_assigned", orderId, parsed.data.installerId),
      ),
    ]);
    revalidatePath("/broadcasts");
    revalidatePath("/orders");
    return { error: null, ok: true };
  } catch (error) {
    return { error: errorMessage(error, t("operation")) };
  }
}

export async function rejectApplication(
  broadcastId: string,
  installerId: string,
): Promise<BroadcastActionState> {
  const t = await getTranslations("Errors");
  const parsed = resolveApplicationSchema.safeParse({
    broadcastId,
    installerId,
    orderIds: [],
  });
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const { supabase } = await requireOperatorForBroadcast(
      parsed.data.broadcastId,
    );
    const { error } = await supabase.rpc("reject_broadcast_application", {
      p_broadcast_id: parsed.data.broadcastId,
      p_installer_id: parsed.data.installerId,
    });
    if (error) return { error: t("operation") };
    await requestPushDelivery(
      supabase,
      "application_rejected",
      parsed.data.broadcastId,
      parsed.data.installerId,
    );
    revalidatePath("/broadcasts");
    return { error: null, ok: true };
  } catch (error) {
    return { error: errorMessage(error, t("operation")) };
  }
}

/**
 * Crea el proyecto a partir de una convocatoria ya cotizada y aceptada.
 *
 * Todo el trabajo pesado vive en `formalize_project_from_broadcast`: crea
 * proyecto, punto y orden, y vincula la convocatoria en una sola transacción.
 * Repartir esas cuatro escrituras acá dejaría basura a medio crear si una
 * fallara.
 *
 * El coordinador se valida ANTES de llamar a la función, aunque ella también
 * lo exija: así el usuario recibe el mensaje que pide el spec —"asigná un
 * coordinador"— y no un error de base de datos sin traducir.
 */
export async function formalizeProjectFromBroadcast(input: {
  broadcastId: string;
  installerId: string;
  coordinatorId: string;
  name: string;
}): Promise<BroadcastActionState & { projectId?: string }> {
  const t = await getTranslations("Errors");
  const parsed = formalizeProjectSchema.safeParse(input);
  if (!parsed.success) return { error: t("coordinatorRequired") };

  try {
    const { supabase, companyId } = await requireOperatorForBroadcast(
      parsed.data.broadcastId,
    );

    const isCoordinator = await hasActiveCompanyRole(
      supabase,
      companyId,
      parsed.data.coordinatorId,
      "coordinator",
    );
    if (!isCoordinator) return { error: t("coordinatorRequired") };

    const { data, error } = await supabase.rpc(
      "formalize_project_from_broadcast",
      {
        p_broadcast_id: parsed.data.broadcastId,
        p_installer_id: parsed.data.installerId,
        p_coordinator_id: parsed.data.coordinatorId,
        p_project_name: parsed.data.name,
      },
    );
    if (error || !data) return { error: t("formalizeProject") };

    revalidatePath("/broadcasts");
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    return { error: null, ok: true, projectId: data };
  } catch (error) {
    return { error: errorMessage(error, t("operation")) };
  }
}
