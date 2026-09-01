"use client";

import { useRef, useState, useTransition } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { postOrderMessage } from "@/lib/actions/orders/evidence";
import { registerOrderAttachments } from "@/lib/actions/orders/intake";
import {
  isAcceptedOrderFile,
  MAX_ORDER_ATTACHMENTS,
  type OrderAttachmentRegistration,
} from "@/lib/domain/order-intake";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function safeExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  const cleaned = fromName.replace(/[^a-z0-9]/g, "").slice(0, 10);
  if (cleaned) return cleaned;
  if (file.type === "application/pdf") return "pdf";
  return file.type.split("/")[1]?.replace(/[^a-z0-9]/g, "").slice(0, 10) || "file";
}

/**
 * Texto libre + adjunto opcional en el espacio de evidencia de una orden.
 *
 * Adjuntar sube directo al bucket `evidence` (mismo mecanismo que ya usa
 * `create-order-dialog.tsx` al crear una orden) y registra la fila en
 * `order_attachments` — el texto es una fila aparte en `order_updates`. Se
 * puede mandar sólo texto, sólo un adjunto, o los dos juntos.
 */
export function OrderEvidenceCompose({
  orderId,
  companyId,
}: {
  orderId: string;
  companyId: string;
}) {
  const t = useTranslations("OrderEvidence");
  const filesT = useTranslations("CreateOrder");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const accepted = incoming.filter(isAcceptedOrderFile);
    const rejected = incoming.length - accepted.length;
    if (rejected > 0) toast.error(filesT("files.invalid", { count: rejected }));
    setFiles((current) => {
      const room = Math.max(0, MAX_ORDER_ATTACHMENTS - current.length);
      if (accepted.length > room) toast.error(filesT("files.limit", { count: MAX_ORDER_ATTACHMENTS }));
      return [...current, ...accepted.slice(0, room)];
    });
    if (inputRef.current) inputRef.current.value = "";
  };

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed && files.length === 0) return;

    startTransition(async () => {
      const supabase = createClient();

      if (files.length > 0) {
        const uploaded = await Promise.all(
          files.map(async (file): Promise<OrderAttachmentRegistration | null> => {
            const storagePath = `${companyId}/${orderId}/evidence-${crypto.randomUUID()}.${safeExtension(file)}`;
            const { error } = await supabase.storage.from("evidence").upload(storagePath, file, {
              cacheControl: "3600",
              contentType: file.type,
              upsert: false,
            });
            if (error) return null;
            return { storagePath, fileName: file.name, mimeType: file.type, sizeBytes: file.size };
          }),
        );
        const registrations = uploaded.filter((item): item is OrderAttachmentRegistration => item !== null);
        if (registrations.length < files.length) toast.error(t("attachError"));
        if (registrations.length > 0) {
          const result = await registerOrderAttachments(orderId, registrations);
          if (result.error) {
            await supabase.storage.from("evidence").remove(registrations.map((item) => item.storagePath));
            toast.error(t("attachError"));
          }
        }
      }

      if (trimmed) {
        const result = await postOrderMessage({ orderId, body: trimmed });
        if (result.error) {
          toast.error(t("sendError"));
          return;
        }
      }

      setBody("");
      setFiles([]);
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border bg-card p-3">
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={t("composePlaceholder")}
        rows={2}
        maxLength={4_000}
        disabled={pending}
        className="resize-none border-0 p-0 shadow-none focus-visible:ring-0"
      />

      {files.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {files.map((file, index) => (
            <span
              key={`${file.name}-${index}`}
              className="flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-xs"
            >
              {file.name}
              <button
                type="button"
                onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                disabled={pending}
                aria-label={t("removeAttachment", { name: file.name })}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={(event) => addFiles(event.target.files)}
          disabled={pending}
          className="hidden"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
        >
          <Paperclip className="size-3.5" aria-hidden="true" />
          {t("composeAttach")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={pending || (!body.trim() && files.length === 0)}
        >
          <Send className="size-3.5" aria-hidden="true" />
          {pending ? t("composeSending") : t("composeSend")}
        </Button>
      </div>
    </div>
  );
}
