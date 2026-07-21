"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createOrdersForProject } from "@/lib/actions/orders";
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

/** Genera una orden por cada punto del proyecto que aún no tenga una. */
export function CreateOrdersDialog({
  projectId,
  siteCount,
}: {
  projectId: string;
  siteCount: number;
}) {
  const t = useTranslations("CreateOrders");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(() => t("defaultTitle"));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = () => {
    startTransition(async () => {
      const res = await createOrdersForProject(projectId, title);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      if (res.created === 0) {
        toast.info(
          res.skipped > 0
            ? t("allExist")
            : t("noSites"),
        );
      } else {
        toast.success(
          t("created", { created: res.created, skipped: res.skipped }),
        );
      }
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={siteCount === 0}>{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">{t("orderTitle")}</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("placeholder")}
            />
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            {t("siteCount", { count: siteCount })}
          </div>
          <Button onClick={run} disabled={pending}>
            {pending ? t("generating") : t("trigger")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
