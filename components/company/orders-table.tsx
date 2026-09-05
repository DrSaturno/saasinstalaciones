"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DataGrid, DataGridCell, DataGridHeader, DataGridRow } from "@/components/shared/data-grid";
import { StatusBadge } from "@/components/shared/status-badge";
import { ORDER_STATUS } from "@/lib/domain/status";
import { Input } from "@/components/ui/input";
import type { OrderRow } from "@/lib/data/orders";
import type { OrderStatus } from "@/types/database";

const ROW_HEIGHT = 60;
const STATUS_ORDER = Object.keys(ORDER_STATUS) as OrderStatus[];
type SortMode = "newest" | "amount_desc" | "amount_asc";

export function OrdersTable({
  orders,
  showAmounts = true,
}: {
  orders: OrderRow[];
  showAmounts?: boolean;
}) {
  const t = useTranslations("OrdersTable");
  const ordersT = useTranslations("Orders");
  const statusT = useTranslations("Status");
  const format = useFormatter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [installerFilter, setInstallerFilter] = useState("all");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Encabezado y filas comparten columnas y plantilla: si se declaran por
  // separado, dejan de alinear en cuanto alguien toca una sola columna.
  const columns = [
    t("number"), t("titleSite"), t("project"), t("installer"), t("date"),
    ...(showAmounts ? [t("amount")] : []), t("status"),
  ];
  const template = showAmounts
    ? "110px 1fr 1fr 130px 110px 120px 130px"
    : "110px 1fr 1fr 150px 120px 130px";

  const installers = useMemo(() => {
    const map = new Map<string, string>();
    for (const order of orders) if (order.installer_id && order.installer_name) map.set(order.installer_id, order.installer_name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);
  const zones = useMemo(() => [...new Set(orders.map((order) => order.site_zone).filter(Boolean))].sort(), [orders]);
  const hasUnassigned = useMemo(() => orders.some((order) => !order.installer_id), [orders]);
  const counts = useMemo(() => {
    const base = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0])) as Record<OrderStatus, number>;
    for (const order of orders) base[order.status]++;
    return base;
  }, [orders]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = orders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (zoneFilter !== "all" && order.site_zone !== zoneFilter) return false;
      if (installerFilter === "unassigned" && order.installer_id) return false;
      if (installerFilter !== "all" && installerFilter !== "unassigned" && order.installer_id !== installerFilter) return false;
      const start = order.scheduled_date;
      const end = order.scheduled_end_date ?? start;
      if (dateFrom && (!end || end < dateFrom)) return false;
      if (dateTo && (!start || start > dateTo)) return false;
      if (!query) return true;
      return [order.order_number, order.title, order.site_name, order.site_city, order.site_zone, order.project_name]
        .some((value) => value.toLowerCase().includes(query));
    });
    return result.sort((a, b) => {
      if (sortMode === "newest") return b.created_at.localeCompare(a.created_at);
      if (a.amount === null) return 1;
      if (b.amount === null) return -1;
      return sortMode === "amount_desc" ? Number(b.amount) - Number(a.amount) : Number(a.amount) - Number(b.amount);
    });
  }, [orders, search, statusFilter, installerFilter, zoneFilter, dateFrom, dateTo, sortMode]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual administra su propio estado mutable.
  const virtualizer = useVirtualizer({ count: filtered.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_HEIGHT, overscan: 12 });
  const selectClass = "h-9 rounded-lg border border-input bg-transparent px-2 text-sm";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setStatusFilter("all")} className={`rounded-full border px-3 py-1 text-xs transition-colors ${statusFilter === "all" ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`}>{t("all")} <span className="font-mono">{orders.length}</span></button>
        {STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => <button key={status} onClick={() => setStatusFilter(statusFilter === status ? "all" : status)} className={`rounded-full border px-3 py-1 text-xs transition-colors ${statusFilter === status ? "border-primary" : "bg-card hover:border-primary/40"}`} style={statusFilter === status ? { backgroundColor: ORDER_STATUS[status].bg, color: ORDER_STATUS[status].fg } : undefined}>{statusT(ORDER_STATUS[status].key)} <span className="font-mono">{counts[status]}</span></button>)}
      </div>

      <div className="mt-4 grid gap-3 rounded-lg border border-border bg-surface-sunken p-3 lg:grid-cols-[minmax(220px,1fr)_repeat(3,auto)]">
        <Input placeholder={t("search")} value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {zones.length ? <select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)} className={selectClass}><option value="all">{t("allZones")}</option>{zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select> : null}
          {(installers.length || hasUnassigned) ? <select value={installerFilter} onChange={(event) => setInstallerFilter(event.target.value)} className={selectClass}><option value="all">{t("allInstallers")}</option>{hasUnassigned ? <option value="unassigned">{t("unassigned")}</option> : null}{installers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select> : null}
          {showAmounts ? <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className={`${selectClass} col-span-2 w-fit`}><option value="newest">{t("sortNewest")}</option><option value="amount_desc">{t("sortAmountHigh")}</option><option value="amount_asc">{t("sortAmountLow")}</option></select> : null}
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"><Input className="min-w-0" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label={t("dateFrom")} /><span className="text-xs text-muted-foreground">—</span><Input className="min-w-0" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label={t("dateTo")} /></div>
        <span className="self-center font-mono text-xs text-muted-foreground">{t("resultCount", { filtered: filtered.length, total: orders.length })}</span>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card">
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {orders.length === 0 ? t("empty") : t("noMatch")}
          </p>
        ) : (
          <>
            {/* Escritorio: grilla accesible. Debajo de `md` no se renderiza —
                a 375 px una tabla de 7 columnas sólo puede verse de a pedazos. */}
            <div className="hidden md:block">
              <div className="overflow-x-auto">
                <DataGrid
                  label={ordersT("title")}
                  rowCount={filtered.length}
                  colCount={showAmounts ? 7 : 6}
                  className="min-w-[940px]"
                >
                  <DataGridHeader columns={columns} template={template} />
                  <div ref={scrollRef} className="max-h-[600px] overflow-auto">
                    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                      {virtualizer.getVirtualItems().map((virtualRow) => {
                        const order = filtered[virtualRow.index];
                        return (
                          <DataGridRow
                            key={order.id}
                            href={`/orders/${order.id}`}
                            rowIndex={virtualRow.index}
                            template={template}
                            className="absolute inset-x-0"
                            style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                          >
                            <DataGridCell colIndex={1} className="font-mono text-caption">{order.order_number}</DataGridCell>
                            <DataGridCell colIndex={2}>
                              <p className="truncate font-medium">{order.title}</p>
                              <p className="truncate text-caption text-muted-foreground">{order.site_name}{order.site_city ? ` · ${order.site_city}` : ""}</p>
                            </DataGridCell>
                            <DataGridCell colIndex={3}>
                              <p className="truncate text-muted-foreground">{order.project_name}</p>
                              <p className="truncate font-mono text-caption text-muted-foreground">{order.site_zone || "—"}</p>
                            </DataGridCell>
                            <DataGridCell colIndex={4} className="truncate text-muted-foreground">
                              {order.installer_name ?? <span className="text-caption italic opacity-60">{t("unassigned")}</span>}
                            </DataGridCell>
                            <DataGridCell colIndex={5} className="font-mono text-caption text-muted-foreground">
                              {order.scheduled_date ? format.dateTime(new Date(`${order.scheduled_date}T12:00:00`), { day: "2-digit", month: "2-digit" }) : "—"}
                            </DataGridCell>
                            {showAmounts ? (
                              <DataGridCell colIndex={6} className="font-mono text-caption">
                                {order.amount === null ? "—" : format.number(Number(order.amount), { style: "currency", currency: order.currency, maximumFractionDigits: 0 })}
                              </DataGridCell>
                            ) : null}
                            <DataGridCell colIndex={showAmounts ? 7 : 6}>
                              <StatusBadge status={order.status} kind="order" />
                            </DataGridCell>
                          </DataGridRow>
                        );
                      })}
                    </div>
                  </div>
                </DataGrid>
              </div>
            </div>

            {/* Móvil: la misma información como lista de enlaces reales. Sin
                scroll horizontal y navegable con teclado por ser <a>. */}
            <ul className="divide-y divide-border md:hidden">
              {filtered.map((order) => (
                <li key={order.id}>
                  <Link href={`/orders/${order.id}`} className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-caption text-muted-foreground">{order.order_number}</span>
                      <StatusBadge status={order.status} kind="order" />
                    </div>
                    <p className="font-medium">{order.title}</p>
                    <p className="text-caption text-muted-foreground">
                      {order.site_name}{order.site_city ? ` · ${order.site_city}` : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 text-caption text-muted-foreground">
                      <span>{order.installer_name ?? t("unassigned")}</span>
                      {order.scheduled_date ? (
                        <span className="font-mono">{format.dateTime(new Date(`${order.scheduled_date}T12:00:00`), { day: "2-digit", month: "2-digit" })}</span>
                      ) : null}
                      {showAmounts && order.amount !== null ? (
                        <span className="font-mono">{format.number(Number(order.amount), { style: "currency", currency: order.currency, maximumFractionDigits: 0 })}</span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
