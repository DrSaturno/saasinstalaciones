"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { reviewUnavailability } from "@/lib/actions/availability";
import { assignInstaller, rescheduleOrder, transitionOrder } from "@/lib/actions/orders";
import type { DashboardAlertItem, DashboardAlertKind } from "@/lib/data/dashboard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function DashboardAlertDialog({
  kind,
  title,
  items,
  roster,
  children,
}: {
  kind: DashboardAlertKind;
  title: string;
  items: DashboardAlertItem[];
  roster: { id: string; name: string }[];
  children: React.ReactNode;
}) {
  const t = useTranslations("Dashboard");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [installers, setInstallers] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const run = (item: DashboardAlertItem, approve = true) => {
    startTransition(async () => {
      const result =
        kind === "unassigned"
          ? await assignInstaller(item.id, installers[item.id] || null)
          : kind === "overdue"
            ? await rescheduleOrder({ orderId: item.id, scheduledDate: dates[item.id] || item.date || "", scheduledEndDate: "" })
            : kind === "approval"
              ? await transitionOrder(item.id, "finalizada")
              : await reviewUnavailability(item.id, approve ? "approved" : "rejected", notes[item.id] ?? "");
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t("quickActionDone"));
      router.refresh();
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <Link href={item.href} className="truncate text-sm font-medium hover:text-primary">
                  {item.label}
                </Link>
                {item.sublabel ? <p className="truncate text-xs text-muted-foreground">{item.sublabel}</p> : null}
              </div>

              {kind === "unassigned" ? (
                <select
                  value={installers[item.id] ?? ""}
                  onChange={(event) => setInstallers((current) => ({ ...current, [item.id]: event.target.value }))}
                  className="h-9 rounded-lg border bg-transparent px-2 text-sm"
                  aria-label={t("selectInstaller")}
                >
                  <option value="">{t("selectInstaller")}</option>
                  {roster.map((installer) => (
                    <option key={installer.id} value={installer.id}>{installer.name}</option>
                  ))}
                </select>
              ) : null}

              {kind === "overdue" ? (
                <Input
                  type="date"
                  value={dates[item.id] ?? item.date ?? ""}
                  onChange={(event) => setDates((current) => ({ ...current, [item.id]: event.target.value }))}
                  className="sm:w-40"
                  aria-label={t("alertRescheduleTo")}
                />
              ) : null}

              {kind === "absencePending" ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={notes[item.id] ?? ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                    placeholder={t("alertAbsenceNote")}
                    className="sm:w-44"
                    aria-label={t("alertAbsenceNote")}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(item, false)}>
                      {t("alertReject")}
                    </Button>
                    <Button size="sm" disabled={pending} onClick={() => run(item, true)}>
                      {t("alertApprove")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  disabled={pending || (kind === "unassigned" && !installers[item.id])}
                  onClick={() => run(item)}
                >
                  {t("apply")}
                </Button>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button asChild variant="ghost" size="sm">
            <Link href={items[0]?.href ?? "/orders"}>
              {t("alertOpenDetail")}
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
