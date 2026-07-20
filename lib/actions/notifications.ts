"use server";

import { revalidatePath } from "next/cache";
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
    .is("read_at", null);
  revalidatePath("/", "layout");
}

export async function savePushSubscription(input: unknown): Promise<{ error: string | null }> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { error: "Suscripción inválida" };
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
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo activar" };
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
