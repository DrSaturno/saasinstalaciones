"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export type BatchSite = {
  id: string;
  name: string;
  city: string;
  /** Ya tiene al menos una orden: si entra, es una segunda vuelta. */
  hasOrder: boolean;
};

/**
 * Elegir sobre qué locaciones se generan las órdenes.
 *
 * El control «Todas» no es una comodidad: sin él, generar en 200 locales
 * obliga a tildar 200 casilleros, que es exactamente el trabajo manual que
 * esta pantalla viene a eliminar.
 *
 * Cada fila dice si la locación ya tiene orden, porque es el dato que
 * distingue terminar de cargar un proyecto de mandar a rehacer todo.
 */
export function OrderBatchSitePicker({
  sites,
  selected,
  onChange,
  disabled,
}: {
  sites: BatchSite[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("CreateOrders");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sites;
    return sites.filter(
      (site) =>
        site.name.toLowerCase().includes(needle) ||
        site.city.toLowerCase().includes(needle),
    );
  }, [sites, query]);

  // «Todas» actúa sobre lo que se está viendo: con un filtro puesto, tildar
  // todas y que entren 200 invisibles sería una trampa.
  const allVisibleSelected = visible.length > 0 && visible.every((s) => selected.has(s.id));

  const toggleAllVisible = () => {
    const next = new Set(selected);
    if (allVisibleSelected) for (const site of visible) next.delete(site.id);
    else for (const site of visible) next.add(site.id);
    onChange(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchSites")}
            className="pl-8"
            disabled={disabled}
            aria-label={t("searchSites")}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAllVisible}
            className="size-4 accent-primary"
            disabled={disabled || visible.length === 0}
          />
          {t("selectAll")}
        </label>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-xl border">
        {visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("noSitesMatch")}</p>
        ) : (
          <ul className="divide-y">
            {visible.map((site) => (
              <li key={site.id}>
                <label className="flex cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-muted/40">
                  <input
                    type="checkbox"
                    name="siteIds"
                    value={site.id}
                    checked={selected.has(site.id)}
                    onChange={() => toggleOne(site.id)}
                    className="size-4 shrink-0 accent-primary"
                    disabled={disabled}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{site.name}</span>
                    {site.city ? (
                      <span className="block truncate text-xs text-muted-foreground">{site.city}</span>
                    ) : null}
                  </span>
                  {site.hasOrder ? (
                    <Badge variant="outline" className="shrink-0">{t("alreadyHasOrder")}</Badge>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {t("selectedCount", { count: selected.size, total: sites.length })}
      </p>
    </div>
  );
}
