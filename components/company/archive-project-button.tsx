"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { setProjectArchived } from "@/lib/actions/projects/crud";
import { Button } from "@/components/ui/button";

/**
 * Archiva o desarchiva un proyecto. Es reversible y no borra nada: las
 * locaciones y las órdenes siguen existiendo, el proyecto sólo sale del
 * listado corriente.
 */
export function ArchiveProjectButton({
  projectId,
  archived,
  name,
}: {
  projectId: string;
  archived: boolean;
  name: string;
}) {
  const t = useTranslations("Projects");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (!archived && !window.confirm(t("archiveConfirm", { name }))) return;
    startTransition(async () => {
      const res = await setProjectArchived(projectId, !archived);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(archived ? t("unarchived", { name }) : t("archived", { name }));
      router.refresh();
    });
  };

  return (
    <Button variant="outline" onClick={toggle} disabled={pending}>
      {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
      {archived ? t("unarchive") : t("archive")}
    </Button>
  );
}
