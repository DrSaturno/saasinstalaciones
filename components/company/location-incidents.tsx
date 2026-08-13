import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { RotateCcw, TriangleAlert } from "lucide-react";
import type { LocationIncidentView } from "@/lib/data/location-detail";
import { Badge } from "@/components/ui/badge";

const severityClass = {
  low: "border-muted-foreground/20 bg-muted/30 text-muted-foreground",
  medium: "border-[var(--warning)]/25 bg-[var(--warning)]/10 text-foreground",
  high: "border-destructive/25 bg-destructive/10 text-destructive",
  critical: "border-destructive bg-destructive text-destructive-foreground",
} as const;

export async function LocationIncidents({ items }: { items: LocationIncidentView[] }) {
  const [t, incidentT, format] = await Promise.all([
    getTranslations("CanonicalLocation"),
    getTranslations("OrderIncidents"),
    getFormatter(),
  ]);

  return (
    <section id="incidencias" aria-labelledby="location-incidents-title">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 grid size-8 place-items-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 id="location-incidents-title" className="text-lg font-semibold">
            {t("incidents.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("incidents.description")}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("incidents.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border bg-card p-4 [content-visibility:auto]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{incidentT(`categories.${item.category}`)}</p>
                    <Badge variant="outline" className={severityClass[item.severity]}>
                      {incidentT(`severityValues.${item.severity}`)}
                    </Badge>
                    <Badge variant={item.status === "open" ? "destructive" : "secondary"}>
                      {item.status === "open" ? t("incidents.open") : incidentT("statusResolved")}
                    </Badge>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.description}</p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {format.dateTime(new Date(item.occurred_at ?? item.created_at), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3 text-xs text-muted-foreground">
                <Link href={`/orders/${item.orderId}`} className="font-mono transition-colors hover:text-primary">
                  {item.orderNumber}
                </Link>
                {item.projectName ? <span>{item.projectName}</span> : null}
                {item.requires_revisit ? (
                  <span className="inline-flex items-center gap-1 text-foreground">
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    {incidentT("revisit")}
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
