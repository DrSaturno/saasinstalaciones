"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { createClient } from "@/lib/supabase/server";

/**
 * Link público de seguimiento para el cliente final (bloque 7,
 * docs/specs/2026-09-24-link-cliente).
 *
 * Sin chequeo de permiso propio acá: `rotate_project_tracking_link` /
 * `revoke_project_tracking_link` son `security definer` y validan
 * `can_operate_project` ellas mismas — el mismo criterio que ya decide quién
 * le puede escribir al cliente, no algo nuevo que inventar acá.
 */

export type ProjectTrackingLinkState = { error: string | null; token?: string };

export async function createProjectTrackingLink(
  projectId: string,
): Promise<ProjectTrackingLinkState> {
  const t = await getTranslations("Errors");
  if (!z.string().uuid().safeParse(projectId).success) {
    return { error: t("invalidData") };
  }

  try {
    const user = await getAuthorizedUser();
    if (!user) throw new Error("access");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("rotate_project_tracking_link", {
      p_project_id: projectId,
    });
    if (error || !data) return { error: t("operation") };

    revalidatePath(`/projects/${projectId}`);
    return { error: null, token: data };
  } catch {
    return { error: t("unexpected") };
  }
}

export async function revokeProjectTrackingLink(
  projectId: string,
): Promise<ProjectTrackingLinkState> {
  const t = await getTranslations("Errors");
  if (!z.string().uuid().safeParse(projectId).success) {
    return { error: t("invalidData") };
  }

  try {
    const user = await getAuthorizedUser();
    if (!user) throw new Error("access");
    const supabase = await createClient();
    const { error } = await supabase.rpc("revoke_project_tracking_link", {
      p_project_id: projectId,
    });
    if (error) return { error: t("operation") };

    revalidatePath(`/projects/${projectId}`);
    return { error: null };
  } catch {
    return { error: t("unexpected") };
  }
}
