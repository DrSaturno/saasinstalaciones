import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchChatThreads } from "@/lib/data/messages";
import { Card, CardContent } from "@/components/ui/card";

export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user || !["company_manager", "coordinator", "installer"].includes(user.role)) redirect("/");
  const [t, format, supabase] = await Promise.all([getTranslations("Messages"), getFormatter(), createClient()]);
  const threads = await fetchChatThreads(supabase, user.role as "company_manager" | "coordinator" | "installer");
  return (
    <main className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">{t("title")}</h1><p className="mt-1 text-muted-foreground">{t("description")}</p>
      <div className="mt-8 space-y-2">
        {threads.map((thread) => (
          <Link key={thread.id} href={`/messages/${thread.peerId}?company=${thread.companyId}`}>
            <Card className="transition-colors hover:border-primary/40"><CardContent className="flex items-center justify-between gap-4 py-4"><span className="font-medium">{thread.peerName}</span><span className="font-mono text-xs text-muted-foreground">{format.relativeTime(new Date(thread.lastMessageAt))}</span></CardContent></Card>
          </Link>
        ))}
        {!threads.length ? <p className="py-12 text-center text-sm text-muted-foreground">{t("empty")}</p> : null}
      </div>
    </main>
  );
}
