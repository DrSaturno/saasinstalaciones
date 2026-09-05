"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { enqueue, latestPendingTransition } from "@/lib/offline/sync";
import { notifyQueued } from "@/lib/offline/use-sync";
import { prepareOfflineStorageForUser } from "@/lib/offline/session-storage";
import { AcceptOrderButton } from "@/components/installer/accept-order-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { OrderStatus } from "@/types/database";
import type { PendingPhoto } from "@/lib/offline/db";
import { completionReadiness } from "@/lib/domain/field-flow";

type Props = {
  userId: string;
  orderId: string;
  companyId: string;
  status: OrderStatus;
  /** Null mientras el instalador no confirmó que se hace cargo. */
  acceptedAt: string | null;
  /** Fotos que la orden exige para poder cerrarse, y las que ya tiene. */
  minPhotos: number;
  photoCount: number;
};

/** Estados en los que la orden todavía no arrancó y confirmarla tiene sentido. */
const BEFORE_START: OrderStatus[] = ["pendiente", "relevamiento", "planificada"];

function makePhotos(companyId: string, orderId: string, files: File[]): PendingPhoto[] {
  return files.map((file) => ({
    id: crypto.randomUUID(),
    orderId,
    companyId,
    fileName: file.name,
    blob: file,
  }));
}

