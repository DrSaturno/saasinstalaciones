"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(1024),
    auth: z.string().min(1).max(512),
  }),
});

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Acceso denegado");
  return { user, supabase: await createClient() };
}

export async function markNotificationRead(id: string): Promise<void> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return;
  const { user, supabase } = await requireUser();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .is("read_at", null);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
  const { user, supabase } = await requireUser();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null)
    .is("dismissed_at", null);
  revalidatePath("/", "layout");
}

/**
 * Archivar: sale de la bandeja principal, sigue disponible en "Archivadas".
 *
 * `.not("read_at", "is", null)` no es una formalidad: archivar algo sin
 * haberlo leído lo haría desaparecer sin que nadie lo vea, que es lo
 * contrario de "mantener visibles las pendientes" (NOT-R2). El filtro por
 * `user_id` tampoco sobra aunque la RLS ya acote: es la misma defensa en
 * profundidad que usa el resto de las acciones.
 *
 * Nada de esto borra la fila — el registro queda para trazabilidad, y otro
 * destinatario del mismo anuncio no se entera (NOT-R1).
 */
export async function archiveNotification(id: string): Promise<void> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return;
  const { user, supabase } = await requireUser();
  await supabase
    .from("notifications")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .not("read_at", "is", null)
    .is("archived_at", null);
  revalidatePath("/", "layout");
}

/** Vuelve a la bandeja principal. Sólo aplica a lo archivado. */
export async function unarchiveNotification(id: string): Promise<void> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return;
  const { user, supabase } = await requireUser();
  await supabase
    .from("notifications")
    .update({ archived_at: null })
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .is("dismissed_at", null);
  revalidatePath("/", "layout");
}

/**
 * Descartar: no vuelve a aparecer en ninguna vista de esta persona.
 *
 * Es más fuerte que archivar y por eso no tiene vuelta atrás en la UI, pero
 * sigue sin borrar: la fila queda, y con ella la prueba de que el aviso se
 * emitió y a quién (NOT-R1, NOT-R3).
 */
export async function dismissNotification(id: string): Promise<void> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return;
  const { user, supabase } = await requireUser();
  await supabase
    .from("notifications")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .not("read_at", "is", null)
    .is("dismissed_at", null);
  revalidatePath("/", "layout");
}

export async function savePushSubscription(input: unknown): Promise<{ error: string | null }> {
  const t = await getTranslations("Errors");
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidSubscription") };
  try {
    const { user, supabase } = await requireUser();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: parsed.data.endpoint,
        keys: parsed.data.keys,
      },
      { onConflict: "user_id,endpoint" },
    );
    return { error: error?.message ?? null };
  } catch {
    return { error: t("pushActivation") };
  }
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const parsed = z.string().url().max(2048).safeParse(endpoint);
  if (!parsed.success) return;
  const { user, supabase } = await requireUser();
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", parsed.data);
}
