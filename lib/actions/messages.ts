"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
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
}).refine((value) => value.body.length > 0 || value.attachments.length > 0);

export async function sendCompanyMessage(input: z.input<typeof schema>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Mensaje inválido" };
  const user = await getCurrentUser();
  if (
    !user?.companyId ||
    !["company_manager", "coordinator"].includes(user.role)
  ) return { error: "Acceso denegado" };
  const supabase = await createClient();
  const { error } = await supabase.from("chat_messages").upsert(
    {
      id: parsed.data.id,
      thread_id: parsed.data.threadId,
      company_id: user.companyId,
      sender_id: user.id,
      body: parsed.data.body,
      attachments: parsed.data.attachments,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) return { error: error.message };
  revalidatePath("/messages");
  return { error: null };
}