export function TaskActions({
  userId,
  orderId,
  companyId,
  status: initialStatus,
  acceptedAt,
  minPhotos,
  photoCount,
}: Props) {
  const t = useTranslations("TaskActions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    let active = true;
    const reconcile = () => {
      void (async () => {
        const ready = await prepareOfflineStorageForUser(userId);
        if (!active) return;
        if (!ready) {
          setStatus(initialStatus);
          return;
        }

        const queuedStatus = await latestPendingTransition(orderId);
        if (active) setStatus(queuedStatus ?? initialStatus);
      })();
    };

    reconcile();
    const onSyncSettled = () => {
      reconcile();
      router.refresh();
    };
    window.addEventListener("instalapro:sync-settled", onSyncSettled);
    return () => {
      active = false;
      window.removeEventListener("instalapro:sync-settled", onSyncSettled);
    };
  }, [initialStatus, orderId, router, userId]);

  const online = () => typeof navigator !== "undefined" && navigator.onLine;

  const done = (msg: string) => {
    setNote("");
    setFiles([]);
    notifyQueued();
    toast.success(online() ? msg : t("queued", { message: msg }));
    // Online: refrescamos para traer el historial real. Offline: no-op (la UI
    // ya se movió de forma optimista con setStatus).
    if (online()) setTimeout(() => router.refresh(), 400);
  };

  /**
   * Etapa 2: salgo hacia la locación.
   *
   * La única acción del flujo sin evidencia: se sale de un estacionamiento,
   * no de una obra. Un solo toque, que es lo que se puede pedir de alguien
   * que está por subirse a la camioneta.
   */
  const depart = () => {
    const updateId = crypto.randomUUID();
    startTransition(async () => {
      await enqueue({
        id: updateId,
        kind: "update",
        orderId,
        companyId,
        updateType: "travel",
        note: t("departedNote"),
        fromStatus: "planificada",
        toStatusTrace: "en_camino",
      });
      await enqueue({
        id: crypto.randomUUID(),
        kind: "transition",
        orderId,
        toStatus: "en_camino",
      });
      setStatus("en_camino");
      done(t("departed"));
    });
  };

  /**
   * Etapa 3: llegué.
   *
   * Las fotos del estado inicial son OPCIONALES (FLD-R3.2): exigir evidencia
   * para poder declarar que se llegó dejaría a alguien sin señal parado en la
   * puerta sin poder registrar nada. El mínimo obligatorio es al cerrar.
   */
  const arrive = () => {
    const photos = makePhotos(companyId, orderId, files);
    startTransition(async () => {
      await enqueue(
        {
          id: crypto.randomUUID(),
          kind: "update",
          orderId,
          companyId,
          updateType: "checkin",
          note: note.trim() || t("arrivedNote"),
          photoIds: photos.map((p) => p.id),
          // El origen se lee del estado actual y no se asume: a la llegada se
          // puede venir del traslado o directo desde `planificada`, cuando el
          // instalador ya estaba en el punto por otra orden.
          fromStatus: status,
          toStatusTrace: "en_sitio",
        },
        photos,
      );
      await enqueue({
        id: crypto.randomUUID(),
        kind: "transition",
        orderId,
        toStatus: "en_sitio",
      });
      setStatus("en_sitio");
      done(t("arrived"));
    });
  };

  /**
   * Etapa 4: empieza el trabajo.
   *
   * Hasta el punto 24 este botón hacía tres cosas —check-in, arranque y
   * transición— y era la única puerta al trabajo. Ahora es sólo el arranque:
   * la llegada tiene su propia etapa.
   */
  const start = () => {
    startTransition(async () => {
      await enqueue({
        id: crypto.randomUUID(),
        kind: "update",
        orderId,
        companyId,
        updateType: "checkin",
        note: t("startedNote"),
        fromStatus: status,
        toStatusTrace: "en_proceso",
      });
      await enqueue({
        id: crypto.randomUUID(),
        kind: "transition",
        orderId,
        toStatus: "en_proceso",
      });
      setStatus("en_proceso");
      done(t("started"));
    });
  };

  const saveProgress = (type: "progress" | "blocker") => {
    if (!note.trim() && files.length === 0) {
      toast.error(t("missingContent"));
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
      done(type === "blocker" ? t("blockerSaved") : t("progressSaved"));
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
          note: note.trim() || t("finishedNote"),
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
      done(t("sentReview"));
    });
  };

  // Aceptar va ANTES de mirar el estado puntual: una orden recién asignada
  // suele estar "pendiente" o "en relevamiento", no "planificada". Atarlo a un
  // solo estado dejaba sin botón justo el caso más común — entrar desde la
  // notificación a una orden que todavía no se confirmó.
  //
  // Es además precondición de arrancar, y la valida el trigger de la base: sin
  // este corte, "Iniciar" encolaba una transición condenada a fallar, con la
  // orden ya movida en pantalla y el ítem reintentando en silencio en la cola.
  //
  // Se limita a los estados PREVIOS al arranque a propósito: las órdenes que ya
  // estaban en proceso antes de que existiera la confirmación tienen el campo
  // vacío, y pedirles aceptar ahora las dejaría sin poder terminarse.
  if (!acceptedAt && BEFORE_START.includes(status)) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t("acceptFirst")}</p>
        <AcceptOrderButton orderId={orderId} />
      </div>
    );
  }

  // Una acción por etapa. La base acepta los atajos —se puede ir de
  // `planificada` derecho a `en_proceso`—, pero la pantalla es un teléfono al
  // sol y con guantes puestos: ofrecer las tres salidas posibles sería
  // técnicamente correcto y prácticamente un estorbo. La secuencia se guía.
  if (status === "planificada") {
    return (
      <Button onClick={depart} disabled={pending} className="w-full" size="lg">
        {pending ? t("departing") : t("depart")}
      </Button>
    );
  }

  if (status === "en_camino") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("arrivalPhotosHint")}</p>
        <Textarea
          placeholder={t("arrivalNotePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />
        <FilePicker files={files} onChange={setFiles} disabled={pending} />
        <Button onClick={arrive} disabled={pending} className="w-full" size="lg">
          {pending ? t("arriving") : t("arrive")}
        </Button>
      </div>
    );
  }

  if (status === "en_sitio") {
    return (
      <Button onClick={start} disabled={pending} className="w-full" size="lg">
        {pending ? t("starting") : t("start")}
      </Button>
    );
  }

  if (status === "en_proceso") {
    const readiness = completionReadiness(photoCount, minPhotos, files.length);
    return (
      <div className="flex flex-col gap-4">
        <Textarea
          placeholder={t("notePlaceholder")}
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
            {t("saveProgress")}
          </Button>
          <Button
            variant="outline"
            onClick={() => saveProgress("blocker")}
            disabled={pending}
            className="flex-1"
          >
            {t("reportBlocker")}
          </Button>
        </div>
        {/* El conteo se ve ANTES de apretar, y suma las fotos que están por
            adjuntarse en este mismo cierre. Un botón que se habilita cuando
            alcanza le dice a alguien qué hacer; un error después de apretar,
            sólo que se equivocó. */}
        <div className="flex flex-col gap-1">
          <Button onClick={finish} disabled={pending || !readiness.ready} size="lg">
            {pending ? t("sending") : t("markDone")}
          </Button>
          <p className={`text-xs ${readiness.ready ? "text-muted-foreground" : "text-[var(--warning)]"}`}>
            {readiness.ready
              ? t("photoProgress", { photos: readiness.photos, required: readiness.required })
              : t("missingPhotos", { missing: readiness.missing, required: readiness.required })}
          </p>
        </div>
      </div>
    );
  }

  if (status === "en_revision") {
    return (
      <p className="text-sm text-muted-foreground">
        {t("underReview")}
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      {status === "finalizada"
        ? t("completed")
        : t("notReady")}
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
  const t = useTranslations("TaskActions");
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
        ? t("photosReady", { count: files.length })
        : t("pickPhotos")}
    </label>
  );
}
