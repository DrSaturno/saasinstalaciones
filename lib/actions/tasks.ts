"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isInstallerArea } from "@/lib/auth";
import {
  completionReadiness,
  DEFAULT_MIN_COMPLETION_PHOTOS,
} from "@/lib/domain/field-flow";
import {
  decideInstallerTransition,
  type InstallerTransitionTarget,
} from "@/lib/domain/installer-transition";
import { orderTransitionBlock } from "@/lib/domain/order-rules";
import { logEvent } from "@/lib/observability";
import { requestPushDelivery } from "@/lib/push/events";
import type { OrderUpdateType } from "@/types/database";

async function requireInstaller() {
  const user = await getCurrentUser();
  if (!user || !isInstallerArea(user)) {
    throw new Error("Acceso denegado");
  }
  return { user, supabase: await createClient() };
}

export type ActionState = { error: string | null; ok?: boolean };
export type OfflineTransitionState = ActionState & { retryable?: boolean };

/**
 * Transición del instalador sobre una orden suya. Idempotente: si la orden ya
 * está en el estado destino, es un no-op exitoso (importa para el retry offline
 * del Paso 9). El trigger de la DB valida la transición igual.
 */
async function installerTransition(
  orderId: string,
  toStatus: InstallerTransitionTarget,
): Promise<OfflineTransitionState> {
  const t = await getTranslations("Errors");
  const { supabase, user } = await requireInstaller();

  const { data: order, error: readError } = await supabase
    .from("work_orders")
    .select("id, status, assigned_installer_id, installer_accepted_at, scheduled_date")
    .eq("id", orderId)
    .maybeSingle();
  if (readError) return { error: readError.message, retryable: true };
  if (!order || order.assigned_installer_id !== user.id) {
    return { error: t("orderNotAssigned"), retryable: false };
  }

  const decision = decideInstallerTransition(order.status, toStatus);
  if (decision.kind === "already_applied") {
    return { error: null, ok: true }; // respuesta perdida: retry idempotente
  }
  if (decision.kind === "conflict") {
    return { error: t("invalidTransition"), retryable: false };
  }

  const block = orderTransitionBlock(
    {
      status: order.status,
      assignedInstallerId: order.assigned_installer_id,
      acceptedAt: order.installer_accepted_at,
      // El instalador nunca sale de 'relevamiento': eso lo hace la empresa o el
      // coordinador desde su tablero, así que acá la regla del acta no aplica.
      hasSurvey: true,
      scheduledDate: order.scheduled_date,
    },
    toStatus,
    { id: user.id },
  );
  if (block === "invalidTransition") {
    return { error: t("invalidTransition"), retryable: false };
  }
  if (block) return { error: t(block), retryable: false };

  // Compare-and-set: si el estado o la asignación cambian entre lectura y
  // escritura, esta operación no pisa el trabajo concurrente.
  const { data: updated, error } = await supabase
    .from("work_orders")
    .update({ status: toStatus })
    .eq("id", orderId)
    .eq("assigned_installer_id", user.id)
    .in("status", decision.expectedStatuses)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message, retryable: true };
  if (!updated) {
    const { data: current, error: retryReadError } = await supabase
      .from("work_orders")
      .select("status, assigned_installer_id")
      .eq("id", orderId)
      .maybeSingle();
    if (retryReadError) {
      return { error: retryReadError.message, retryable: true };
    }
    if (current?.assigned_installer_id === user.id && current.status === toStatus) {
      return { error: null, ok: true };
    }
    return { error: t("invalidTransition"), retryable: false };
  }
  return { error: null, ok: true };
}

const offlineTransitionSchema = z.object({
  operationId: z.string().uuid(),
  orderId: z.string().uuid(),
  toStatus: z.enum(["en_camino", "en_sitio", "en_proceso", "en_revision"]),
});

/**
 * Contrato server-side para reproducir una transición de la cola offline.
 * Autentica, verifica asignación y aplica solamente el salto exacto esperado.
 */
export async function syncInstallerTransition(input: {
  operationId: string;
  orderId: string;
  toStatus: InstallerTransitionTarget;
}): Promise<OfflineTransitionState> {
  const t = await getTranslations("Errors");
  const parsed = offlineTransitionSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData"), retryable: false };

  try {
    const result = await installerTransition(
      parsed.data.orderId,
      parsed.data.toStatus,
    );
    if (!result.error) {
      revalidatePath("/tasks");
      revalidatePath(`/tasks/${parsed.data.orderId}`);
      revalidatePath("/home");
      return result;
    }

    // El cliente sólo ve un cartel; sin esto no hay forma de saber desde el
    // servidor cuántas transiciones de campo se están rechazando ni por qué.
    logEvent(result.retryable === false ? "error" : "warn", "offline.transition.rejected", {
      operation_id: parsed.data.operationId,
      order_id: parsed.data.orderId,
      to_status: parsed.data.toStatus,
      retryable: result.retryable !== false,
    });
    return result;
  } catch (error) {
    logEvent("error", "offline.transition.failed", {
      operation_id: parsed.data.operationId,
      order_id: parsed.data.orderId,
      to_status: parsed.data.toStatus,
      error,
    });
    return { error: t("unexpected"), retryable: true };
  }
}

