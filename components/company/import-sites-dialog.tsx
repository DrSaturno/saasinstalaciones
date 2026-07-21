"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("ImportSites");
  const common = useTranslations("Common");
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
          toast.success(t("imported", { count: res.inserted }));
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
        <Button variant="outline">{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
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
                      <li key={s.row}>
                        {t("row", { row: s.row, reason: s.reason })}
                      </li>
                    ))}
                    {result.skipped.length > 20 && (
                      <li>{t("more", { count: result.skipped.length - 20 })}</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
            <Button onClick={close}>{common("done")}</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="csv">{t("file")}</Label>
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
              <p className="font-medium text-foreground">{t("recognized")}</p>
              <p className="mt-1 font-mono">{t("columns")}</p>
              <p className="mt-2">{t("variants")}</p>
            </div>
            {pending && (
              <p className="text-sm text-muted-foreground">{t("importing")}</p>
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
