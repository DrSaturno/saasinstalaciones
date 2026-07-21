"use client";

import { useRef, useState } from "react";
import { FileImage, FileText, UploadCloud, X } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
  files: File[];
  disabled?: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
};

function formatFileSize(bytes: number) {
  if (bytes < 1_024 * 1_024) return `${Math.ceil(bytes / 1_024)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

export function OrderFilesField({ files, disabled, onAdd, onRemove }: Props) {
  const t = useTranslations("CreateOrder");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const receive = (list: FileList | null) => {
    if (!list || disabled) return;
    onAdd(Array.from(list));
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          receive(event.dataTransfer.files);
        }}
        className={`group flex min-h-32 w-full flex-col items-center justify-center rounded-xl border border-dashed px-5 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
          dragging
            ? "border-primary bg-primary-soft/35"
            : "border-primary/30 bg-primary-soft/15 hover:border-primary/60 hover:bg-primary-soft/30"
        }`}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-background text-primary ring-1 ring-primary/15 transition-transform group-hover:-translate-y-0.5">
          <UploadCloud className="size-5" aria-hidden="true" />
        </span>
        <span className="mt-3 text-sm font-medium">{t("files.drop")}</span>
        <span className="mt-1 text-xs text-muted-foreground">
          {t("files.help")}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.pdf,application/pdf"
        className="sr-only"
        onChange={(event) => receive(event.target.files)}
      />

      {files.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.lastModified}-${index}`}
              className="flex min-w-0 items-center gap-3 rounded-lg border bg-background px-3 py-2"
            >
              {file.type.startsWith("image/") ? (
                <FileImage className="size-4 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{file.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {formatFileSize(file.size)}
                </span>
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(index)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("files.remove", { name: file.name })}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

