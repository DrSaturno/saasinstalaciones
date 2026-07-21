"use client";

import { Banknote, ClipboardList, MapPin, UserRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { OrderFormProject } from "@/lib/data/order-form";
import type { OrderFormSite } from "@/lib/actions/orders";
import type { OrderCurrency } from "@/types/database";

type Props = {
  project: OrderFormProject | null;
  site: OrderFormSite | null;
  installerName: string | null;
  amount: string;
  currency: OrderCurrency;
};

export function OrderFormSummary({
  project,
  site,
  installerName,
  amount,
  currency,
}: Props) {
  const t = useTranslations("CreateOrder");
  const format = useFormatter();
  const numericAmount = Number(amount);
  const formattedAmount =
    amount !== "" && Number.isFinite(numericAmount)
      ? format.number(numericAmount, { style: "currency", currency })
      : t("summary.notDefined");

  const rows = [
    {
      icon: ClipboardList,
      label: t("summary.project"),
      value: project?.name ?? t("summary.notSelected"),
      detail: project?.clientName || null,
    },
    {
      icon: MapPin,
      label: t("summary.site"),
      value: site?.name ?? t("summary.notSelected"),
      detail: site
        ? [site.address, site.city].filter(Boolean).join(", ") || site.zone
        : null,
    },
    {
      icon: UserRound,
      label: t("summary.installer"),
      value: installerName ?? t("summary.unassigned"),
      detail: null,
    },
    {
      icon: Banknote,
      label: t("summary.amount"),
      value: formattedAmount,
      detail: null,
    },
  ];

  return (
    <aside className="lg:sticky lg:top-0 lg:self-start">
      <div className="overflow-hidden rounded-2xl border border-primary/20 bg-primary-soft/20">
        <div className="border-b border-primary/15 px-4 py-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            {t("summary.eyebrow")}
          </p>
          <h3 className="mt-1 text-base font-semibold">{t("summary.title")}</h3>
        </div>
        <dl className="divide-y divide-primary/10">
          {rows.map((row) => (
            <div key={row.label} className="flex gap-3 px-4 py-3.5">
              <row.icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {row.label}
                </dt>
                <dd className="mt-0.5 truncate text-sm font-medium">{row.value}</dd>
                {row.detail ? (
                  <dd className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {row.detail}
                  </dd>
                ) : null}
              </div>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}

