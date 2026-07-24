import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

export type ChatThreadSummary = {
  id: string;
  companyId: string;
  peerId: string;
  peerName: string;
  lastMessageAt: string;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  companyId: string;
  senderId: string;
  body: string;
  attachments: Json;
  replyToId: string | null;
  createdAt: string;
};

export async function fetchChatThreads(
  supabase: SupabaseClient<Database>,
  role: "company_manager" | "coordinator" | "installer",
): Promise<ChatThreadSummary[]> {
  const { data: threads } = await supabase
    .from("chat_threads")
    .select("id, company_id, installer_id, last_message_at")
    .order("last_message_at", { ascending: false });
  if (!threads?.length) return [];
  if (role === "installer") {
    const ids = [...new Set(threads.map((thread) => thread.company_id))];
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name")
      .in("id", ids);
    const names = new Map((companies ?? []).map((company) => [company.id, company.name]));
    return threads.map((thread) => ({
      id: thread.id,
      companyId: thread.company_id,
      peerId: thread.installer_id,
      peerName: names.get(thread.company_id) ?? "",
      lastMessageAt: thread.last_message_at,
    }));
  }
  const ids = [...new Set(threads.map((thread) => thread.installer_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  return threads.map((thread) => ({
    id: thread.id,
    companyId: thread.company_id,
    peerId: thread.installer_id,
    peerName: names.get(thread.installer_id) ?? "",
    lastMessageAt: thread.last_message_at,
  }));
}

export async function fetchConversation(
  supabase: SupabaseClient<Database>,
  installerId: string,
  companyId?: string,
) {
  let query = supabase
    .from("chat_threads")
    .select("id, company_id, installer_id")
    .eq("installer_id", installerId);
  if (companyId) query = query.eq("company_id", companyId);
  const { data: thread } = await query.limit(1).maybeSingle();
  if (!thread) return null;
  const [{ data: profile }, { data: messages }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", installerId).maybeSingle(),
    supabase
      .from("chat_messages")
      .select("id, thread_id, company_id, sender_id, body, attachments, reply_to_id, created_at")
      .eq("thread_id", thread.id)
      .order("created_at")
      .limit(300),
  ]);
  return {
    thread,
    installerName: profile?.full_name ?? "",
    messages: (messages ?? []).map((message): ChatMessage => ({
      id: message.id,
      threadId: message.thread_id,
      companyId: message.company_id,
      senderId: message.sender_id,
      body: message.body,
      attachments: message.attachments,
      replyToId: message.reply_to_id,
      createdAt: message.created_at,
    })),
  };
}
