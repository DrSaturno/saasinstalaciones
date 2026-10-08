"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { MessagesSquare, Send } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { sendOrderChatMessage } from "@/lib/actions/order-chat";
import type { OrderChatMessage } from "@/lib/data/order-chat";
import { CHAT_MESSAGE_MAX } from "@/lib/domain/messages";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type ChatRow = {
  id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
};

function shape(row: ChatRow): OrderChatMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at,
  };
}

/**
 * Chat grupal de una orden con equipo (bloque 5): un solo hilo para el
 * responsable, los ayudantes y quien opera la orden. Sólo texto. Los mensajes
 * nuevos llegan por Realtime, que respeta la RLS: cada integrante recibe sólo
 * los de las órdenes donde participa.
 */
export function OrderChatPanel({
  orderId,
  currentUserId,
  currentUserName,
  initialMessages,
}: {
  orderId: string;
  currentUserId: string;
  currentUserName: string;
  initialMessages: OrderChatMessage[];
}) {
  const t = useTranslations("OrderChat");
  const format = useFormatter();
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`order-chat-${orderId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_chat_messages", filter: `order_id=eq.${orderId}` },
        (payload) => {
          const row = shape(payload.new as ChatRow);
          setMessages((current) => (current.some((item) => item.id === row.id) ? current : [...current, row]));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId]);

  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages]);

  const send = () => {
    const text = body.trim();
    if (!text || pending) return;
    const id = crypto.randomUUID();
    const optimistic: OrderChatMessage = {
      id,
      senderId: currentUserId,
      senderName: currentUserName,
      body: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setBody("");
    startTransition(async () => {
      const result = await sendOrderChatMessage({ id, orderId, body: text });
      if (result.error) {
        setMessages((current) => current.filter((item) => item.id !== id));
        setBody(text);
        toast.error(result.error);
      }
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <Card id="chat-equipo">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <MessagesSquare className="size-4 text-primary" aria-hidden="true" />
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-4">
        <div ref={list} className="flex max-h-80 min-h-24 flex-col gap-2 overflow-y-auto pr-1" aria-live="polite">
          {messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            messages.map((message) => {
              const own = message.senderId === currentUserId;
              return (
                <div key={message.id} className={cn("flex flex-col gap-0.5", own ? "items-end" : "items-start")}>
                  <span className="text-caption text-muted-foreground">
                    {own ? t("you") : message.senderName || t("someone")}
                    {" · "}
                    {format.dateTime(new Date(message.createdAt), { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  <p
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
                      own ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    {message.body}
                  </p>
                </div>
              );
            })
          )}
        </div>
        <form onSubmit={submit} className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={CHAT_MESSAGE_MAX}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
          />
          <Button type="submit" size="icon" disabled={pending || body.trim().length === 0} aria-label={t("send")}>
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
