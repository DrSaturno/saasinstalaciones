import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { canOperateCompany, type CurrentUser } from "@/lib/auth";
import type { Database, Json } from "@/types/database";
import { throwIfDataError } from "@/lib/data/errors";

export type ChatThreadSummary = {
  id: string;
  companyId: string;
  peerId: string;
  peerName: string;
  lastMessageAt: string;
};

export type ChatMessage = {
  /** Ids de quienes ya lo leyeron (excluye al autor). */
  readBy?: string[];
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
  user: CurrentUser,
): Promise<ChatThreadSummary[]> {
  const { data: threads, error: threadsError } = await supabase
    .from("chat_threads")
    .select("id, company_id, installer_id, last_message_at")
    .order("last_message_at", { ascending: false });
  throwIfDataError("messages.threads", threadsError);
  if (!threads?.length) return [];

  const visibleThreads = threads.filter(
    (thread) =>
      canOperateCompany(user, thread.company_id) ||
      thread.installer_id === user.id,
  );
  const companyIds = [
    ...new Set(
      visibleThreads
        .filter((thread) => !canOperateCompany(user, thread.company_id))
        .map((thread) => thread.company_id),
    ),
  ];
  const installerIds = [
    ...new Set(
      visibleThreads
        .filter((thread) => canOperateCompany(user, thread.company_id))
        .map((thread) => thread.installer_id),
    ),
  ];

  const [companiesResult, profilesResult] = await Promise.all([
    companyIds.length
      ? supabase.from("companies").select("id, name").in("id", companyIds)
      : Promise.resolve({ data: [], error: null }),
    installerIds.length
      ? supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", installerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  throwIfDataError("messages.companies", companiesResult.error);
  throwIfDataError("messages.profiles", profilesResult.error);
  const companies = companiesResult.data;
  const profiles = profilesResult.data;
  const companyNames = new Map(
    (companies ?? []).map((company) => [company.id, company.name]),
  );
  const installerNames = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.full_name]),
  );

  return visibleThreads.map((thread) => {
    const operatorMode = canOperateCompany(user, thread.company_id);
    return {
      id: thread.id,
      companyId: thread.company_id,
      peerId: thread.installer_id,
      peerName: operatorMode
        ? (installerNames.get(thread.installer_id) ?? "")
        : (companyNames.get(thread.company_id) ?? ""),
      lastMessageAt: thread.last_message_at,
    };
  });
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
  const { data: thread, error: threadError } = await query.limit(1).maybeSingle();
  throwIfDataError("messages.conversation_thread", threadError);
  if (!thread) return null;
  const [profileResult, messagesResult] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", installerId).maybeSingle(),
    supabase
      .from("chat_messages")
      .select("id, thread_id, company_id, sender_id, body, attachments, reply_to_id, created_at")
      .eq("thread_id", thread.id)
      .order("created_at")
      .limit(300),
  ]);
  throwIfDataError("messages.conversation_profile", profileResult.error);
  throwIfDataError("messages.conversation_items", messagesResult.error);
  const profile = profileResult.data;
  const messages = messagesResult.data;
  // Quién leyó qué: alimenta las tildes de entregado/leído.
  const ids = (messages ?? []).map((message) => message.id);
  const { data: reads, error: readsError } = ids.length
    ? await supabase.from("chat_message_reads").select("message_id, user_id").in("message_id", ids)
    : { data: [], error: null };
  throwIfDataError("messages.read_receipts", readsError);
  const readers = new Map<string, string[]>();
  for (const row of reads ?? []) {
    readers.set(row.message_id, [...(readers.get(row.message_id) ?? []), row.user_id]);
  }
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
      readBy: readers.get(message.id) ?? [],
    })),
  };
}
