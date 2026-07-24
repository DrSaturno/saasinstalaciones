"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Paperclip, Send } from "lucide-react";
import { toast } from "sonner";
import { sendCompanyMessage } from "@/lib/actions/messages";
import type { ChatMessage } from "@/lib/data/messages";
import { enqueue } from "@/lib/offline/sync";
import { notifyQueued } from "@/lib/offline/use-sync";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Attachment = { path: string; name: string; mimeType: string };

export function ChatPanel({
  threadId,
  companyId,
  currentUserId,
  installerMode,
  initialMessages,
}: {
  threadId: string;
  companyId: string;
  currentUserId: string;
  installerMode: boolean;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` }, (payload) => {
        const row = payload.new as DatabaseRow;
        setMessages((current) => current.some((item) => item.id === row.id) ? current : [...current, shape(row)]);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [threadId]);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  const upload = async (): Promise<Attachment[]> => {
    if (!files.length) return [];
    if (!navigator.onLine) throw new Error("Los adjuntos necesitan conexión");
    const supabase = createClient();
    return Promise.all(files.map(async (file) => {
      const path = `${companyId}/${threadId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from("chat").upload(path, file);
      if (error) throw error;
      return { path, name: file.name, mimeType: file.type || "application/octet-stream" };
    }));
  };

  const send = () => {
    if (!body.trim() && !files.length) return;
    startTransition(async () => {
      try {
        const attachments = await upload();
        const id = crypto.randomUUID();
        const optimistic: ChatMessage = { id, threadId, companyId, senderId: currentUserId, body: body.trim(), attachments, replyToId: null, createdAt: new Date().toISOString() };
        setMessages((current) => [...current, optimistic]);
        setBody("");
        setFiles([]);
        if (installerMode) {
          await enqueue({ id, kind: "chat", threadId, messageId: id, companyId, body: optimistic.body, attachments });
          notifyQueued();
        } else {
          const result = await sendCompanyMessage({ id, threadId, body: optimistic.body, attachments });
          if (result.error) throw new Error(result.error);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo enviar");
      }
    });
  };

  const openAttachment = async (path: string) => {
    const { data, error } = await createClient().storage.from("chat").createSignedUrl(path, 120);
    if (error) toast.error(error.message);
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex min-h-[65svh] flex-col overflow-hidden rounded-2xl border bg-card">
      <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
        {messages.map((message) => {
          const own = message.senderId === currentUserId;
          const attachments = Array.isArray(message.attachments) ? message.attachments.filter(isAttachment) : [];
          return (
            <div key={message.id} className={cn("flex", own ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[82%] rounded-2xl px-4 py-3 text-sm", own ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {message.body ? <p className="whitespace-pre-wrap">{message.body}</p> : null}
                {attachments.map((file) => <button key={file.path} onClick={() => openAttachment(file.path)} className="mt-2 block underline underline-offset-2">{file.name}</button>)}
                <p className="mt-1 text-right font-mono text-[10px] opacity-65">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <div className="border-t p-3">
        {files.length ? <p className="mb-2 text-xs text-muted-foreground">{files.map((file) => file.name).join(" · ")}</p> : null}
        <div className="flex gap-2">
          <label className="flex size-9 cursor-pointer items-center justify-center rounded-lg border"><Paperclip className="size-4" /><input type="file" multiple className="sr-only" onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 5))} /></label>
          <Input value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="Escribí un mensaje…" disabled={pending} />
          <Button size="icon" onClick={send} disabled={pending}><Send className="size-4" /></Button>
        </div>
      </div>
    </div>
  );
}

type DatabaseRow = { id: string; thread_id: string; company_id: string; sender_id: string; body: string; attachments: import("@/types/database").Json; reply_to_id: string | null; created_at: string };
function shape(row: DatabaseRow): ChatMessage { return { id: row.id, threadId: row.thread_id, companyId: row.company_id, senderId: row.sender_id, body: row.body, attachments: row.attachments, replyToId: row.reply_to_id, createdAt: row.created_at }; }
function isAttachment(value: import("@/types/database").Json): value is { path: string; name: string; mimeType: string } { return typeof value === "object" && value !== null && !Array.isArray(value) && typeof value.path === "string" && typeof value.name === "string" && typeof value.mimeType === "string"; }
