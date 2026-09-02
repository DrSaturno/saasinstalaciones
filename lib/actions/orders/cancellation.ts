"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "./types";

export const CANCELLATION_REASONS = [
  "personal_emergency",
  "health",
  "work_conditions",
  "schedule_conflict",
  "other",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

const requestSchema = z.object({
  orderId: z.string().uuid(),
  reasonCode: z.enum(CANCELLATION_REASONS),
  reasonNote: z.string().trim().max(600).default(""),
});

const reviewSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  justified: z.boolean(),
  note: z.string().trim().max(500).default(""),
});

/**
 * El instalador pide la baja de un trabajo asignado.
 *
 * Si está en plazo (dos días hábiles antes del inicio) el pedido se aprueba
 * solo y se desvincula en el acto; fuera de plazo queda para que lo revise el
 * gerente. **Esa decisión la toma el servidor**, no esta acción: `within_notice`
 * dispara la autoaprobación, así que calcularlo acá y pasárselo permitiría
 * saltearse la revisión llamando al RPC a mano.
 */
export async function requestOrderCancellation(input: {
  orderId: string;
  reasonCode: CancellationReason;
  reasonNote: string;
}): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const user = await getCurrentUser();
    if (!user) return { error: t("accessDenied") };

    const supabase = await createClient();
    const { error } = await supabase.rpc("request_order_cancellation", {
      p_order_id: parsed.data.orderId,
      p_reason_code: parsed.data.reasonCode,
      p_reason_note: parsed.data.reasonNote,
    });
    if (error) return { error: error.message };

    revalidatePath("/tasks");
    revalidatePath(`/tasks/${parsed.data.orderId}`);
    revalidatePath("/home");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

/**
 * El gerente resuelve un pedido que quedó fuera de plazo.
 *
 * `justified` es lo que después decide si el evento pesa o no en la
 * confiabilidad, y por eso se pide aparte de la decisión: se puede aprobar una
 * baja sin considerarla justificada (la empresa la acepta igual, pero el
 * incumplimiento existió) y se puede rechazarla reconociendo que el motivo era
 * real. Colapsar las dos cosas en un solo botón perdería esa diferencia.
 */
export async function reviewOrderCancellation(input: {
  requestId: string;
  decision: "approved" | "rejected";
  justified: boolean;
  note: string;
}): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const user = await getCurrentUser();
    if (!user) return { error: t("accessDenied") };

    const supabase = await createClient();
    const { error } = await supabase.rpc("review_order_cancellation", {
      p_request_id: parsed.data.requestId,
      p_decision: parsed.data.decision,
      p_justified: parsed.data.justified,
      p_note: parsed.data.note,
    });
    if (error) return { error: error.message };

    revalidatePath("/dashboard");
    revalidatePath("/orders");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}