/**
 * El instalador acepta una orden que le asignaron.
 *
 * Idempotente: si ya la aceptó, es un no-op exitoso (el retry offline no puede
 * romper). Sólo sella la propia asignación; la RLS ya limita a sus órdenes,
 * pero se valida igual antes de escribir.
 */
export async function acceptOrder(orderId: string): Promise<ActionState> {
  const t = await getTranslations("Errors");
  if (!z.string().uuid().safeParse(orderId).success) {
    return { error: t("invalidData") };
  }
  try {
    const { supabase, user } = await requireInstaller();
    const { data: order } = await supabase
      .from("work_orders")
      .select("id, assigned_installer_id, installer_accepted_at, status")
      .eq("id", orderId)
      .single();
    if (!order || order.assigned_installer_id !== user.id) {
      return { error: t("orderNotAssigned") };
    }
    if (order.installer_accepted_at) return { error: null, ok: true }; // ya aceptada

    const { error } = await supabase
      .from("work_orders")
      .update({ installer_accepted_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("assigned_installer_id", user.id);
    if (error) return { error: error.message };

    revalidatePath("/tasks");
    revalidatePath(`/tasks/${orderId}`);
    revalidatePath("/home");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

const updateSchema = z.object({
  orderId: z.string().uuid(),
  updateId: z.string().uuid(), // generado en el CLIENTE: idempotencia offline
  type: z.enum(["travel", "checkin", "progress", "blocker", "done"]),
  note: z.string().max(2000).optional().default(""),
  photos: z.array(z.string()).max(10).optional().default([]),
  // Sólo los hitos que mueven el estado los traen (FLD-R2.1). Un avance o un
  // bloqueo no cambian el estado de la orden, así que van en null.
  fromStatus: z.string().optional(),
  toStatus: z.string().optional(),
});

/**
 * Registra un avance en la orden. `updateId` viene del cliente para que un
 * reintento (offline) no duplique la fila: upsert con ignoreDuplicates.
 */
export async function addUpdate(input: {
  orderId: string;
  updateId: string;
  type: OrderUpdateType;
  note?: string;
  photos?: string[];
  fromStatus?: string;
  toStatus?: string;
}): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidUpdate") };

  try {
    const { supabase, user } = await requireInstaller();

    const { data: order } = await supabase
      .from("work_orders")
      .select("id, company_id, assigned_installer_id")
      .eq("id", parsed.data.orderId)
      .single();
    if (!order || order.assigned_installer_id !== user.id) {
      return { error: t("orderNotAssigned") };
    }

    const { error } = await supabase.from("order_updates").upsert(
      {
        id: parsed.data.updateId,
        order_id: parsed.data.orderId,
        company_id: order.company_id,
        installer_id: user.id,
        type: parsed.data.type,
        note: parsed.data.note ?? "",
        photos: parsed.data.photos ?? [],
        from_status: parsed.data.fromStatus ?? null,
        to_status: parsed.data.toStatus ?? null,
        client_created_at: new Date().toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) return { error: error.message };

    // El bloqueo suena distinto: es lo único del flujo que le cambia el día a
    // quien coordina, porque si nadie interviene el instalador se queda
    // parado en el sitio.
    await requestPushDelivery(
      supabase,
      parsed.data.type === "blocker" ? "blocker_reported" : "update_received",
      parsed.data.updateId,
    );

    revalidatePath(`/tasks/${parsed.data.orderId}`);
  } catch {
    return { error: t("unexpected") };
  }
  return { error: null, ok: true };
}

/**
 * Etapa 2 del flujo: el instalador informa que salió hacia la locación.
 *
 * Es la primera acción del día sobre la orden y la única que no admite
 * evidencia: sale de un estacionamiento, no de una obra. Sólo el instalador
 * asignado puede marcarla, y el trigger lo verifica además de esta acción.
 */
export async function departToSite(
  orderId: string,
  updateId: string,
  note?: string,
): Promise<ActionState> {
  const [t, taskT] = await Promise.all([
    getTranslations("Errors"),
    getTranslations("TaskActions"),
  ]);
  try {
    const res = await installerTransition(orderId, "en_camino");
    if (res.error) return res;
    await addUpdate({
      orderId,
      updateId,
      type: "travel",
      note: note?.trim() || taskT("departedNote"),
      fromStatus: "planificada",
      toStatus: "en_camino",
    });
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${orderId}`);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

/**
 * Etapa 3: llegada a la locación, con evidencia OPCIONAL del estado inicial.
 *
 * Las fotos no se exigen a propósito (FLD-R3.2): pedir evidencia para poder
 * declarar que se llegó dejaría a alguien sin señal parado en la puerta sin
 * poder registrar nada. El mínimo obligatorio es al cerrar, no al llegar.
 */
export async function arriveAtSite(
  orderId: string,
  updateId: string,
  note?: string,
  photos?: string[],
): Promise<ActionState> {
  const [t, taskT] = await Promise.all([
    getTranslations("Errors"),
    getTranslations("TaskActions"),
  ]);
  try {
    const res = await installerTransition(orderId, "en_sitio");
    if (res.error) return res;
    await addUpdate({
      orderId,
      updateId,
      type: "checkin",
      note: note?.trim() || taskT("arrivedNote"),
      photos,
      toStatus: "en_sitio",
    });
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${orderId}`);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

/**
 * Etapa 5: el instalador reporta que algo le impide seguir.
 *
 * Escribe DOS cosas: el evento de campo con su evidencia (`order_updates`
 * tipo 'blocker', el historial que ya existía) y una incidencia formal
 * (`order_incidents`, lo que la empresa ya mira en el dashboard, en las
 * alertas críticas y en la tasa de incidencias del punto 22). Hasta acá el
 * instalador sólo podía escribir la primera: `createIncident` exigía gerente o
 * coordinador, así que quien estaba parado en el sitio y veía el problema no
 * podía abrir el registro que el resto de la empresa consulta.
 *
 * NO cambia el estado de la orden (FLD-R5.4, DEC-24-02). Una orden bloqueada
 * sigue en proceso: el instalador puede cargar avances de lo que sí pudo
 * hacer, o cerrar si el problema se resolvió solo.
 *
 * La categoría y la severidad salen fijas a propósito. El instalador describe
 * y saca fotos; clasificar es trabajo del coordinador, que ya tiene la
 * pantalla para editarla, y no algo que se le pida a alguien que está arriba
 * de una escalera resolviendo un problema.
 */
export async function reportBlocker(
  orderId: string,
  updateId: string,
  note: string,
  photos?: string[],
): Promise<ActionState> {
  const t = await getTranslations("Errors");
  try {
    const { supabase, user } = await requireInstaller();

    const { data: order } = await supabase
      .from("work_orders")
      .select("id, company_id, assigned_installer_id")
      .eq("id", orderId)
      .single();
    if (!order || order.assigned_installer_id !== user.id) {
      return { error: t("orderNotAssigned") };
    }

    // Sólo se escribe el evento: el trigger `blocker_to_incident` abre la
    // incidencia formal. Está en la base y no acá porque el área installer
    // escribe por dos caminos —esta acción y la cola offline—, y un bloqueo
    // reportado sin señal, que es el caso más probable, nunca habría llegado
    // al dashboard si la regla viviera sólo en la aplicación.
    const saved = await addUpdate({
      orderId,
      updateId,
      type: "blocker",
      note,
      photos,
    });
    if (saved.error) return saved;

    revalidatePath(`/tasks/${orderId}`);
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/dashboard");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

/**
 * Etapa 4: empieza el trabajo propiamente dicho.
 *
 * Hasta el punto 24 este botón hacía tres cosas a la vez —check-in, arranque
 * y transición— y era la única puerta de entrada al trabajo. Ahora es sólo el
 * arranque: la llegada tiene su propia acción. Se puede seguir llamando desde
 * `planificada` (el instalador ya estaba en el sitio por otra orden), que es
 * el camino corto que la base conserva a propósito.
 */
export async function startTask(
  orderId: string,
  checkinId: string,
): Promise<ActionState> {
  const [t, taskT] = await Promise.all([
    getTranslations("Errors"),
    getTranslations("TaskActions"),
  ]);
  try {
    const res = await installerTransition(orderId, "en_proceso");
    if (res.error) return res;
    await addUpdate({
      orderId,
      updateId: checkinId,
      type: "checkin",
      note: taskT("startedNote"),
      toStatus: "en_proceso",
    });
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${orderId}`);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

/** Terminar: en_proceso → en_revision. La empresa después aprueba a finalizada. */
export async function finishTask(
  orderId: string,
  doneId: string,
  note?: string,
  photos?: string[],
): Promise<ActionState> {
  const [t, taskT] = await Promise.all([
    getTranslations("Errors"),
    getTranslations("TaskActions"),
  ]);
  try {
    // El mínimo de evidencia se comprueba acá para poder decir CUÁNTAS faltan
    // (FLD-R4.5). El trigger lo revalida y es la última palabra: esta acción
    // no es el único camino a la base —la cola offline escribe por el suyo—,
    // así que esto es un mensaje mejor, no el control.
    const { supabase } = await requireInstaller();
    const [{ data: minimum }, { data: existing }] = await Promise.all([
      supabase.rpc("order_min_photos", { p_order: orderId }),
      supabase.rpc("order_photo_count", { p_order: orderId }),
    ]);
    const readiness = completionReadiness(
      existing ?? 0,
      minimum ?? DEFAULT_MIN_COMPLETION_PHOTOS,
      photos?.length ?? 0,
    );
    if (!readiness.ready) {
      return {
        error: taskT("missingPhotos", {
          missing: readiness.missing,
          required: readiness.required,
        }),
      };
    }

    await addUpdate({
      orderId,
      updateId: doneId,
      type: "done",
      note: note ?? taskT("finishedNote"),
      photos,
      fromStatus: "en_proceso",
      toStatus: "en_revision",
    });
    const res = await installerTransition(orderId, "en_revision");
    if (res.error) return res;
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${orderId}`);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}
