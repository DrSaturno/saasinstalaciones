"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateOrder } from "@/lib/actions/orders/intake";
import type { ActionState } from "@/lib/actions/orders/types";
import { ORDER_PRIORITIES } from "@/lib/domain/order-intake";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OrderCurrency } from "@/types/database";

const initial: ActionState = { error: null };
const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type EditOrderDefaults = {
  title: string;
  description: string;
  scheduledDate: string;
  scheduledEndDate: string;
  priority: string;
  indoor: boolean;
  requiresFreight: boolean;
  freightDetails: string;
  logisticsNotes: string;
  amount: number | null;
  installerId: string;
};

export function EditOrderDialog({
  orderId,
  defaults,
  roster,
  currency,
  canEditAmount,
}: {
  orderId: string;
  defaults: EditOrderDefaults;
  roster: { id: string; name: string }[];
  currency: OrderCurrency;
  canEditAmount: boolean;
}) {
  const t = useTranslations("EditOrder");
  const common = useTranslations("CreateOrder");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [requiresFreight, setRequiresFreight] = useState(defaults.requiresFreight);
  const action = updateOrder.bind(null, orderId);
  // Se cierra dentro de la acción (no en un efecto) para no encadenar renders.
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const next = await action(previous, formData);
      if (next.ok) {
        setOpen(false);
        toast.success(t("saved"));
        router.refresh();
      }
      return next;
    },
    initial,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-3.5" aria-hidden="true" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-title">{common("workTitle")}</Label>
            <Input
              id="edit-title"
              name="title"
              defaultValue={defaults.title}
              maxLength={200}
              required
              disabled={pending}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-description">{common("description")}</Label>
            <Textarea
              id="edit-description"
              name="description"
              defaultValue={defaults.description}
              rows={3}
              maxLength={4000}
              disabled={pending}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-start">{common("startDate")}</Label>
              <Input
                id="edit-start"
                name="scheduledDate"
                type="date"
                defaultValue={defaults.scheduledDate}
                disabled={pending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-end">{common("endDate")}</Label>
              <Input
                id="edit-end"
                name="scheduledEndDate"
                type="date"
                defaultValue={defaults.scheduledEndDate}
                disabled={pending}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-priority">{common("priority")}</Label>
              <select
                id="edit-priority"
                name="priority"
                defaultValue={defaults.priority}
                className={selectClass}
                disabled={pending}
              >
                {ORDER_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {common(`priorities.${priority}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-installer">{common("installer")}</Label>
              <select
                id="edit-installer"
                name="installerId"
                defaultValue={defaults.installerId}
                className={selectClass}
                disabled={pending}
              >
                <option value="">{common("unassigned")}</option>
                {roster.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {canEditAmount ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-amount">{common("amount")}</Label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center font-mono text-xs text-muted-foreground">
                  {currency}
                </span>
                <Input
                  id="edit-amount"
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={defaults.amount ?? ""}
                  className="pl-14 font-mono"
                  disabled={pending}
                />
              </div>
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="indoor"
              defaultChecked={defaults.indoor}
              className="accent-primary"
              disabled={pending}
            />
            {common("indoor")}
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="requiresFreight"
              checked={requiresFreight}
              onChange={(event) => setRequiresFreight(event.target.checked)}
              className="accent-primary"
              disabled={pending}
            />
            {common("freight")}
          </label>

          {requiresFreight ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-freight">{common("freightDetails")}</Label>
              <Textarea
                id="edit-freight"
                name="freightDetails"
                defaultValue={defaults.freightDetails}
                rows={2}
                maxLength={1000}
                required
                disabled={pending}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-logistics">{common("logistics")}</Label>
            <Textarea
              id="edit-logistics"
              name="logisticsNotes"
              defaultValue={defaults.logisticsNotes}
              rows={2}
              maxLength={2000}
              disabled={pending}
            />
          </div>

          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? t("saving") : t("save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
