"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reviewUnavailability } from "@/lib/actions/availability";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * Aprobar / rechazar un aviso de inactividad.
 *
 * Aprobar es directo. Rechazar abre un diálogo para el motivo: antes usaba
 * `window.prompt`, que no se puede traducir bien, se ve distinto en cada
 * navegador y en móvil aparece como una alerta del sistema — mal lugar para
 * escribir una explicación que la otra persona va a leer.
 */
export function UnavailabilityReview({ id, name }: { id: string; name: string }) {
  const t = useTranslations("Team");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const resolve = (decision: "approved" | "rejected") => {
    startTransition(async () => {
      const result = await reviewUnavailability(id, decision, decision === "rejected" ? note : "");
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setRejecting(false);
      setNote("");
      toast.success(decision === "approved" ? t("approved", { name }) : t("rejected", { name }));
      router.refresh();
    });
  };

  return (
    <>
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => resolve("approved")}>
          <Check className="size-3.5" aria-hidden="true" />
          {t("approve")}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setRejecting(true)}>
          <X className="size-3.5" aria-hidden="true" />
          {t("reject")}
        </Button>
      </div>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("rejectReason", { name })}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("rejectReasonPlaceholder")}
            rows={3}
            disabled={pending}
          />
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setRejecting(false)}>
              {t("rejectCancel")}
            </Button>
            <Button disabled={pending} onClick={() => resolve("rejected")}>
              {t("reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
