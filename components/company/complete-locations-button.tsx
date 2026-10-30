"use client";

import { useState, useTransition } from "react";
import { LocateFixed } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { completeMissingLocations } from "@/lib/actions/projects/geocode";
import { Button } from "@/components/ui/button";

/**
 * Ubica en el mapa los locales del proyecto que tienen dirección y todavía no
 * tienen ubicación. Procesa por tandas: si quedan, el botón sigue disponible con
 * el número actualizado.
 */
export function CompleteLocationsButton({
  projectId,
  missing,
}: {
  projectId: string;
  missing: number;
}) {
  const t = useTranslations("CompleteLocations");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [left, setLeft] = useState(missing);

  const run = () =>
    startTransition(async () => {
      const result = await completeMissingLocations(projectId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setLeft(result.remaining);
      toast.success(
        result.located > 0
          ? t("done", { located: result.located, notFound: result.notFound, remaining: result.remaining })
          : t("noneFound", { notFound: result.notFound }),
      );
      router.refresh();
    });

  if (left <= 0) return null;

  return (
    <div className="rounded-xl border bg-muted/25 p-3">
      <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">{t("title")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("description", { count: left })}</p>
      <div className="mt-3">
        <Button type="button" variant="outline" onClick={run} disabled={pending}>
          <LocateFixed className="size-4" aria-hidden="true" />
          {pending ? t("working") : t("action")}
        </Button>
      </div>
    </div>
  );
}
