import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  parseSurveyTemplate,
  type SurveyField,
} from "@/lib/domain/survey-template";
import { throwIfDataError } from "@/lib/data/errors";

export type SurveyState = {
  activityId: string;
  /** Los campos que hay que completar, congelados al crear la actividad. */
  fields: SurveyField[];
  /** null cuando todavía no se envió nada. */
  submissionId: string | null;
  version: number;
  status: "draft" | "submitted" | "changes_requested" | "approved" | "none";
  notes: string;
  submittedAt: string | null;
  authorId: string | null;
  /** Lo que el coordinador pidió en la última decisión, si pidió algo. */
  lastDecisionReason: string;
  lastDecisionAt: string | null;
};

const STATUSES = ["draft", "submitted", "changes_requested", "approved"] as const;

function toStatus(value: string): SurveyState["status"] {
  return (STATUSES as readonly string[]).includes(value)
    ? (value as SurveyState["status"])
    : "none";
}

/**
 * El relevamiento de una orden: la última versión y qué se decidió sobre ella.
 *
 * Devuelve null cuando la orden no tiene actividad de relevamiento, que es el
 * caso de las órdenes de sólo ejecución y de las 30 que vienen del modelo
 * viejo. Quien llame no tiene que saber cuál de los dos casos es.
 */
export async function fetchSurveyState(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<SurveyState | null> {
  const { data: activity, error: activityError } = await supabase
    .from("work_activities")
    .select("id, checklist_definition")
    .eq("work_order_id", orderId)
    .eq("activity_type", "survey")
    .maybeSingle();
  throwIfDataError("surveys.activity", activityError);
  if (!activity) return null;

  const { data: submission, error: submissionError } = await supabase
    .from("survey_submissions")
    .select("id, version, status, notes, submitted_at, author_id")
    .eq("activity_id", activity.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfDataError("surveys.submission", submissionError);

  const fields = parseSurveyTemplate(activity.checklist_definition);

  if (!submission) {
    return {
      activityId: activity.id,
      fields,
      submissionId: null,
      version: 0,
      status: "none",
      notes: "",
      submittedAt: null,
      authorId: null,
      lastDecisionReason: "",
      lastDecisionAt: null,
    };
  }

  const { data: decision, error: decisionError } = await supabase
    .from("survey_submission_decisions")
    .select("reason, created_at")
    .eq("submission_id", submission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfDataError("surveys.last_decision", decisionError);

  return {
    activityId: activity.id,
    fields,
    submissionId: submission.id,
    version: submission.version,
    status: toStatus(submission.status),
    notes: submission.notes,
    submittedAt: submission.submitted_at,
    authorId: submission.author_id,
    lastDecisionReason: decision?.reason ?? "",
    lastDecisionAt: decision?.created_at ?? null,
  };
}

/**
 * Con qué autoridad puede decidir quien mira: coordinador del proyecto,
 * gerente por ausencia de coordinador, o ninguna (DEC-15).
 *
 * Se pregunta al servidor en vez de deducirlo en el cliente para que la
 * pantalla y la función no puedan discrepar: si acá dijéramos que sí y allá
 * que no, el usuario vería un botón que siempre falla.
 */
export async function fetchSurveyDecisionAuthority(
  supabase: SupabaseClient<Database>,
  activityId: string,
): Promise<"coordinator" | "manager_fallback" | null> {
  const { data, error } = await supabase.rpc("survey_decision_authority", {
    p_activity_id: activityId,
  });
  throwIfDataError("surveys.decision_authority", error);
  return data === "coordinator" || data === "manager_fallback" ? data : null;
}

export type PrerequisiteState = {
  executionActivityId: string;
  /** El relevamiento del que depende. */
  surveyActivityId: string;
  approved: boolean;
  waivedAt: string | null;
  waivedReason: string;
  /** true cuando la ejecución no puede arrancar todavía. */
  blocked: boolean;
};

/**
 * Si la ejecución de esta orden está esperando que se apruebe su relevamiento.
 *
 * Devuelve null cuando la ejecución no declara prerrequisito, que es el caso de
 * las órdenes de sólo ejecución y de las que vienen del modelo viejo.
 *
 * Existe para poder EXPLICAR el bloqueo antes de que la persona choque con él:
 * la base lo rechaza con `PREREQUISITE_SURVEY_NOT_APPROVED`, que como mensaje
 * de error no le dice a nadie qué tiene que pasar para poder avanzar.
 */
export async function fetchPrerequisiteState(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<PrerequisiteState | null> {
  const { data: execution, error: executionError } = await supabase
    .from("work_activities")
    .select("id, prerequisite_activity_id, prerequisite_waived_at, prerequisite_waived_reason")
    .eq("work_order_id", orderId)
    .eq("activity_type", "execution")
    .maybeSingle();
  throwIfDataError("surveys.prerequisite", executionError);

  if (!execution || !execution.prerequisite_activity_id) return null;

  const { count, error: approvalError } = await supabase
    .from("survey_submissions")
    .select("id", { count: "exact", head: true })
    .eq("activity_id", execution.prerequisite_activity_id)
    .eq("status", "approved");
  throwIfDataError("surveys.prerequisite_approval", approvalError);

  const approved = (count ?? 0) > 0;
  return {
    executionActivityId: execution.id,
    surveyActivityId: execution.prerequisite_activity_id,
    approved,
    waivedAt: execution.prerequisite_waived_at,
    waivedReason: execution.prerequisite_waived_reason ?? "",
    blocked: !approved && execution.prerequisite_waived_at === null,
  };
}
