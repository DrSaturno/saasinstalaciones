"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { startTask, finishTask, addUpdate } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { OrderStatus } from "@/types/database";

type Props = {
  orderId: string;
  companyId: string;
  status: OrderStatus;
};

/** Sube las fotos elegidas al bucket evidence y devuelve sus paths. */
async function uploadPhotos(
  companyId: string,
  orderId: string,
  files: File[],
): Promise<string[]> {
  if (files.length === 0) return [];
  const supabase = createClient();
  const paths: string[] = [];
  for (const file of files) {
    // Path convención: company_id/order_id/archivo (ver policies evidence_*).
    const path = `${companyId}/${orderId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage
      .from("evidence")
      .upload(path, file, { upsert: false });
    if (error) throw new Error(`No se pudo subir ${file.name}: ${error.message}`);
    paths.push(path);
  }
  return paths;
}

export function TaskActions({ orderId, companyId, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const refresh = () => {
    setNote("");
    setFiles([]);
    router.refresh();
  };

  const start = () => {
    startTransition(async () => {
      const res = await startTask(orderId, crypto.randomUUID());
      if (res.error) toast.error(res.error);
      else {
        toast.success("Trabajo iniciado");
        refresh();
      }
    });
  };

  const saveProgress = (type: "progress" | "blocker") => {
    if (!note.trim() && files.length === 0) {
      toast.error("Escribí una nota o adjuntá una foto.");
      return;
    }
    startTransition(async () => {
      try {
        const photos = await uploadPhotos(companyId, orderId, files);
        const res = await addUpdate({
          orderId,
          updateId: crypto.randomUUID(),
          type,
          note: note.trim(),
          photos,
        });
        if (res.error) toast.error(res.error);
        else {
          toast.success(type === "blocker" ? "Bloqueo registrado" : "Avance registrado");
          refresh();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al subir fotos");
      }
    });
  };

  const finish = () => {
    startTransition(async () => {
      try {
        const photos = await uploadPhotos(companyId, orderId, files);
        const res = await finishTask(orderId, crypto.randomUUID(), note.trim(), photos);
        if (res.error) toast.error(res.error);
        else {
          toast.success("Enviado a revisión");
          refresh();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al subir fotos");
      }
    });
  };

  // planificada → arrancar
  if (status === "planificada") {
    return (
      <Button onClick={start} disabled={pending} className="w-full" size="lg">
        {pending ? "Iniciando…" : "Iniciar trabajo"}
      </Button>
    );
  }

  // en_proceso → cargar avances / terminar
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

  // en_revision → esperar aprobación
  if (status === "en_revision") {
    return (
      <p className="text-sm text-muted-foreground">
        Enviado a revisión. La empresa lo va a aprobar.
      </p>
    );
  }

  // pendiente/relevamiento (asignada pero no planificada) / cerradas
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
    <div>
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
    </div>
  );
}
