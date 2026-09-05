"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { DataGrid, DataGridCell, DataGridHeader, DataGridRow } from "@/components/shared/data-grid";
import { StatusBadge } from "@/components/shared/status-badge";
import { SITE_STATUS, SITE_STATUS_ORDER } from "@/lib/domain/status";
import { Input } from "@/components/ui/input";
import type { SiteRow } from "@/lib/data/sites";
import type { SiteStatus } from "@/types/database";

const ROW_HEIGHT = 56;

export function SitesTable({ sites, projectId }: { sites: SiteRow[]; projectId: string }) {
  const t = useTranslations("SitesTable");
  const statusT = useTranslations("Status");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SiteStatus | "all">("all");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived" | "all">("active");
  const scrollRef = useRef<HTMLDivElement>(null);

  const zones = useMemo(
    () => [...new Set(sites.map((site) => site.zone).filter(Boolean))].sort(),
    [sites],
  );
  const counts = useMemo(() => {
    const base = Object.fromEntries(SITE_STATUS_ORDER.map((status) => [status, 0])) as Record<SiteStatus, number>;
    for (const site of sites) base[site.status]++;
    return base;
  }, [sites]);
  const columns = [t("site"), t("address"), t("city"), t("zone"), t("progress"), t("status")];
  const template = "1fr 1fr 130px 110px 110px 130px";

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sites.filter((site) => {
      if (statusFilter !== "all" && site.status !== statusFilter) return false;
      if (zoneFilter !== "all" && site.zone !== zoneFilter) return false;
      if (archiveFilter === "active" && site.archived_at) return false;
      if (archiveFilter === "archived" && !site.archived_at) return false;
      if (!query) return true;
      return [site.name, site.address, site.city, site.external_ref ?? ""]
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [sites, search, statusFilter, zoneFilter, archiveFilter]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual administra su propio estado mutable.
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setStatusFilter("all")} className={`rounded-full border px-3 py-1 text-xs transition-colors ${statusFilter === "all" ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`}>
          {t("all")} <span className="font-mono">{sites.length}</span>
        </button>
        {SITE_STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => (
          <button key={status} onClick={() => setStatusFilter(statusFilter === status ? "all" : status)} className={`rounded-full border px-3 py-1 text-xs transition-colors ${statusFilter === status ? "border-primary" : "bg-card hover:border-primary/40"}`} style={statusFilter === status ? { backgroundColor: SITE_STATUS[status].bg, color: SITE_STATUS[status].fg } : undefined}>
            {statusT(SITE_STATUS[status].key)} <span className="font-mono">{counts[status]}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Input placeholder={t("search")} value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-sm" />
        {zones.length > 1 ? <select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"><option value="all">{t("allZones")}</option>{zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select> : null}
        <select value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value as typeof archiveFilter)} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
          <option value="active">{t("active")}</option><option value="archived">{t("archived")}</option><option value="all">{t("activeAndArchived")}</option>
        </select>
        <span className="font-mono text-xs text-muted-foreground">{t("resultCount", { filtered: filtered.length, total: sites.length })}</span>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card">
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{sites.length === 0 ? t("empty") : t("noMatch")}</p>
        ) : (
          <>
            <div className="hidden md:block">
              <div className="overflow-x-auto">
                <DataGrid label={t("tableLabel")} rowCount={filtered.length} colCount={6} className="min-w-[860px]">
                  <DataGridHeader columns={columns} template={template} />
                  <div ref={scrollRef} className="max-h-[600px] overflow-auto">
                    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                      {virtualizer.getVirtualItems().map((virtualRow) => {
                        const site = filtered[virtualRow.index];
                        return (
                          <DataGridRow
                            key={site.id}
                            href={`/projects/${projectId}/sites/${site.id}`}
                            rowIndex={virtualRow.index}
                            template={template}
                            className={`absolute inset-x-0 ${site.archived_at ? "opacity-55" : ""}`}
                            style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                          >
                            <DataGridCell colIndex={1}>
                              <p className="truncate font-medium">{site.name}</p>
                              {site.external_ref ? <p className="truncate font-mono text-caption text-muted-foreground">{site.external_ref}</p> : null}
                            </DataGridCell>
                            <DataGridCell colIndex={2} className="truncate text-muted-foreground">{site.address || "—"}</DataGridCell>
                            <DataGridCell colIndex={3} className="truncate text-muted-foreground">{site.city || "—"}</DataGridCell>
                            <DataGridCell colIndex={4} className="truncate font-mono text-caption text-muted-foreground">{site.zone || "—"}</DataGridCell>
                            <DataGridCell colIndex={5} className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${site.progress}%` }} /></div>
                              <span className="w-9 text-right font-mono text-caption">{site.progress}%</span>
                            </DataGridCell>
                            <DataGridCell colIndex={6}><StatusBadge status={site.status} kind="site" /></DataGridCell>
                          </DataGridRow>
                        );
                      })}
                    </div>
                  </div>
                </DataGrid>
              </div>
            </div>

            <ul className="divide-y divide-border md:hidden">
              {filtered.map((site) => (
                <li key={site.id}>
                  <Link
                    href={`/projects/${projectId}/sites/${site.id}`}
                    className={`flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${site.archived_at ? "opacity-55" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{site.name}</span>
                      <StatusBadge status={site.status} kind="site" />
                    </div>
                    <p className="truncate text-caption text-muted-foreground">
                      {[site.address, site.city].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${site.progress}%` }} /></div>
                      <span className="w-9 text-right font-mono text-caption">{site.progress}%</span>
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
