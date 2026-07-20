"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { enqueue } from "@/lib/offline/sync";
import { notifyQueued } from "@/lib/offline/use-sync";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { OrderStatus } from "@/types/database";
import type { PendingPhoto } from "@/lib/offline/db";

type Props = {
  orderId: string;
  companyId: string;
  status: OrderStatus;
};

function makePhotos(companyId: string, orderId: string, files: File[]): PendingPhoto[] {
  return files.map((file) => ({
    id: crypto.randomUUID(),
    orderId,
    companyId,
    fileName: file.name,
    blob: file,
  }));
}

export function TaskActions({ orderId, companyId, status: initialStatus }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const online = () => typeof navigator !== "undefined" && navigator.onLine;

  const done = (msg: string) => {
    setNote("");
    setFiles([]);
    notifyQueued();
    toast.success(online() ? msg : `${msg} · se enviará al recuperar señal`);
    // Online: refrescamos para traer el historial real. Offline: no-op (la UI
    // ya se movió de forma optimista con setStatus).
    if (online()) setTimeout(() => router.refresh(), 400);
  };

  const start = () => {
    startTransition(async () => {
      await enqueue({
        id: crypto.randomUUID(),
        kind: "update",
        orderId,
        companyId,
        updateType: "checkin",
        note: "Trabajo iniciado",
      });
      await enqueue({
        id: crypto.randomUUID(),
        kind: "transition",
        orderId,
        toStatus: "en_proceso",
      });
      setStatus("en_proceso");
      done("Trabajo iniciado");
    });
  };

  const saveProgress = (type: "progress" | "blocker") => {
    if (!note.trim() && files.length === 0) {
      toast.error("Escribí una nota o adjuntá una foto.");
      return;
    }
    const photos = makePhotos(companyId, orderId, files);
    startTransition(async () => {
      await enqueue(
        {
          id: crypto.randomUUID(),
          kind: "update",
          orderId,
          companyId,
          updateType: type,
          note: note.trim(),
          photoIds: photos.map((p) => p.id),
        },
        photos,
      );
      done(type === "blocker" ? "Bloqueo registrado" : "Avance registrado");
    });
  };

  const finish = () => {
    const photos = makePhotos(companyId, orderId, files);
    startTransition(async () => {
      await enqueue(
        {
          id: crypto.randomUUID(),
          kind: "update",
          orderId,
          companyId,
          updateType: "done",
          note: note.trim() || "Trabajo terminado",
          photoIds: photos.map((p) => p.id),
        },
        photos,
      );
      await enqueue({
        id: crypto.randomUUID(),
        kind: "transition",
        orderId,
        toStatus: "en_revision",
      });
      setStatus("en_revision");
      done("Enviado a revisión");
    });
  };

  if (status === "planificada") {
    return (
      <Button onClick={start} disabled={pending} className="w-full" size="lg">
        {pending ? "Iniciando…" : "Iniciar trabajo"}
      </Button>
    );
  }

  if (status === "en_proceso") {
    return (
      <div className="flex flex-col gap-4">
        <Textarea
          placeholder="Contá cómo viene el trabajo…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
        <FilePicker files={files} onChange={setFiles} disabled={pending} />
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => saveProgress("progress")}
            disabled={pending}
            className="flex-1"
          >
            Guardar avance
          </Button>
          <Button
            variant="outline"
            onClick={() => saveProgress("blocker")}
            disabled={pending}
            className="flex-1"
          >
            Reportar bloqueo
          </Button>
        </div>
        <Button onClick={finish} disabled={pending} size="lg">
          {pending ? "Enviando…" : "Marcar terminado"}
        </Button>
      </div>
    );
  }

  if (status === "en_revision") {
    return (
      <p className="text-sm text-muted-foreground">
        Enviado a revisión. La empresa lo va a aprobar.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      {status === "finalizada"
        ? "Trabajo finalizado. ¡Gracias!"
        : "La empresa todavía no habilitó el inicio de este trabajo."}
    </p>
  );
}

function FilePicker({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-input py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        disabled={disabled}
        className="hidden"
        onChange={(e) => onChange([...(e.target.files ?? [])])}
      />
      {files.length > 0
        ? `${files.length} foto${files.length === 1 ? "" : "s"} lista${files.length === 1 ? "" : "s"}`
        : "Sacar o adjuntar fotos"}
    </label>
  );
}
