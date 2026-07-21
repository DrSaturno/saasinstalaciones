"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

const tokenSchema = z.string().uuid("Link inválido");

export type AcceptState = { error: string | null; ok?: boolean };

/**
 * El instalador logueado acepta la invitación. La lógica (validez, rol, alta en
 * company_installers) vive en la función security-definer accept_invitation.
 */
export async function acceptInvitation(token: string): Promise<AcceptState> {
  const t = await getTranslations("Errors");
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return { error: t("invalidInvitation") };

  const user = await getCurrentUser();
  if (!user) return { error: t("loginRequired") };
  if (user.role !== "installer") {
    return { error: t("installerOnlyInvitation") };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation", {
    p_token: parsed.data,
  });
  if (error) return { error: error.message };

  return { error: null, ok: true };
}
