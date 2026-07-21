"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/status-badge";
import { ORDER_STATUS } from "@/lib/domain/status";
import { Input } from "@/components/ui/input";
import type { OrderRow } from "@/lib/data/orders";
import type { OrderStatus } from "@/types/database";

const ROW_HEIGHT = 56;
const STATUS_ORDER = Object.keys(ORDER_STATUS) as OrderStatus[];

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const t = useTranslations("OrdersTable");
  const statusT = useTranslations("Status");
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [installerFilter, setInstallerFilter] = useState<string>("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  const installers = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) {
      if (o.installer_id && o.installer_name)
        map.set(o.installer_id, o.installer_name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);

  const hasUnassigned = useMemo(
    () => orders.some((o) => !o.installer_id),
    [orders],
  );

  const counts = useMemo(() => {
    const base = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<
      OrderStatus,
      number
    >;
    for (const o of orders) base[o.status] = (base[o.status] ?? 0) + 1;
    return base;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (installerFilter === "unassigned" && o.installer_id) return false;
      if (
        installerFilter !== "all" &&
        installerFilter !== "unassigned" &&
        o.installer_id !== installerFilter
      )
        return false;
      if (!q) return true;
      return (
        o.order_number.toLowerCase().includes(q) ||
        o.title.toLowerCase().includes(q) ||
        o.site_name.toLowerCase().includes(q) ||
        o.site_city.toLowerCase().includes(q) ||
        o.project_name.toLowerCase().includes(q)
      );
    });
  }, [orders, search, statusFilter, installerFilter]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div>
      {/* Resumen por estado */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            statusFilter === "all"
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-card hover:border-primary/40"
          }`}
        >
          {t("all")} <span className="font-mono">{orders.length}</span>
        </button>
        {STATUS_ORDER.filter((s) => counts[s] > 0).map((status) => (
          <button
            key={status}
            onClick={() =>
              setStatusFilter(statusFilter === status ? "all" : status)
            }
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              statusFilter === status ? "border-primary" : "bg-card hover:border-primary/40"
            }`}
            style={
              statusFilter === status
                ? { backgroundColor: ORDER_STATUS[status].bg, color: ORDER_STATUS[status].fg }
                : undefined
            }
          >
            {statusT(ORDER_STATUS[status].key)}{" "}
            <span className="font-mono">{counts[status]}</span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {(installers.length > 0 || hasUnassigned) && (
          <select
            value={installerFilter}
            onChange={(e) => setInstallerFilter(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            <option value="all">{t("allInstallers")}</option>
            {hasUnassigned && <option value="unassigned">{t("unassigned")}</option>}
            {installers.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        <span className="font-mono text-xs text-muted-foreground">
          {t("resultCount", { filtered: filtered.length, total: orders.length })}
        </span>
      </div>

      {/* Tabla virtualizada */}
      <div className="mt-4 overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-[110px_1fr_1fr_140px_130px] gap-4 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>{t("number")}</span>
          <span>{t("titleSite")}</span>
          <span>{t("project")}</span>
          <span>{t("installer")}</span>
          <span>{t("status")}</span>
        </div>

        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {orders.length === 0
              ? t("empty")
              : t("noMatch")}
          </p>
        ) : (
          <div ref={scrollRef} className="max-h-[600px] overflow-auto">
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const order = filtered[virtualRow.index];
                return (
                  <div
                    key={order.id}
                    onClick={() => router.push(`/orders/${order.id}`)}
                    className="absolute inset-x-0 grid cursor-pointer grid-cols-[110px_1fr_1fr_140px_130px] items-center gap-4 border-b px-4 text-sm transition-colors hover:bg-muted/40"
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <span className="font-mono text-xs">{order.order_number}</span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{order.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {order.site_name}
                        {order.site_city ? ` · ${order.site_city}` : ""}
                      </p>
                    </div>
                    <span className="truncate text-muted-foreground">
                      {order.project_name}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {order.installer_name ?? (
                        <span className="text-xs italic opacity-60">{t("unassigned")}</span>
                      )}
                    </span>
                    <StatusBadge status={order.status} kind="order" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
