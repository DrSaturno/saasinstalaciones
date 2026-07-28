import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  canOperateCompany,
  getCurrentUser,
  isInstallerArea,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchConversation } from "@/lib/data/messages";
import { ChatPanel } from "@/components/messages/chat-panel";

export default async function ConversationPage({ params, searchParams }: { params: Promise<{ installerId: string }>; searchParams: Promise<{ company?: string }> }) {
  const [{ installerId }, query, user] = await Promise.all([params, searchParams, getCurrentUser()]);
  if (
    !user ||
    (user.role !== "company_manager" && !isInstallerArea(user))
  ) {
    redirect("/");
  }

  const companyId =
    query.company ??
    (user.role === "company_manager" ? user.companyId ?? undefined : undefined);
  if (!companyId) notFound();

  const operatorMode = canOperateCompany(user, companyId);
  if (!operatorMode && installerId !== user.id) notFound();

  const [t, supabase] = await Promise.all([getTranslations("Messages"), createClient()]);
  const conversation = await fetchConversation(supabase, installerId, companyId);
  if (!conversation) notFound();
  return (
    <main className="mx-auto w-full max-w-5xl">
      <Link href="/messages" className="text-sm text-muted-foreground hover:text-foreground">{t("back")}</Link>
      <h1 className="mb-5 mt-3 text-2xl font-bold">{operatorMode ? conversation.installerName : t("companyChannel")}</h1>
      <ChatPanel threadId={conversation.thread.id} companyId={conversation.thread.company_id} currentUserId={user.id} installerMode={!operatorMode} initialMessages={conversation.messages} peerName={operatorMode ? conversation.installerName : t("companyChannel")} />
    </main>
  );
}
