"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { OrderRow } from "@/lib/data/orders";
import {
  DashboardPeekDialog,
  PEEK_LIMIT,
} from "@/components/company/dashboard-peek-dialog";
import { StatusBadge } from "@/components/shared/status-badge";

/**
 * Asomada a las órdenes vivas desde el inicio.
 *
 * Muestra las más próximas por fecha: son las que el gerente necesita mirar hoy.
 * Las que no tienen fecha van al final, porque todavía no compiten por la
 * agenda.
 */
export function DashboardOrdersPeek({ orders }: { orders: OrderRow[] }) {
  const t = useTranslations("Dashboard");
  const format = useFormatter();

  const visible = [...orders]
    .sort((a, b) => (a.scheduled_date ?? "9999-12-31").localeCompare(b.scheduled_date ?? "9999-12-31"))
    .slice(0, PEEK_LIMIT);

  return (
    <DashboardPeekDialog
      label={t("quickActions.viewOrders")}
      emptyLabel={t("peekOrdersEmpty")}
      href="/orders"
      hrefLabel={t("peekOpenOrders")}
      count={orders.length}
    >
      {visible.map((order) => (
        <Link
          key={order.id}
          href={`/orders/${order.id}`}
          className="flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/40"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              <span className="font-mono text-xs text-muted-foreground">{order.order_number}</span> · {order.title}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {order.project_name} · {order.site_name}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {order.scheduled_date ? (
              <span className="font-mono text-[11px] text-muted-foreground">
                {format.dateTime(new Date(`${order.scheduled_date}T12:00:00Z`), { day: "2-digit", month: "2-digit" })}
              </span>
            ) : null}
            <StatusBadge status={order.status} kind="order" />
          </div>
        </Link>
      ))}
    </DashboardPeekDialog>
  );
}
