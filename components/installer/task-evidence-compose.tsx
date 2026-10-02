"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { enqueue } from "@/lib/offline/sync";
import { notifyQueued } from "@/lib/offline/use-sync";
import type { PendingPhoto } from "@/lib/offline/db";
import { PhotoPicker } from "@/components/installer/photo-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Mensaje del instalador en el espacio de evidencia de la orden.
 *
 * Va por la cola offline (Dexie), no por Server Action: se escribe parado en
 * el punto de instalación, muchas veces sin señal. Las fotos se guardan como
 * blob y las sube `flush()` al reconectar — a diferencia del chat general,
 * donde adjuntar exige conexión.
 *
 * El id lo genera el cliente porque el envío es idempotente por uuid: si la
 * cola reintenta, el `upsert` no duplica.
 */
export function TaskEvidenceCompose({
  orderId,
  companyId,
}: {
  orderId: string;
  companyId: string;
}) {
  const t = useTranslations("OrderEvidence");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed && files.length === 0) return;

    const photos: PendingPhoto[] = files.map((file) => ({
      id: crypto.randomUUID(),
      orderId,
      companyId,
      fileName: file.name,
      blob: file,
    }));

    startTransition(async () => {
      await enqueue(
        {
          id: crypto.randomUUID(),
          kind: "update",
          orderId,
          companyId,
          updateType: "message",
          note: trimmed,
          photoIds: photos.map((photo) => photo.id),
        },
        photos,
      );
      setBody("");
      setFiles([]);
      notifyQueued();

      const online = typeof navigator !== "undefined" && navigator.onLine;
      toast.success(online ? t("composeSent") : t("composeQueued"));
      // Offline no se refresca: el servidor todavía no sabe nada y la
      // recarga sólo mostraría la lista sin el mensaje recién escrito.
      if (online) setTimeout(() => router.refresh(), 400);
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

      <div className="mt-2 flex items-center justify-between gap-2">
        <PhotoPicker files={files} onChange={setFiles} disabled={pending} compact />

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
