"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Minus, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { updatePlannedInstallations } from "@/lib/actions/sites";
import { CreateSiteDialog } from "@/components/company/create-site-dialog";
import { CreateOrdersDialog } from "@/components/company/create-orders-dialog";
import { ImportSitesDialog } from "@/components/company/import-sites-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Country } from "@/types/database";

export function ManageInstallationsDialog({
  projectId,
  country,
  zones,
  planned,
  activeCount,
  archivedCount,
}: {
  projectId: string;
  country: Country;
  zones: string[];
  planned: number;
  activeCount: number;
  archivedCount: number;
}) {
  const t = useTranslations("ManageSites");
  const router = useRouter();
  const [quantity, setQuantity] = useState(planned);
  const [pending, startTransition] = useTransition();

  const saveQuantity = (next: number) => {
    const safe = Math.max(0, next);
    setQuantity(safe);
    startTransition(async () => {
      const result = await updatePlannedInstallations(projectId, safe);
      if (result.error) {
        setQuantity(quantity);
        toast.error(result.error);
        return;
      }
      toast.success(t("quantityUpdated"));
      router.refresh();
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild><Button><Settings2 />{t("trigger")}</Button></DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{t("title")}</DialogTitle><DialogDescription>{t("description")}</DialogDescription></DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">{t("contracted")}</p><p className="mt-1 font-mono text-2xl font-semibold">{quantity}</p></div>
          <div className="rounded-xl border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">{t("loaded")}</p><p className="mt-1 font-mono text-2xl font-semibold">{activeCount}</p></div>
          <div className="rounded-xl border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">{t("remaining")}</p><p className="mt-1 font-mono text-2xl font-semibold">{Math.max(0, quantity - activeCount)}</p></div>
        </div>

        <section className="rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h3 className="text-sm font-semibold">{t("adjustTitle")}</h3><p className="text-xs text-muted-foreground">{t("adjustDescription")}</p></div>
            <div className="flex items-center gap-2">
              <Button type="button" size="icon-sm" variant="outline" onClick={() => saveQuantity(quantity - 1)} disabled={pending || quantity === 0} aria-label={t("subtract")}><Minus /></Button>
              <span className="min-w-12 text-center font-mono text-lg">{quantity}</span>
              <Button type="button" size="icon-sm" variant="outline" onClick={() => saveQuantity(quantity + 1)} disabled={pending} aria-label={t("addOne")}><Plus /></Button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border p-4">
          <h3 className="text-sm font-semibold">{t("actionsTitle")}</h3>
          <p className="mb-4 text-xs text-muted-foreground">{t("actionsDescription", { archived: archivedCount })}</p>
          <div className="flex flex-wrap gap-2">
            <CreateSiteDialog projectId={projectId} country={country} zones={zones} />
            <ImportSitesDialog projectId={projectId} />
            <CreateOrdersDialog projectId={projectId} siteCount={activeCount} />
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
