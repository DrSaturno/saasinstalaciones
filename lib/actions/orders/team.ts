"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requestPushDelivery } from "@/lib/push/events";
import { assignmentGateErrorMessage, type AssignmentGateCode, ASSIGNMENT_GATE_CODES } from "./assignment-gate";
import { requireOperator } from "./context";
import type { ActionState } from "./types";

/**
 * Plantel de una orden (bloque 5, docs/specs/2026-09-24-multi-instalador).
 *
 * El responsable sigue yendo por `assignInstaller`; esto agrega y quita
 * AYUDANTES. Las RPC (`add_order_team_member`, `remove_order_team_member`,
 * `set_team_member_*`) validan permiso y cupo ellas mismas: acá sólo se
 * traducen sus errores.
 */

const idsSchema = z.object({ orderId: z.string().uuid(), installerId: z.string().uuid() });

async function teamErrorMessage(message: string): Promise<string> {
  const t = await getTranslations("Errors");
  if (message.includes("TEAM_FULL")) return t("teamFull");
  if (message.includes("TEAM_ALREADY_LEAD")) return t("teamAlreadyLead");
  if (message.includes("ORDER_NEEDS_LEAD_FIRST")) return t("teamNeedsLead");
  return t("operation");
}

export async function addOrderTeamMember(
  orderId: string,
  installerId: string,
  overrideReason?: string,
): Promise<ActionState & { overrideAllowed?: boolean }> {
  const t = await getTranslations("Errors");
  if (!idsSchema.safeParse({ orderId, installerId }).success) {
    return { error: t("invalidData") };
  }
  try {
    const { supabase } = await requireOperator();
    const { data, error } = await supabase.rpc("add_order_team_member", {
      p_order_id: orderId,
      p_installer_id: installerId,
      p_operation_id: crypto.randomUUID(),
      p_override_reason: overrideReason,
    });
    if (error) return { error: await teamErrorMessage(error.message) };

    const row = (data ?? {}) as Record<string, unknown>;
    if (row.available !== true) {
      const code = ASSIGNMENT_GATE_CODES.includes(row.code as AssignmentGateCode)
        ? (row.code as AssignmentGateCode)
        : "SCHEDULE_CONFLICT";
      return {
        error: await assignmentGateErrorMessage(code),
        overrideAllowed: row.override_allowed === true,
      };
    }

    await requestPushDelivery(supabase, "order_assigned", orderId, installerId);
    revalidatePath(`/orders/${orderId}`);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

export async function removeOrderTeamMember(
  orderId: string,
  installerId: string,
): Promise<ActionState> {
  const t = await getTranslations("Errors");
  if (!idsSchema.safeParse({ orderId, installerId }).success) {
    return { error: t("invalidData") };
  }
  try {
    const { supabase } = await requireOperator();
    const { error } = await supabase.rpc("remove_order_team_member", {
      p_order_id: orderId,
      p_installer_id: installerId,
    });
    if (error) return { error: await teamErrorMessage(error.message) };
    revalidatePath(`/orders/${orderId}`);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

const amountSchema = idsSchema.extend({ amount: z.number().min(0) });

export async function setTeamMemberAmount(input: {
  orderId: string;
  installerId: string;
  amount: number;
}): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = amountSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };
  try {
    const { supabase } = await requireOperator();
    const { error } = await supabase.rpc("set_team_member_amount", {
      p_order_id: parsed.data.orderId,
      p_installer_id: parsed.data.installerId,
      p_amount: parsed.data.amount,
    });
    if (error) return { error: await teamErrorMessage(error.message) };
    revalidatePath(`/orders/${parsed.data.orderId}`);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

const statusSchema = idsSchema.extend({ status: z.enum(["pending", "paid"]) });

export async function setTeamMemberPaymentStatus(input: {
  orderId: string;
  installerId: string;
  status: "pending" | "paid";
}): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };
  try {
    const { supabase } = await requireOperator();
    const { error } = await supabase.rpc("set_team_member_payment_status", {
      p_order_id: parsed.data.orderId,
      p_installer_id: parsed.data.installerId,
      p_status: parsed.data.status,
    });
    if (error) return { error: await teamErrorMessage(error.message) };
    revalidatePath(`/orders/${parsed.data.orderId}`);
    revalidatePath("/finance");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}
