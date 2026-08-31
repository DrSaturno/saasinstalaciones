"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createOrdersForProject } from "@/lib/actions/orders/bulk";
import { ORDER_INITIAL_STATUSES, ORDER_PRIORITIES } from "@/lib/domain/order-intake";
import type { OrderCurrency } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OrderFormSection } from "@/components/company/order-form-section";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type RosterOption = { id: string; name: string };

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Genera una orden por cada punto del proyecto que aún no tenga una.
 *
 * Antes sólo pedía el título y dejaba todo lo demás en blanco: con 30
 * locaciones de la misma tarea había que abrir las 30 después para cargarles
 * fecha, prioridad y logística. Ahora esos datos se cargan una vez y se
 * aplican al lote entero.
 *
 * No lleva adjuntos a propósito: la evidencia es de cada orden, y subir el
 * mismo archivo 30 veces multiplica el storage sin agregar nada.
 */
export function CreateOrdersDialog({
  projectId,
  siteCount,
  roster,
  currency,
  canManageFinance,
  perInstallation,
}: {
  projectId: string;
  siteCount: number;
  roster: RosterOption[];
  currency: OrderCurrency;
  canManageFinance: boolean;
  perInstallation: boolean;
}) {
  const t = useTranslations("CreateOrders");
  const orderT = useTranslations("CreateOrder");
  const statusT = useTranslations("Status");
  const [open, setOpen] = useState(false);
  const [requiresFreight, setRequiresFreight] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const amountEnabled = canManageFinance && perInstallation;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await createOrdersForProject(projectId, formData);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      setRequiresFreight(false);
      if (res.created === 0) {
        toast.info(res.skipped > 0 ? t("allExist") : t("noSites"));
      } else {
        toast.success(t("created", { created: res.created, skipped: res.skipped }));
      }
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={siteCount === 0}>{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent className="grid max-h-[90svh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <form id="create-orders" onSubmit={submit} className="overflow-y-auto px-5 py-4">
          <div className="grid gap-5">
            <OrderFormSection
              number="01"
              title={t("sectionWhatTitle")}
              description={t("sectionWhatDescription", { count: siteCount })}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="batch-title">{t("orderTitle")}</Label>
                  <Input
                    id="batch-title"
                    name="title"
                    defaultValue={t("defaultTitle")}
                    placeholder={t("placeholder")}
                    maxLength={200}
                    required
                    disabled={pending}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="batch-status">{orderT("initialStatus")}</Label>
                  <select id="batch-status" name="status" className={selectClass} disabled={pending}>
                    {ORDER_INITIAL_STATUSES.map((status) => (
                      <option key={status} value={status}>{statusT(`order.${status}`)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="batch-description">{orderT("description")}</Label>
                <Textarea
                  id="batch-description"
                  name="description"
                  rows={3}
                  maxLength={4000}
                  disabled={pending}
                />
              </div>
            </OrderFormSection>

            <OrderFormSection
              number="02"
              title={orderT("sections.schedule.title")}
              description={orderT("sections.schedule.description")}
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="batch-start">{orderT("startDate")}</Label>
                  <Input id="batch-start" name="scheduledDate" type="date" disabled={pending} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="batch-end">{orderT("endDate")}</Label>
                  <Input id="batch-end" name="scheduledEndDate" type="date" disabled={pending} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="batch-priority">{orderT("priority")}</Label>
                  <select id="batch-priority" name="priority" defaultValue="media" className={selectClass} disabled={pending}>
                    {ORDER_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>{orderT(`priorities.${priority}`)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="indoor" className="size-4" disabled={pending} />
                {orderT("indoor")}
              </label>
            </OrderFormSection>

            <OrderFormSection
              number="03"
              title={orderT("sections.operation.title")}
              description={t("sectionOperationDescription")}
            >
              <div className="grid gap-2">
                <Label htmlFor="batch-installer">{orderT("installer")}</Label>
                <select id="batch-installer" name="installerId" className={selectClass} disabled={pending}>
                  <option value="">{orderT("unassigned")}</option>
                  {roster.map((installer) => (
                    <option key={installer.id} value={installer.id}>{installer.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">{t("installerHint")}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="batch-logistics">{orderT("logistics")}</Label>
                <Textarea id="batch-logistics" name="logisticsNotes" rows={2} maxLength={2000} disabled={pending} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="requiresFreight"
                  className="size-4"
                  checked={requiresFreight}
                  onChange={(event) => setRequiresFreight(event.target.checked)}
                  disabled={pending}
                />
                {orderT("freight")}
              </label>
              {requiresFreight ? (
                <div className="grid gap-2">
                  <Label htmlFor="batch-freight">{orderT("freightDetails")}</Label>
                  <Textarea id="batch-freight" name="freightDetails" rows={2} maxLength={1000} required disabled={pending} />
                </div>
              ) : null}
            </OrderFormSection>

            {canManageFinance ? (
              <OrderFormSection
                number="04"
                title={orderT("sections.budget.title")}
                description={t("sectionBudgetDescription")}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* El ingreso sólo aplica si al cliente se le cobra por
                      instalación; el costo del instalador, siempre. */}
                  {amountEnabled ? (
                    <div>
                      <Label htmlFor="batch-amount">{orderT("amount")}</Label>
                      <div className="relative mt-2">
                        <span className="absolute inset-y-0 left-3 flex items-center font-mono text-xs text-muted-foreground">
                          {currency}
                        </span>
                        <Input
                          id="batch-amount"
                          name="amount"
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          placeholder="0,00"
                          className="pl-14 font-mono text-lg"
                          disabled={pending}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <Label htmlFor="batch-installer-amount">{orderT("installerAmount")}</Label>
                    <div className="relative mt-2">
                      <span className="absolute inset-y-0 left-3 flex items-center font-mono text-xs text-muted-foreground">
                        {currency}
                      </span>
                      <Input
                        id="batch-installer-amount"
                        name="installerAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0,00"
                        className="pl-14 font-mono text-lg"
                        disabled={pending}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{t("batchInstallerAmountHelp")}</p>
                  </div>
                </div>
              </OrderFormSection>
            ) : null}
          </div>
        </form>

        <div className="flex items-center justify-between gap-3 border-t px-5 py-4">
          <p className="text-sm text-muted-foreground">{t("siteCount", { count: siteCount })}</p>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>{orderT("cancel")}</Button>
            </DialogClose>
            <Button type="submit" form="create-orders" disabled={pending}>
              {pending ? t("generating") : t("trigger")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
