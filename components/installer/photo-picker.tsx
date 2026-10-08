"use client";

import { Camera, Images } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Dos entradas para las fotos del instalador: cámara y galería.
 *
 * Con un solo `<input capture>` el celular abre directo la cámara (o, en
 * Android, ofrece "cámara / archivos" sin galería), y quien carga las fotos
 * después del trabajo no puede elegirlas. El input sin `capture` abre el
 * selector nativo con la galería. Lo elegido se SUMA a lo que ya había, para
 * poder mezclar una foto recién sacada con otras de la galería.
 */
export function PhotoPicker({
  files,
  onChange,
  disabled,
  compact = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled: boolean;
  /** Variante chica para la barra del compositor de mensajes. */
  compact?: boolean;
}) {
  const t = useTranslations("PhotoPicker");
  const add = (list: FileList | null) => {
    if (list && list.length > 0) onChange([...files, ...list]);
  };

  const option = compact
    ? "flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    : "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-input py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40";

  return (
    <div className={compact ? "flex items-center gap-1" : "flex flex-col gap-1.5"}>
      <div className={compact ? "flex items-center gap-1" : "flex gap-2"}>
        <label className={option}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={disabled}
            className="hidden"
            onChange={(event) => {
              add(event.target.files);
              event.target.value = "";
            }}
          />
          <Camera className="size-4" aria-hidden="true" />
          {t("camera")}
        </label>
        <label className={option}>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={disabled}
            className="hidden"
            onChange={(event) => {
              add(event.target.files);
              event.target.value = "";
            }}
          />
          <Images className="size-4" aria-hidden="true" />
          {t("gallery")}
        </label>
      </div>
      {files.length > 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t("ready", { count: files.length })}</span>
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            disabled={disabled}
            onClick={() => onChange([])}
          >
            {t("clear")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
