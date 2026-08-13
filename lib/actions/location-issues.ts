"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolución de la cola de revisión del backfill (R2-UI-03).
 *
 * Resolver acá NO fusiona ni separa locaciones: registra la decisión de una
 * persona sobre una fila que el backfill no pudo decidir solo. La nota es
 * obligatoria porque el valor de la cola es justamente saber por qué se
 * consideró zanjado; sin eso queda una fila en `resolved` que no le explica
 * nada al que venga después.
 */
const schema = z.object({
  issueId: z.string().uuid(),
  decision: z.enum(["resolved", "ignored"]),
  note: z.string().trim().min(10).max(1000),
});

export type LocationIssueActionState = { error: string | null; ok?: boolean };

export async function resolveLocationIssue(
  _previous: LocationIssueActionState,
  formData: FormData,
): Promise<LocationIssueActionState> {
  const t = await getTranslations("Errors");
  const parsed = schema.safeParse({
    issueId: formData.get("issueId"),
    decision: formData.get("decision"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: t("locationIssueNoteRequired") };

  const user = await getCurrentUser();
  if (!user?.companyId || user.role !== "company_manager") {
    return { error: t("accessDenied") };
  }

  const supabase = await createClient();
  const { error, data } = await supabase
    .from("location_backfill_issues")
    .update({
      status: parsed.data.decision,
      resolution_note: parsed.data.note,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.issueId)
    // Sólo se resuelve lo pendiente: si dos personas abren la cola a la vez, la
    // segunda no pisa la decisión de la primera sin verla.
    .eq("status", "pending")
    .select("id");

  if (error) return { error: t("locationIssueUpdate") };
  if (!data || data.length === 0) return { error: t("locationIssueAlreadyClosed") };

  revalidatePath("/locations/review");
  return { error: null, ok: true };
}
