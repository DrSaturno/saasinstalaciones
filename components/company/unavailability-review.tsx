"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reviewUnavailability } from "@/lib/actions/availability";
import { Button } from "@/components/ui/button";

/** Aprobar / rechazar un aviso de inactividad, con nota opcional al rechazar. */
export function UnavailabilityReview({ id, name }: { id: string; name: string }) {
  const t = useTranslations("Team");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const resolve = (decision: "approved" | "rejected") => {
    const note =
      decision === "rejected" ? window.prompt(t("rejectReason", { name })) ?? "" : "";
    startTransition(async () => {
      const result = await reviewUnavailability(id, decision, note);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(decision === "approved" ? t("approved", { name }) : t("rejected", { name }));
      router.refresh();
    });
  };

  return (
    <div className="mt-3 flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => resolve("approved")}>
        <Check className="size-3.5" aria-hidden="true" />
        {t("approve")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => resolve("rejected")}
      >
        <X className="size-3.5" aria-hidden="true" />
        {t("reject")}
      </Button>
    </div>
  );
}
