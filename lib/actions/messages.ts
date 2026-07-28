"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { canOperateCompany, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const attachmentSchema = z.object({
  path: z.string().min(3).max(500),
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
});
const schema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  body: z.string().trim().max(4000),
  attachments: z.array(attachmentSchema).max(5),
  replyToId: z.string().uuid().nullable().optional(),
}).refine((value) => value.body.length > 0 || value.attachments.length > 0);

export async function sendCompanyMessage(input: z.input<typeof schema>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Mensaje inválido" };
  const [user, supabase] = await Promise.all([
    getCurrentUser(),
    createClient(),
  ]);
  if (!user) return { error: "Acceso denegado" };

  const { data: thread } = await supabase
    .from("chat_threads")
    .select("id, company_id")
    .eq("id", parsed.data.threadId)
    .single();
  if (!thread || !canOperateCompany(user, thread.company_id)) {
    return { error: "Acceso denegado" };
  }

  const expectedPrefix = `${thread.company_id}/${thread.id}/`;
  if (
    parsed.data.attachments.some(
      (attachment) => !attachment.path.startsWith(expectedPrefix),
    )
  ) {
    return { error: "Adjunto inválido" };
  }

  const { error } = await supabase.from("chat_messages").upsert(
    {
      id: parsed.data.id,
      thread_id: parsed.data.threadId,
      company_id: thread.company_id,
      sender_id: user.id,
      body: parsed.data.body,
      attachments: parsed.data.attachments,
      reply_to_id: parsed.data.replyToId ?? null,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) return { error: error.message };
  revalidatePath("/messages");
  return { error: null };
}

/**
 * Marca como leídos los mensajes que el usuario acaba de ver.
 *
 * Alimenta las tildes de leído del emisor. Es idempotente por la PK compuesta
 * (message_id, user_id): reabrir la conversación no duplica filas.
 */
export async function markMessagesRead(messageIds: string[]) {
  const parsed = z.array(z.string().uuid()).max(300).safeParse(messageIds);
  if (!parsed.success || parsed.data.length === 0) return { error: null };

  const user = await getCurrentUser();
  if (!user) return { error: "not_authenticated" };
  const supabase = await createClient();

  // company_id se toma de cada mensaje: la política de lecturas lo exige.
  const { data: rows } = await supabase
    .from("chat_messages")
    .select("id, company_id, sender_id")
    .in("id", parsed.data);
  const own = (rows ?? []).filter((row) => row.sender_id !== user.id);
  if (!own.length) return { error: null };

  const { error } = await supabase.from("chat_message_reads").upsert(
    own.map((row) => ({ message_id: row.id, company_id: row.company_id, user_id: user.id })),
    { onConflict: "message_id,user_id", ignoreDuplicates: true },
  );
  return { error: error?.message ?? null };
}
