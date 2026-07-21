"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { getOrderFormSites, type OrderFormSite } from "@/lib/actions/orders";
import type { OrderFormProject } from "@/lib/data/order-form";
import type { OrderCurrency } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OrderFilesField } from "@/components/company/order-files-field";
import { OrderFormSection } from "@/components/company/order-form-section";
import { OrderFormSummary } from "@/components/company/order-form-summary";

type RosterOption = {
  id: string;
  name: string;
  ratingAvg: number;
  ratingCount: number;
};

type Props = {
  projects: OrderFormProject[];
  roster: RosterOption[];
  currency: OrderCurrency;
  files: File[];
  disabled: boolean;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
};

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50";

export function OrderFormFields({
  projects,
  roster,
  currency,
  files,
  disabled,
  onAddFiles,
  onRemoveFile,
}: Props) {
  const t = useTranslations("CreateOrder");
  const statusT = useTranslations("Status");
  const [projectId, setProjectId] = useState("");
  const [sites, setSites] = useState<OrderFormSite[]>([]);
  const [siteId, setSiteId] = useState("");
  const [installerId, setInstallerId] = useState("");
  const [amount, setAmount] = useState("");
  const [requiresFreight, setRequiresFreight] = useState(false);
  const [loadingSites, startLoadingSites] = useTransition();

  const project = projects.find((item) => item.id === projectId) ?? null;
  const site = sites.find((item) => item.id === siteId) ?? null;
  const installer = roster.find((item) => item.id === installerId) ?? null;

  const chooseProject = (value: string) => {
    setProjectId(value);
    setSiteId("");
    setSites([]);
    if (!value) return;
    startLoadingSites(async () => {
      const result = await getOrderFormSites(value);
      if (result.error) toast.error(result.error);
      else setSites(result.sites);
    });
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="grid min-w-0 gap-5">
        <OrderFormSection
          number="01"
          title={t("sections.location.title")}
          description={t("sections.location.description")}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="order-project">{t("project")}</Label>
              <select
                id="order-project"
                value={projectId}
                disabled={disabled}
                onChange={(event) => chooseProject(event.target.value)}
                className={selectClass}
                required
              >
                <option value="">{t("chooseProject")}</option>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.clientName ? ` · ${item.clientName}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="order-site">{t("site")}</Label>
              <select
                id="order-site"
                name="siteId"
                value={siteId}
                disabled={disabled || !projectId || loadingSites}
                onChange={(event) => setSiteId(event.target.value)}
                className={selectClass}
                required
              >
                <option value="">
                  {loadingSites ? t("loadingSites") : t("chooseSite")}
                </option>
                {sites.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.externalRef ? `${item.externalRef} · ` : ""}{item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {site ? (
            <div className="rounded-xl border border-primary/15 bg-primary-soft/15 px-4 py-3 text-xs">
              <span className="font-medium">{site.name}</span>
              <span className="text-muted-foreground">
                {` · ${[site.address, site.city, site.state].filter(Boolean).join(", ") || t("noAddress")}`}
              </span>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_190px]">
            <div className="grid gap-2">
              <Label htmlFor="order-title">{t("workTitle")}</Label>
              <Input id="order-title" name="title" required maxLength={200} placeholder={t("workTitlePlaceholder")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="order-status">{t("initialStatus")}</Label>
              <select id="order-status" name="status" defaultValue="pendiente" className={selectClass} disabled={disabled}>
                <option value="pendiente">{statusT("order.pendiente")}</option>
                <option value="relevamiento">{statusT("order.relevamiento")}</option>
                <option value="planificada">{statusT("order.planificada")}</option>
              </select>
            </div>
          </div>
        </OrderFormSection>

        <OrderFormSection number="02" title={t("sections.schedule.title")} description={t("sections.schedule.description")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="scheduled-date">{t("startDate")}</Label>
              <Input id="scheduled-date" name="scheduledDate" type="date" disabled={disabled} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="scheduled-end-date">{t("endDate")}</Label>
              <Input id="scheduled-end-date" name="scheduledEndDate" type="date" disabled={disabled} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="order-priority">{t("priority")}</Label>
              <select id="order-priority" name="priority" defaultValue="media" className={selectClass} disabled={disabled}>
                {(["baja", "media", "alta", "urgente"] as const).map((priority) => (
                  <option key={priority} value={priority}>{t(`priorities.${priority}`)}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/20 px-4 py-3">
            <span>
              <span className="block text-sm font-medium">{t("indoor")}</span>
              <span className="block text-xs text-muted-foreground">{t("indoorHelp")}</span>
            </span>
            <input name="indoor" type="checkbox" disabled={disabled} className="size-4 accent-primary" />
          </label>
        </OrderFormSection>

        <OrderFormSection number="03" title={t("sections.operation.title")} description={t("sections.operation.description")}>
          <div className="grid gap-2">
            <Label htmlFor="order-installer">{t("installer")}</Label>
            <select id="order-installer" name="installerId" value={installerId} onChange={(event) => setInstallerId(event.target.value)} className={selectClass} disabled={disabled}>
              <option value="">{t("unassigned")}</option>
              {roster.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}{item.ratingCount > 0 ? ` · ★ ${item.ratingAvg.toFixed(1)}` : ""}
                </option>
              ))}
            </select>
            {roster.length === 0 ? <p className="text-xs text-muted-foreground">{t("emptyRoster")}</p> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="order-description">{t("description")}</Label>
              <Textarea id="order-description" name="description" rows={4} maxLength={4000} placeholder={t("descriptionPlaceholder")} disabled={disabled} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="logistics-notes">{t("logistics")}</Label>
              <Textarea id="logistics-notes" name="logisticsNotes" rows={4} maxLength={2000} placeholder={t("logisticsPlaceholder")} disabled={disabled} />
            </div>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/20 px-4 py-3">
            <span>
              <span className="block text-sm font-medium">{t("freight")}</span>
              <span className="block text-xs text-muted-foreground">{t("freightHelp")}</span>
            </span>
            <input name="requiresFreight" type="checkbox" checked={requiresFreight} onChange={(event) => setRequiresFreight(event.target.checked)} disabled={disabled} className="size-4 accent-primary" />
          </label>
          {requiresFreight ? (
            <div className="grid gap-2">
              <Label htmlFor="freight-details">{t("freightDetails")}</Label>
              <Input id="freight-details" name="freightDetails" maxLength={1000} required placeholder={t("freightPlaceholder")} disabled={disabled} />
            </div>
          ) : null}
        </OrderFormSection>

        <OrderFormSection number="04" title={t("sections.budget.title")} description={t("sections.budget.description")}>
          <div className="max-w-sm">
            <Label htmlFor="order-amount">{t("amount")}</Label>
            <div className="relative mt-2">
              <span className="absolute inset-y-0 left-3 flex items-center font-mono text-xs text-muted-foreground">{currency}</span>
              <Input id="order-amount" name="amount" type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" className="pl-14 font-mono text-lg" disabled={disabled} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{t("amountHelp")}</p>
          </div>
          <OrderFilesField files={files} disabled={disabled} onAdd={onAddFiles} onRemove={onRemoveFile} />
        </OrderFormSection>
      </div>

      <OrderFormSummary project={project} site={site} installerName={installer?.name ?? null} amount={amount} currency={currency} />
    </div>
  );
}

