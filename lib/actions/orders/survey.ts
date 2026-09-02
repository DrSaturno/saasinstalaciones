"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "./types";

const decisionSchema = z.object({
  submissionId: z.string().uuid(),
  decision: z.enum(["approved", "changes_requested"]),
  // El mínimo de 3 lo exige también la función y el CHECK de la tabla. Se
  // valida acá para poder mostrar el error en el campo, no como un cartel rojo
  // genérico después de mandar.
  reason: z.string().trim().max(1000).default(""),
}).refine(
  (value) => value.decision !== "changes_requested" || value.reason.length >= 3,
  { path: ["reason"] },
);

const submitSchema = z.object({
  activityId: z.string().uuid(),
  notes: z.string().trim().max(4000).default(""),
  // Las respuestas ya vienen repartidas por tipo desde el dominio. Se validan
  // como registros planos: la forma exacta la definió la plantilla, y volver a
  // describirla acá sería una tercera copia de la misma verdad.
  checklist: z.record(z.string(), z.boolean()).default({}),
  measurements: z.record(z.string(), z.number().finite()).default({}),
  formData: z.record(z.string(), z.string().max(2000)).default({}),
});

/**
 * La decisión del coordinador sobre un relevamiento.
 *
 * Aprobar y pedir cambios son la misma acción con distinta decisión, y no dos
 * flujos separados: el requisito enumera cinco cosas que el coordinador puede
 * hacer —aprobar, pedir más información, pedir fotos, pedir mediciones, pedir
 * otra visita— pero las cuatro últimas son la misma decisión con distinto
 * motivo. Cuatro botones darían cuatro etiquetas; un motivo da una explicación.
 *
 * El `operation_id` se genera acá y no en el cliente: es lo que hace la
 * operación idempotente del lado del servidor, y dejarlo en manos del
 * navegador permitiría reusarlo con datos distintos.
 */
export async function decideSurveySubmission(input: {
  submissionId: string;
  decision: "approved" | "changes_requested";
  reason: string;
}): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const user = await getCurrentUser();
    if (!user) return { error: t("accessDenied") };

    const supabase = await createClient();
    const { error } = await supabase.rpc("decide_survey_submission", {
      p_operation_id: randomUUID(),
      p_submission_id: parsed.data.submissionId,
      p_decision: parsed.data.decision,
      p_reason: parsed.data.reason,
    });
    if (error) return { error: error.message };

    revalidatePath("/orders");
    revalidatePath("/coordination");
    revalidatePath("/tasks");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

/**
 * El instalador envía su relevamiento, o una versión corregida.
 *
 * No hace falta distinguir "enviar" de "reenviar": el comando calcula la
 * versión siguiente, y si el contenido es idéntico al ya enviado devuelve esa
 * misma versión en vez de crear una nueva. Un reintento no le hace creer al
 * coordinador que hubo una corrección.
 */
export async function submitSurvey(input: {
  activityId: string;
  notes: string;
  checklist: Record<string, boolean>;
  measurements: Record<string, number>;
  formData: Record<string, string>;
}): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const user = await getCurrentUser();
    if (!user) return { error: t("accessDenied") };

    const supabase = await createClient();
    const { error } = await supabase.rpc("submit_survey_submission", {
      p_activity_id: parsed.data.activityId,
      p_notes: parsed.data.notes,
      p_checklist: parsed.data.checklist,
      p_measurements: parsed.data.measurements,
      p_form_data: parsed.data.formData,
    });
    if (error) return { error: error.message };

    revalidatePath("/tasks");
    revalidatePath(`/tasks/${parsed.data.activityId}`);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

const waiveSchema = z.object({
  activityId: z.string().uuid(),
  // 10 mínimo, igual que el CHECK de la tabla y que la función. Se repite acá
  // para poder mostrar el error en el campo en vez de un código de Postgres.
  reason: z.string().trim().min(10).max(500),
});

/**
 * Arrancar la ejecución sin el relevamiento aprobado, dejando constancia.
 *
 * Lo puede hacer quien puede aprobar (DEC-15) y nadie más. Si el gerente
 * pudiera dispensar, DEC-15 quedaría decorativa: no aprobaría el relevamiento
 * pero saltearía el requisito, y la ejecución arrancaría igual sin que el
 * coordinador viera nada.
 */
export async function waivePrerequisite(input: {
  activityId: string;
  reason: string;
}): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = waiveSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const user = await getCurrentUser();
    if (!user) return { error: t("accessDenied") };

    const supabase = await createClient();
    const { error } = await supabase.rpc("waive_activity_prerequisite", {
      p_activity_id: parsed.data.activityId,
      p_reason: parsed.data.reason,
    });
    if (error) return { error: error.message };

    revalidatePath("/orders");
    revalidatePath("/tasks");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}
