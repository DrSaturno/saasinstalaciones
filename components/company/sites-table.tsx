"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { StatusBadge } from "@/components/shared/status-badge";
import { SITE_STATUS, SITE_STATUS_ORDER } from "@/lib/domain/status";
import { Input } from "@/components/ui/input";
import type { SiteRow } from "@/lib/data/sites";
import type { SiteStatus } from "@/types/database";

const ROW_HEIGHT = 52;

export function SitesTable({ sites }: { sites: SiteRow[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SiteStatus | "all">("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  const zones = useMemo(
    () => [...new Set(sites.map((s) => s.zone).filter(Boolean))].sort(),
    [sites],
  );

  const counts = useMemo(() => {
    const base = Object.fromEntries(
      SITE_STATUS_ORDER.map((s) => [s, 0]),
    ) as Record<SiteStatus, number>;
    for (const site of sites) base[site.status] = (base[site.status] ?? 0) + 1;
    return base;
  }, [sites]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sites.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (zoneFilter !== "all" && s.zone !== zoneFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        (s.external_ref ?? "").toLowerCase().includes(q)
      );
    });
  }, [sites, search, statusFilter, zoneFilter]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div>
      {/* Resumen por estado — el "cómo viene" de un vistazo */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            statusFilter === "all"
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-card hover:border-primary/40"
          }`}
        >
          Todos <span className="font-mono">{sites.length}</span>
        </button>
        {SITE_STATUS_ORDER.filter((s) => counts[s] > 0).map((status) => (
          <button
            key={status}
            onClick={() =>
              setStatusFilter(statusFilter === status ? "all" : status)
            }
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              statusFilter === status
                ? "border-primary"
                : "bg-card hover:border-primary/40"
            }`}
            style={
              statusFilter === status
                ? { backgroundColor: SITE_STATUS[status].bg, color: SITE_STATUS[status].fg }
                : undefined
            }
          >
            {SITE_STATUS[status].label}{" "}
            <span className="font-mono">{counts[status]}</span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por nombre, dirección, ciudad o código…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {zones.length > 1 && (
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            <option value="all">Todas las zonas</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        )}
        <span className="font-mono text-xs text-muted-foreground">
          {filtered.length} de {sites.length}
        </span>
      </div>

      {/* Tabla virtualizada: 2000+ filas sin penalizar el scroll */}
      <div className="mt-4 overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-[1fr_1fr_140px_120px_130px] gap-4 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Punto</span>
          <span>Dirección</span>
          <span>Ciudad</span>
          <span>Zona</span>
          <span>Estado</span>
        </div>

        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {sites.length === 0
              ? "Este proyecto todavía no tiene puntos. Importá un CSV para cargarlos."
              : "Ningún punto coincide con el filtro."}
          </p>
        ) : (
          <div ref={scrollRef} className="max-h-[600px] overflow-auto">
            <div
              style={{ height: virtualizer.getTotalSize(), position: "relative" }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const site = filtered[virtualRow.index];
                return (
                  <div
                    key={site.id}
                    className="absolute inset-x-0 grid grid-cols-[1fr_1fr_140px_120px_130px] items-center gap-4 border-b px-4 text-sm"
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{site.name}</p>
                      {site.external_ref && (
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {site.external_ref}
                        </p>
                      )}
                    </div>
                    <span className="truncate text-muted-foreground">
                      {site.address || "—"}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {site.city || "—"}
                    </span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {site.zone || "—"}
                    </span>
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
