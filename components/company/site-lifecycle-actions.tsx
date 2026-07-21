"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { deleteEmptySite, setSiteArchived } from "@/lib/actions/sites";
import { Button } from "@/components/ui/button";

export function SiteLifecycleActions({ projectId, siteId, archived, orderCount }: { projectId: string; siteId: string; archived: boolean; orderCount: number }) {
  const t = useTranslations("SiteDetail");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggle = () => startTransition(async () => {
    const result = await setSiteArchived(projectId, siteId, !archived);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(archived ? t("reactivated") : t("archivedToast"));
    router.refresh();
  });

  const remove = () => {
    if (!window.confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      const result = await deleteEmptySite(projectId, siteId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t("deleted"));
      router.push(`/projects/${projectId}`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={toggle} disabled={pending}>{archived ? t("reactivate") : t("archive")}</Button>
      {archived && orderCount === 0 ? <Button type="button" variant="destructive" onClick={remove} disabled={pending}>{t("delete")}</Button> : null}
    </div>
  );
}
