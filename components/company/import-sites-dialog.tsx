"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { importSites, type ImportResult } from "@/lib/actions/projects";
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

export function ImportSitesDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      startTransition(async () => {
        const res = await importSites(projectId, text);
        setResult(res);
        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success(`${res.inserted} puntos importados`);
          router.refresh();
        }
      });
    };
    // UTF-8 cubre acentos y ñ; Excel suele exportar con BOM, ya lo limpiamos.
    reader.readAsText(file, "utf-8");
  };

  const close = () => {
    setOpen(false);
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button variant="outline">Importar puntos (CSV)</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar puntos de instalación</DialogTitle>
          <DialogDescription>
            Subí un CSV con los puntos. Se detecta el separador automáticamente
            (coma o punto y coma).
          </DialogDescription>
        </DialogHeader>

        {result && !result.error ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="font-mono text-2xl">{result.inserted}</p>
              <p className="text-sm text-muted-foreground">puntos importados</p>
              {result.skipped.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium">
                    {result.skipped.length} fila
                    {result.skipped.length === 1 ? "" : "s"} omitida
                    {result.skipped.length === 1 ? "" : "s"}
                  </p>
                  <ul className="mt-1 max-h-32 overflow-auto text-xs text-muted-foreground">
                    {result.skipped.slice(0, 20).map((s) => (
                      <li key={s.row}>
                        Fila {s.row}: {s.reason}
                      </li>
                    ))}
                    {result.skipped.length > 20 && (
                      <li>…y {result.skipped.length - 20} más</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
            <Button onClick={close}>Listo</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="csv">Archivo CSV</Label>
              <Input
                id="csv"
                type="file"
                accept=".csv,text/csv"
                disabled={pending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Columnas reconocidas</p>
              <p className="mt-1">
                <span className="font-mono">nombre</span> (obligatoria),{" "}
                <span className="font-mono">direccion</span>,{" "}
                <span className="font-mono">ciudad</span>,{" "}
                <span className="font-mono">provincia</span>,{" "}
                <span className="font-mono">zona</span>,{" "}
                <span className="font-mono">codigo</span>
              </p>
              <p className="mt-2">
                Acepta variantes en portugués e inglés (endereco, cidade, city,
                address…).
              </p>
            </div>
            {pending && (
              <p className="text-sm text-muted-foreground">Importando…</p>
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
