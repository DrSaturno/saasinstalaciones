"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/status-badge";
import { SITE_STATUS, SITE_STATUS_ORDER } from "@/lib/domain/status";
import { Input } from "@/components/ui/input";
import type { SiteRow } from "@/lib/data/sites";
import type { SiteStatus } from "@/types/database";

const ROW_HEIGHT = 56;

export function SitesTable({ sites, projectId }: { sites: SiteRow[]; projectId: string }) {
  const t = useTranslations("SitesTable");
  const statusT = useTranslations("Status");
  const router = useRouter();
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

      <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
        <div className="grid min-w-[860px] grid-cols-[1fr_1fr_130px_110px_110px_130px] gap-4 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>{t("site")}</span><span>{t("address")}</span><span>{t("city")}</span><span>{t("zone")}</span><span>{t("progress")}</span><span>{t("status")}</span>
        </div>
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{sites.length === 0 ? t("empty") : t("noMatch")}</p>
        ) : (
          <div ref={scrollRef} className="max-h-[600px] min-w-[860px] overflow-auto">
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const site = filtered[virtualRow.index];
                return (
                  <div key={site.id} onClick={() => router.push(`/projects/${projectId}/sites/${site.id}`)} className={`absolute inset-x-0 grid cursor-pointer grid-cols-[1fr_1fr_130px_110px_110px_130px] items-center gap-4 border-b px-4 text-sm transition-colors hover:bg-muted/40 ${site.archived_at ? "opacity-55" : ""}`} style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}>
                    <div className="min-w-0"><p className="truncate font-medium">{site.name}</p>{site.external_ref ? <p className="truncate font-mono text-xs text-muted-foreground">{site.external_ref}</p> : null}</div>
                    <span className="truncate text-muted-foreground">{site.address || "—"}</span>
                    <span className="truncate text-muted-foreground">{site.city || "—"}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">{site.zone || "—"}</span>
                    <div className="flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${site.progress}%` }} /></div><span className="w-9 text-right font-mono text-xs">{site.progress}%</span></div>
                    <StatusBadge status={site.status} kind="site" />
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
