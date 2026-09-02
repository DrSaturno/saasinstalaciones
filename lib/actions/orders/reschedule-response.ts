"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "./types";

const responseSchema = z.object({
  rescheduleId: z.string().uuid(),
  response: z.enum(["accepted", "declined"]),
});

/**
 * El instalador contesta si sigue en el trabajo después de que le movieron la
 * fecha.
 *
 * Las validaciones que importan viven en `respond_to_reschedule`: quién
 * responde, que el aviso exista, que no haya sido superada y que no esté ya
 * contestada. Acá no se replican — la función es `security definer`, así que
 * tiene que validarlas ella igual, y duplicarlas sólo agregaría un segundo
 * lugar donde puedan divergir.
 *
 * Tampoco se controla el plazo: una respuesta tardía se acepta y se registra
 * con su hora. Si llegó en término se deriva después. Ver el comentario de la
 * migración.
 */
export async function respondToReschedule(input: {
  rescheduleId: string;
  response: "accepted" | "declined";
}): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = responseSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const user = await getCurrentUser();
    if (!user) return { error: t("accessDenied") };

    const supabase = await createClient();
    const { error } = await supabase.rpc("respond_to_reschedule", {
      p_reschedule_id: parsed.data.rescheduleId,
      p_response: parsed.data.response,
    });
    if (error) return { error: error.message };

    revalidatePath("/tasks");
    revalidatePath("/home");
    revalidatePath("/route");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}
