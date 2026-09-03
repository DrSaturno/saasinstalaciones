import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import type { Database } from "@/types/database";

/**
 * Los códigos que `assign_installer_gate` puede devolver.
 *
 * Son opacos a propósito: ninguno lleva de quién, dónde ni por qué está
 * ocupada la persona en otro compromiso. Eso es lo que permite que la empresa
 * A vea "no disponible" sobre una persona comprometida con la empresa B sin
 * que la plataforma le cuente nada de B (REQ-11.4).
 */
export const ASSIGNMENT_GATE_CODES = [
  "AVAILABLE",
  "SCHEDULE_CONFLICT",
  "OUTSIDE_AVAILABILITY",
  "TRAVEL_CONFLICT",
  "STALE_VERSION",
  "NOT_ELIGIBLE",
  "ACTIVITY_CLOSED",
  "PREREQUISITE_PENDING",
] as const;
export type AssignmentGateCode = (typeof ASSIGNMENT_GATE_CODES)[number];

export type AssignmentGateResult = {
  available: boolean;
  code: AssignmentGateCode;
  /** Si `true`, un `overrideReason` de al menos 10 caracteres puede forzarla. */
  overrideAllowed: boolean;
  assignmentId: string | null;
};

function parseCode(value: unknown): AssignmentGateCode {
  return (ASSIGNMENT_GATE_CODES as readonly string[]).includes(value as string)
    ? (value as AssignmentGateCode)
    : "SCHEDULE_CONFLICT";
}

/**
 * La única puerta para asignar un instalador a una orden.
 *
 * **Ningún llamador escribe `assigned_installer_id` directamente.** Un
 * trigger en la base lo exige — `ASSIGNMENT_MUST_USE_GATE` si algo lo
 * intenta — así que esto no es una convención que alguien pueda olvidar
 * seguir, es la única forma de que la escritura no falle (AG-R3).
 *
 * Idempotente por `operationId`: un reintento con el mismo id devuelve la
 * misma decisión sin volver a evaluar nada.
 */
export async function assignInstallerThroughGate(
  supabase: SupabaseClient<Database>,
  input: {
    orderId: string;
    installerId: string;
    operationId: string;
    overrideReason?: string;
  },
): Promise<AssignmentGateResult> {
  const { data, error } = await supabase.rpc("assign_installer_gate", {
    p_order_id: input.orderId,
    p_installer_id: input.installerId,
    p_operation_id: input.operationId,
    p_override_reason: input.overrideReason,
  });

  if (error || data === null || typeof data !== "object" || Array.isArray(data)) {
    // El gate en sí falló (orden inexistente, sin permiso): no es un código
    // de negocio, es un error de la operación. Se informa como bloqueo
    // genérico en vez de fingir un veredicto que la base nunca dio.
    return {
      available: false,
      code: "SCHEDULE_CONFLICT",
      overrideAllowed: false,
      assignmentId: null,
    };
  }

  const row = data as Record<string, unknown>;
  return {
    available: row.available === true,
    code: parseCode(row.code),
    overrideAllowed: row.override_allowed === true,
    assignmentId: typeof row.assignment_id === "string" ? row.assignment_id : null,
  };
}

/**
 * El mensaje que el gerente lee cuando el gate bloquea.
 *
 * `t()` exige una clave literal en el código —next-intl la valida en
 * build—, así que esto es un `switch` con una llamada por rama y no un
 * `Record` indexado: un `t(variable)` compilaría igual pero dejaría de
 * avisar si alguna clave del namespace `Errors` se renombra.
 */
export async function assignmentGateErrorMessage(
  code: AssignmentGateCode,
): Promise<string> {
  const t = await getTranslations("Errors");
  switch (code) {
    case "SCHEDULE_CONFLICT":
      return t("assignmentScheduleConflict");
    case "OUTSIDE_AVAILABILITY":
      return t("assignmentOutsideAvailability");
    case "TRAVEL_CONFLICT":
      return t("assignmentTravelConflict");
    case "NOT_ELIGIBLE":
      return t("installerNotActive");
    case "ACTIVITY_CLOSED":
      return t("assignmentActivityClosed");
    case "AVAILABLE":
    case "STALE_VERSION":
    case "PREREQUISITE_PENDING":
      return t("unexpected");
  }
}
