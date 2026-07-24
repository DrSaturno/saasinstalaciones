import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchConversation } from "@/lib/data/messages";
import { ChatPanel } from "@/components/messages/chat-panel";

export default async function ConversationPage({ params, searchParams }: { params: Promise<{ installerId: string }>; searchParams: Promise<{ company?: string }> }) {
  const [{ installerId }, query, user] = await Promise.all([params, searchParams, getCurrentUser()]);
  if (!user || !["company_manager", "coordinator", "installer"].includes(user.role)) redirect("/");
  if (user.role === "installer" && installerId !== user.id) notFound();
  const [t, supabase] = await Promise.all([getTranslations("Messages"), createClient()]);
  const conversation = await fetchConversation(supabase, installerId, user.role === "installer" ? query.company : user.companyId ?? undefined);
  if (!conversation) notFound();
  return (
    <main className="mx-auto max-w-4xl">
      <Link href="/messages" className="text-sm text-muted-foreground hover:text-foreground">{t("back")}</Link>
      <h1 className="mb-5 mt-3 text-2xl font-bold">{user.role === "installer" ? t("companyChannel") : conversation.installerName}</h1>
      <ChatPanel threadId={conversation.thread.id} companyId={conversation.thread.company_id} currentUserId={user.id} installerMode={user.role === "installer"} initialMessages={conversation.messages} />
    </main>
  );
}
