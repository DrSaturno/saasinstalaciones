"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { assignInstaller, rescheduleOrder, transitionOrder } from "@/lib/actions/orders";
import type { OrderRow } from "@/lib/data/orders";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Installer = { id: string; name: string };
type Mode = "assign" | "reschedule" | "approve";

export function DashboardOrderAction({
  mode,
  orders,
  roster,
}: {
  mode: Mode;
  orders: OrderRow[];
  roster: Installer[];
}) {
  const t = useTranslations("Dashboard");
  const [pending, startTransition] = useTransition();
  const [installers, setInstallers] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const router = useRouter();
  const key = mode === "assign" ? "assignPending" : mode === "reschedule" ? "reviewOrders" : "approveWork";
  const run = (order: OrderRow) => {
    startTransition(async () => {
      const result = mode === "assign"
        ? await assignInstaller(order.id, installers[order.id] || null)
        : mode === "reschedule"
          ? await rescheduleOrder({ orderId: order.id, scheduledDate: dates[order.id] || order.scheduled_date || "", scheduledEndDate: "" })
          : await transitionOrder(order.id, "finalizada");
      if (result.error) toast.error(result.error);
      else {
        toast.success(t("quickActionDone"));
        router.refresh();
      }
    });
  };
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline">{t(`quickActions.${key}`)}</Button></DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{t(`quickActions.${key}`)}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {orders.slice(0, 12).map((order) => (
            <div key={order.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{order.order_number} · {order.title}</p><p className="text-xs text-muted-foreground">{order.project_name} · {order.site_name}</p></div>
              {mode === "assign" ? (
                <select value={installers[order.id] ?? ""} onChange={(event) => setInstallers((current) => ({ ...current, [order.id]: event.target.value }))} className="h-9 rounded-lg border bg-transparent px-2 text-sm">
                  <option value="">{t("selectInstaller")}</option>
                  {roster.map((installer) => <option key={installer.id} value={installer.id}>{installer.name}</option>)}
                </select>
              ) : null}
              {mode === "reschedule" ? <Input type="date" value={dates[order.id] ?? order.scheduled_date ?? ""} onChange={(event) => setDates((current) => ({ ...current, [order.id]: event.target.value }))} className="sm:w-40" /> : null}
              <Button size="sm" onClick={() => run(order)} disabled={pending || (mode === "assign" && !installers[order.id])}>{t("apply")}</Button>
            </div>
          ))}
          {!orders.length ? <p className="py-8 text-center text-sm text-muted-foreground">{t("quickActionEmpty")}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
