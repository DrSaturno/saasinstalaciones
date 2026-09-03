"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/status-badge";
import { ORDER_STATUS } from "@/lib/domain/status";
import { Input } from "@/components/ui/input";
import type { AgendaActivityType, AgendaRow } from "@/lib/data/agenda";
import type { OrderStatus } from "@/types/database";

const STATUS_ORDER = Object.keys(ORDER_STATUS) as OrderStatus[];
const selectClass =
  "h-9 rounded-lg border border-input bg-transparent px-2 text-sm";

/**
 * La agenda de la empresa, filtrada en el cliente sobre el rango ya traído.
 *
 * Mismo patrón que `OrdersTable`: cambiar el rango de fecha no reinicia el
 * resto de los filtros porque todos viven en el mismo `useMemo` — es lo que
 * hace que AC-21-I ("al navegar al mes anterior, los filtros siguen
 * valiendo") se cumpla solo, sin lógica extra.
 */
export function AgendaTable({
  rows,
  defaultDateFrom,
}: {
  rows: AgendaRow[];
  defaultDateFrom: string;
}) {
  const t = useTranslations("Agenda");
  const statusT = useTranslations("Status");
  const format = useFormatter();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [installerFilter, setInstallerFilter] = useState("all");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<AgendaActivityType | "all">("all");
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState("");

  const installers = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.installerId && row.installerName) map.set(row.installerId, row.installerName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const hasUnassigned = useMemo(() => rows.some((row) => !row.installerId), [rows]);
  const zones = useMemo(
    () => [...new Set(rows.map((row) => row.siteZone).filter(Boolean))].sort(),
    [rows],
  );
  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.projectId, row.projectName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const counts = useMemo(() => {
    const base = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0])) as Record<
      OrderStatus,
      number
    >;
    for (const row of rows) base[row.orderStatus]++;
    return base;
  }, [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.orderStatus !== statusFilter) return false;
      if (zoneFilter !== "all" && row.siteZone !== zoneFilter) return false;
      if (projectFilter !== "all" && row.projectId !== projectFilter) return false;
      if (typeFilter !== "all" && row.activityType !== typeFilter) return false;
      if (installerFilter === "unassigned" && row.installerId) return false;
      if (
        installerFilter !== "all" &&
        installerFilter !== "unassigned" &&
        row.installerId !== installerFilter
      )
        return false;
      if (dateFrom && row.date < dateFrom) return false;
      if (dateTo && row.date > dateTo) return false;
      if (!query) return true;
      return [row.orderNumber, row.orderTitle, row.siteName, row.siteCity, row.projectName].some(
        (value) => value.toLowerCase().includes(query),
      );
    });
  }, [rows, search, statusFilter, installerFilter, zoneFilter, projectFilter, typeFilter, dateFrom, dateTo]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${statusFilter === "all" ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`}
        >
          {t("all")} <span className="font-mono">{rows.length}</span>
        </button>
        {STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${statusFilter === status ? "border-primary" : "bg-card hover:border-primary/40"}`}
            style={
              statusFilter === status
                ? { backgroundColor: ORDER_STATUS[status].bg, color: ORDER_STATUS[status].fg }
                : undefined
            }
          >
            {statusT(ORDER_STATUS[status].key)} <span className="font-mono">{counts[status]}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 rounded-xl border bg-card p-3 lg:grid-cols-[minmax(200px,1fr)_repeat(4,auto)]">
        <Input placeholder={t("search")} value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {zones.length ? (
            <select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)} className={selectClass}>
              <option value="all">{t("allZones")}</option>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          ) : null}
          {projects.length ? (
            <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className={selectClass}>
              <option value="all">{t("allProjects")}</option>
              {projects.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {installers.length || hasUnassigned ? (
            <select value={installerFilter} onChange={(event) => setInstallerFilter(event.target.value)} className={selectClass}>
              <option value="all">{t("allInstallers")}</option>
              {hasUnassigned ? <option value="unassigned">{t("unassigned")}</option> : null}
              {installers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          ) : null}
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as AgendaActivityType | "all")} className={selectClass}>
            <option value="all">{t("allTypes")}</option>
            <option value="survey">{t("typeSurvey")}</option>
            <option value="execution">{t("typeExecution")}</option>
          </select>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <Input className="min-w-0" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label={t("dateFrom")} />
          <span className="text-xs text-muted-foreground">—</span>
          <Input className="min-w-0" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label={t("dateTo")} />
        </div>
        <span className="self-center font-mono text-xs text-muted-foreground">
          {t("resultCount", { filtered: filtered.length, total: rows.length })}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
        <div className="grid min-w-[980px] grid-cols-[130px_1fr_170px_160px_110px_130px] gap-4 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>{t("date")}</span>
          <span>{t("order")}</span>
          <span>{t("project")}</span>
          <span>{t("installer")}</span>
          <span>{t("type")}</span>
          <span>{t("status")}</span>
        </div>
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? t("empty") : t("noMatch")}
          </p>
        ) : (
          <div>
            {filtered.map((row) => (
              <div
                key={row.activityId}
                onClick={() => router.push(`/orders/${row.orderId}`)}
                className="grid min-w-[980px] cursor-pointer grid-cols-[130px_1fr_170px_160px_110px_130px] items-center gap-4 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40"
              >
                <div className="font-mono text-xs">
                  <p>{format.dateTime(new Date(`${row.date}T12:00:00`), { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                  <p className="text-muted-foreground">
                    {row.startTime ? `${row.startTime}–${row.endTime}` : t("noTime")}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    <span className="font-mono text-xs text-muted-foreground">{row.orderNumber}</span>{" "}
                    {row.orderTitle}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.siteName}
                    {row.siteCity ? ` · ${row.siteCity}` : ""}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-muted-foreground">{row.projectName}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{row.siteZone || "—"}</p>
                </div>
                <span className="truncate text-muted-foreground">
                  {row.installerName ?? <span className="text-xs italic opacity-60">{t("unassigned")}</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {row.activityType === "survey" ? t("typeSurvey") : t("typeExecution")}
                </span>
                <StatusBadge status={row.orderStatus} kind="order" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
