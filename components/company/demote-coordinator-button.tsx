"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { demoteToInstaller } from "@/lib/actions/team";
import { Button } from "@/components/ui/button";

/** Devuelve a un coordinador a su rol de instalador. Solo para el gerente. */
export function DemoteCoordinatorButton({
  coordinatorId,
  name,
}: {
  coordinatorId: string;
  name: string;
}) {
  const t = useTranslations("Roster");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const demote = () => {
    if (!window.confirm(t("demoteConfirm", { name }))) return;
    startTransition(async () => {
      const res = await demoteToInstaller(coordinatorId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("demoted", { name }));
      router.refresh();
    });
  };

  return (
    <Button variant="ghost" size="sm" onClick={demote} disabled={pending}>
      {t("demote")}
    </Button>
  );
}
