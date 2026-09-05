"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, CheckCheck, Paperclip, Reply, Search, Send, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { markMessagesRead, sendCompanyMessage } from "@/lib/actions/messages";
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
  peerName = "",
}: {
  threadId: string;
  companyId: string;
  currentUserId: string;
  installerMode: boolean;
  initialMessages: ChatMessage[];
  peerName?: string;
}) {
  const t = useTranslations("Messages");
  const format = useFormatter();
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  // Realtime: mensajes nuevos + presencia (en línea / escribiendo).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-${threadId}`, { config: { presence: { key: currentUserId } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as DatabaseRow;
          setMessages((current) =>
            current.some((item) => item.id === row.id) ? current : [...current, shape(row)],
          );
        },
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ typing?: boolean }>();
        const others = Object.entries(state).filter(([key]) => key !== currentUserId);
        setPeerOnline(others.length > 0);
        setPeerTyping(others.some(([, metas]) => metas.some((meta) => meta.typing)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ typing: false });
      });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [threadId, currentUserId]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  // Marcar como leídos los ajenos que todavía no lo estaban.
  useEffect(() => {
    const unread = messages
      .filter((message) => message.senderId !== currentUserId)
      .filter((message) => !(message.readBy ?? []).includes(currentUserId))
      .map((message) => message.id);
    if (unread.length) void markMessagesRead(unread);
  }, [messages, currentUserId]);

  // Miniaturas de las imágenes adjuntas (URL firmada, vencen solas).
  useEffect(() => {
    const paths = messages
      .flatMap((message) => (Array.isArray(message.attachments) ? message.attachments : []))
      .filter(isAttachment)
      .filter((file) => file.mimeType.startsWith("image/"))
      .map((file) => file.path)
      .filter((path) => !previews[path]);
    if (!paths.length) return;
    void createClient()
      .storage.from("chat")
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        if (!data) return;
        setPreviews((current) => {
          const next = { ...current };
          for (const item of data) if (item.path && item.signedUrl) next[item.path] = item.signedUrl;
          return next;
        });
      });
  }, [messages, previews]);

  const announceTyping = () => {
    const channel = channelRef.current;
    if (!channel) return;
    void channel.track({ typing: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => void channel.track({ typing: false }), 2500);
  };

  const upload = async (): Promise<Attachment[]> => {
    if (!files.length) return [];
    if (!navigator.onLine) throw new Error(t("attachmentsNeedConnection"));
    const supabase = createClient();
    return Promise.all(
      files.map(async (file) => {
        const path = `${companyId}/${threadId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error } = await supabase.storage.from("chat").upload(path, file);
        if (error) throw error;
        return { path, name: file.name, mimeType: file.type || "application/octet-stream" };
      }),
    );
  };

  const send = () => {
    if (!body.trim() && !files.length) return;
    const quoted = replyTo;
    startTransition(async () => {
      try {
        const attachments = await upload();
        const id = crypto.randomUUID();
        const optimistic: ChatMessage = {
          id,
          threadId,
          companyId,
          senderId: currentUserId,
          body: body.trim(),
          attachments,
          replyToId: quoted?.id ?? null,
          createdAt: new Date().toISOString(),
          readBy: [],
        };
        setMessages((current) => [...current, optimistic]);
        setBody("");
        setFiles([]);
        setReplyTo(null);
        if (installerMode) {
          await enqueue({
            id,
            kind: "chat",
            threadId,
            messageId: id,
            companyId,
            body: optimistic.body,
            attachments,
            replyToId: quoted?.id ?? null,
          });
          notifyQueued();
        } else {
          const result = await sendCompanyMessage({
            id,
            threadId,
            body: optimistic.body,
            attachments,
            replyToId: quoted?.id ?? null,
          });
          if (result.error) throw new Error(result.error);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("sendFailed"));
      }
    });
  };

  const openAttachment = async (path: string) => {
    const { data, error } = await createClient().storage.from("chat").createSignedUrl(path, 120);
    if (error) toast.error(error.message);
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? messages.filter((message) => message.body.toLowerCase().includes(term)) : messages;
  }, [messages, search]);

  return (
    <div className="flex min-h-[65svh] flex-col overflow-hidden rounded-2xl border bg-card shadow-premium">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={peerName} />
          <div className="min-w-0">
            <p className="truncate font-medium">{peerName || t("conversation")}</p>
            <p className="text-caption text-muted-foreground">
              {peerTyping ? t("typing") : peerOnline ? t("online") : t("offline")}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => setSearchOpen((open) => !open)} aria-label={t("search")}>
          <Search className="size-4" />
        </Button>
      </header>

      {searchOpen ? (
        <div className="border-b p-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            autoFocus
          />
          {search.trim() ? (
            <p className="mt-1 px-1 text-caption text-muted-foreground">
              {t("searchResults", { count: visible.length })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex-1 space-y-1 overflow-y-auto bg-muted/25 p-4 sm:p-6">
        {visible.map((message, index) => {
          const own = message.senderId === currentUserId;
          const attachments = Array.isArray(message.attachments)
            ? message.attachments.filter(isAttachment)
            : [];
          const previousDay = index > 0 ? dayKey(visible[index - 1].createdAt) : null;
          const showDay = dayKey(message.createdAt) !== previousDay;
          const quoted = message.replyToId ? byId.get(message.replyToId) : null;
          const read = (message.readBy ?? []).length > 0;

          return (
            <div key={message.id}>
              {showDay ? (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-card px-3 py-1 text-caption text-muted-foreground shadow-sm">
                    {format.dateTime(new Date(message.createdAt), { dateStyle: "medium" })}
                  </span>
                </div>
              ) : null}
              <div className={cn("group flex items-end gap-2", own ? "justify-end" : "justify-start")}>
                {!own ? <Avatar name={peerName} size="sm" /> : null}
                <div
                  className={cn(
                    "relative max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                    own
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-card",
                  )}
                >
                  {quoted ? (
                    <div
                      className={cn(
                        "mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs",
                        own
                          ? "border-primary-foreground/50 bg-primary-foreground/10"
                          : "border-primary/50 bg-muted",
                      )}
                    >
                      <p className="line-clamp-2 opacity-80">
                        {quoted.body || t("attachment")}
                      </p>
                    </div>
                  ) : null}
                  {message.body ? <p className="whitespace-pre-wrap">{message.body}</p> : null}
                  {attachments.map((file) =>
                    file.mimeType.startsWith("image/") && previews[file.path] ? (
                      <button
                        key={file.path}
                        type="button"
                        onClick={() => openAttachment(file.path)}
                        className="mt-1.5 block overflow-hidden rounded-lg"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previews[file.path]}
                          alt={file.name}
                          className="max-h-56 w-auto max-w-full object-cover"
                        />
                      </button>
                    ) : (
                      <button
                        key={file.path}
                        type="button"
                        onClick={() => openAttachment(file.path)}
                        className="mt-1 flex items-center gap-1 underline underline-offset-2"
                      >
                        <Paperclip className="size-3" />
                        {file.name}
                      </button>
                    ),
                  )}
                  <div className="mt-1 flex items-center justify-end gap-1">
                    <span className="font-mono text-caption opacity-65">
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {own ? (
                      read ? (
                        <CheckCheck className="size-3 opacity-90" aria-label={t("read")} />
                      ) : (
                        <Check className="size-3 opacity-65" aria-label={t("sent")} />
                      )
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(message)}
                  aria-label={t("reply")}
                  className="mb-1 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  <Reply className="size-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <div className="border-t p-3">
        {replyTo ? (
          <div className="mb-2 flex items-start justify-between gap-2 rounded-lg border-l-2 border-primary bg-muted px-2 py-1.5">
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {replyTo.body || t("attachment")}
            </p>
            <button type="button" onClick={() => setReplyTo(null)} aria-label={t("cancelReply")}>
              <X className="size-3.5 text-muted-foreground" />
            </button>
          </div>
        ) : null}
        {files.length ? (
          <p className="mb-2 text-xs text-muted-foreground">
            {files.map((file) => file.name).join(" · ")}
          </p>
        ) : null}
        <div className="flex gap-2">
          <label className="flex size-9 cursor-pointer items-center justify-center rounded-lg border">
            <Paperclip className="size-4" />
            <input
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 5))}
            />
          </label>
          <Input
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              announceTyping();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={t("placeholder")}
            disabled={pending}
          />
          <Button size="icon" onClick={send} disabled={pending} aria-label={t("send")}>
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-medium text-primary",
        size === "sm" ? "size-6 text-caption" : "size-9 text-xs",
      )}
    >
      {initials || "·"}
    </span>
  );
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

type DatabaseRow = {
  id: string;
  thread_id: string;
  company_id: string;
  sender_id: string;
  body: string;
  attachments: import("@/types/database").Json;
  reply_to_id: string | null;
  created_at: string;
};
function shape(row: DatabaseRow): ChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    companyId: row.company_id,
    senderId: row.sender_id,
    body: row.body,
    attachments: row.attachments,
    replyToId: row.reply_to_id,
    createdAt: row.created_at,
    readBy: [],
  };
}
function isAttachment(
  value: import("@/types/database").Json,
): value is { path: string; name: string; mimeType: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.path === "string" &&
    typeof value.name === "string" &&
    typeof value.mimeType === "string"
  );
}
