"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, MapPinned } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DashboardOverview } from "@/lib/data/dashboard";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardMap({ sites, availableInstallers }: { sites: DashboardOverview["mapSites"]; availableInstallers: number }) {
  const t = useTranslations("Dashboard");
  const [selectedId, setSelectedId] = useState(sites[0]?.orderId ?? "");
  const selected = sites.find((item) => item.orderId === selectedId) ?? sites[0];
  const query = selected ? selected.lat !== null && selected.lng !== null ? `${selected.lat},${selected.lng}` : selected.address || selected.siteName : "";
  const embed = useMemo(() => query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : "", [query]);
  const mapsUrl = query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "https://maps.google.com";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><MapPinned className="size-4 text-primary" aria-hidden="true" /><CardTitle>{t("mapTitle")}</CardTitle></div>
            <p className="mt-1 text-xs text-muted-foreground">{t("mapDescription")} · {t("mapAvailable", { count: availableInstallers })}</p>
          </div>
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">{t("openGoogleMaps")}<ExternalLink className="size-3" aria-hidden="true" /></a>
        </div>
      </CardHeader>
      {sites.length === 0 ? <CardContent><p className="py-10 text-center text-sm text-muted-foreground">{t("emptyMap")}</p></CardContent> : <CardContent className="grid gap-0 p-0 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="max-h-[390px] divide-y overflow-y-auto border-r">
          {sites.map((site) => (
            <button key={site.orderId} type="button" onClick={() => setSelectedId(site.orderId)} className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 ${selected?.orderId === site.orderId ? "bg-primary-soft/30" : ""}`}>
              <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-muted-foreground">{site.number}</span><StatusBadge status={site.status} kind="order" /></div>
              <p className="mt-1 truncate text-sm font-medium">{site.siteName}</p>
              <p className="truncate text-xs text-muted-foreground">{site.address || site.zone}</p>
            </button>
          ))}
        </div>
        <div className="relative min-h-80 bg-muted">
          {embed ? <iframe key={embed} title={t("mapTitle")} src={embed} className="absolute inset-0 size-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : null}
          {selected ? <Link href={`/orders/${selected.orderId}`} className="absolute bottom-3 left-3 rounded-lg border bg-background/95 px-3 py-2 text-xs font-medium shadow-sm backdrop-blur-sm hover:bg-background">{t("viewSelectedOrder")}</Link> : null}
        </div>
      </CardContent>}
    </Card>
  );
}
