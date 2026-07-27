"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { acceptOrder } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";

/** Confirma que el instalador se hace cargo de una orden que le asignaron. */
export function AcceptOrderButton({ orderId }: { orderId: string }) {
  const t = useTranslations("InstallerTasks");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const accept = () =>
    startTransition(async () => {
      const result = await acceptOrder(orderId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t("accepted"));
      router.refresh();
    });

  return (
    <Button size="sm" onClick={accept} disabled={pending}>
      <Check className="size-3.5" aria-hidden="true" />
      {pending ? t("accepting") : t("accept")}
    </Button>
  );
}
