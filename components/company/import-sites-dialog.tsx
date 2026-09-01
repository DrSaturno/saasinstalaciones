"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { analyzeSiteImport, importSitesFile } from "@/lib/actions/projects/import";
import type { ImportPreflight, ImportResult } from "@/lib/actions/projects/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Fila del resumen de conteos. `tone` resalta la que exige atención. */
function CountRow({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: number;
  tone?: "normal" | "warning";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`font-mono text-lg ${tone === "warning" ? "text-warning" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

export function ImportSitesDialog({ projectId }: { projectId: string }) {
  const t = useTranslations("ImportSites");
  const common = useTranslations("Common");
  const [open, setOpen] = useState(false);
  // El archivo se conserva para volver a mandarlo al confirmar: el servidor
  // reparsea el original en vez de confiar en filas armadas por el navegador.
  const [file, setFile] = useState<File | null>(null);
  const [preflight, setPreflight] = useState<ImportPreflight | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  // Dos transiciones separadas y no una compartida: analizar e importar son
  // pasos distintos de la pantalla. Con una sola, el botón de confirmar
  // mostraba «Importando…» mientras todavía corría el ANÁLISIS —anunciando
  // algo que no estaba pasando— y quedaba deshabilitado por un estado que no
  // era el suyo. En CI ese flag se trabó y dejó el botón muerto: la revisión
  // en pantalla con las filas correctas y nada que se pudiera tocar.
  const [analyzing, startAnalyze] = useTransition();
  const [importing, startImport] = useTransition();
  const router = useRouter();

  const analyze = (selected: File) => {
    const formData = new FormData();
    formData.set("file", selected);
    startAnalyze(async () => {
      const res = await analyzeSiteImport(projectId, formData);
      if (res.error) {
        toast.error(res.error);
        setPreflight(null);
        setFile(null);
        return;
      }
      setFile(selected);
      setPreflight(res);
    });
  };

  const confirm = () => {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    startImport(async () => {
      const res = await importSitesFile(projectId, formData);
      setResult(res);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(t("imported", { count: res.inserted }));
        router.refresh();
      }
    });
  };

  const reset = () => {
    setFile(null);
    setPreflight(null);
    setResult(null);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const issues = preflight?.issues ?? result?.skipped ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {preflight && !result ? t("reviewTitle") : t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {result && !result.error ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="font-mono text-2xl">{result.inserted}</p>
              <p className="text-sm text-muted-foreground">{t("importedLabel")}</p>
              {result.skipped.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium">
                    {t("skipped", { count: result.skipped.length })}
                  </p>
                  <ul className="mt-1 max-h-32 overflow-auto text-xs text-muted-foreground">
                    {result.skipped.slice(0, 20).map((s) => (
                      <li key={s.row}>{t("row", { row: s.row, reason: s.reason })}</li>
                    ))}
                    {result.skipped.length > 20 && (
                      <li>{t("more", { count: result.skipped.length - 20 })}</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
            {result.importId && (
              // El detalle por fila no entra en pantalla cuando la planilla
              // tiene miles: el resumen queda acá y el detalle se baja.
              <Button variant="outline" asChild>
                <a
                  href={`/api/projects/${projectId}/imports/${result.importId}/report`}
                  download
                >
                  {t("downloadReport")}
                </a>
              </Button>
            )}
            <Button onClick={close}>{common("done")}</Button>
          </div>
        ) : preflight ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border bg-muted/40 p-4">
              <CountRow label={t("expected")} value={preflight.expected} />
              <CountRow label={t("found")} value={preflight.found} />
              <CountRow label={t("willImport")} value={preflight.valid} />
              {preflight.difference !== 0 && (
                <CountRow
                  label={t("difference")}
                  value={Math.abs(preflight.difference)}
                  tone="warning"
                />
              )}
            </div>

            {/* El aviso de cantidad es el control que pide la operación: una
                carga a la que le faltan sucursales no debe darse por cerrada. */}
            {preflight.difference > 0 ? (
              <p className="text-sm text-warning">
                {t("differenceWarning", { count: preflight.difference })}
              </p>
            ) : preflight.difference < 0 ? (
              <p className="text-sm text-warning">
                {t("differenceExtra", { count: -preflight.difference })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("matches")}</p>
            )}

            {(preflight.incomplete > 0 ||
              preflight.outsideZone > 0 ||
              preflight.duplicated > 0) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {preflight.incomplete > 0 && (
                  <span>{t("incomplete", { count: preflight.incomplete })}</span>
                )}
                {preflight.outsideZone > 0 && (
                  <span>{t("outsideZone", { count: preflight.outsideZone })}</span>
                )}
                {preflight.duplicated > 0 && (
                  <span>{t("duplicated", { count: preflight.duplicated })}</span>
                )}
              </div>
            )}

            {issues.length > 0 && (
              <ul className="max-h-32 overflow-auto text-xs text-muted-foreground">
                {issues.slice(0, 20).map((s) => (
                  <li key={s.row}>{t("row", { row: s.row, reason: s.reason })}</li>
                ))}
                {issues.length > 20 && (
                  <li>{t("more", { count: issues.length - 20 })}</li>
                )}
              </ul>
            )}

            {preflight.valid === 0 ? (
              <p className="text-sm text-destructive">{t("nothingToImport")}</p>
            ) : (
              <Button type="button" onClick={confirm} disabled={importing}>
                {importing
                  ? t("importing")
                  : t("confirm", { count: preflight.valid })}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={reset}
              disabled={importing}
            >
              {t("back")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="csv">{t("file")}</Label>
              <Input
                id="csv"
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                disabled={analyzing}
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) analyze(selected);
                }}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{t("recognized")}</p>
              <p className="mt-1 font-mono">{t("columns")}</p>
              <p className="mt-2">{t("variants")}</p>
            </div>
            <Button type="button" variant="outline" asChild>
              <a href="/api/site-template" download>
                {t("downloadTemplate")}
              </a>
            </Button>
            {analyzing && (
              <p className="text-sm text-muted-foreground">{t("analyzing")}</p>
            )}
            {result?.error && (
              <p className="text-sm text-destructive">{result.error}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
