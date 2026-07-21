"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { acceptApplication } from "@/lib/actions/broadcasts";
import type { BroadcastOrderOption } from "@/lib/data/broadcasts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AcceptApplicationDialog({
  broadcastId,
  installerId,
  installerName,
  orders,
}: {
  broadcastId: string;
  installerId: string;
  installerName: string;
  orders: BroadcastOrderOption[];
}) {
  const t = useTranslations("AcceptApplication");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    startTransition(async () => {
      const result = await acceptApplication({ broadcastId, installerId, orderIds: selected });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t("success", { name: installerName }));
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">{t("trigger")}</Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title", { name: installerName })}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("optionalOrders", { count: selected.length })}
          </p>
          <div className="max-h-64 overflow-y-auto rounded-lg border">
            {orders.length ? orders.map((order) => (
              <label key={order.id} className="flex cursor-pointer items-start gap-3 border-b p-3 last:border-0 hover:bg-muted/60">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={selected.includes(order.id)}
                  onChange={(event) => setSelected((current) => event.target.checked ? [...current, order.id] : current.filter((id) => id !== order.id))}
                />
                <span className="min-w-0">
                  <span className="block font-mono text-xs text-primary">{order.orderNumber}</span>
                  <span className="block truncate text-sm font-medium">{order.siteName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{order.title}</span>
                </span>
              </label>
            )) : <p className="p-5 text-center text-sm text-muted-foreground">{t("empty")}</p>}
          </div>
          <Button onClick={submit} disabled={pending}>{pending ? t("accepting") : t("submit")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
