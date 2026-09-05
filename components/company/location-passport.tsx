import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  Building2,
  Clock3,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { googleMapsHref } from "@/lib/domain/sites";
import type {
  CanonicalLocation,
  CanonicalLocationDetail,
} from "@/lib/data/location-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function sourceKey(source: string): "manual" | "backfill" | "import" | "opportunity" | "unknown" {
  switch (source) {
    case "manual":
    case "backfill":
    case "import":
    case "opportunity":
      return source;
    default:
      return "unknown";
  }
}

/** Cabecera-pasaporte: separa visualmente identidad permanente de actividad. */
export async function LocationPassport({
  location,
  client,
  summary,
  action,
}: {
  location: CanonicalLocation;
  client: CanonicalLocationDetail["client"];
  summary: CanonicalLocationDetail["summary"];
  action?: React.ReactNode;
}) {
  const [t, format] = await Promise.all([
    getTranslations("CanonicalLocation"),
    getFormatter(),
  ]);
  const mapsHref = googleMapsHref(location);
  const address = [location.address, location.city, location.state]
    .filter(Boolean)
    .join(", ");
  const coordinates =
    location.lat !== null && location.lng !== null
      ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
      : null;
  const metrics = [
    { label: t("metrics.projects"), value: summary.projectCount },
    { label: t("metrics.orders"), value: summary.orderCount },
    { label: t("metrics.evidence"), value: summary.evidenceCount },
    {
      label: t("metrics.incidents"),
      value: summary.openIncidentCount
        ? `${summary.openIncidentCount}/${summary.incidentCount}`
        : summary.incidentCount,
      hint: summary.openIncidentCount ? t("metrics.open") : undefined,
    },
  ];

  return (
    <header className="relative mt-5 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-premium">
      <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <div className="grid lg:grid-cols-[1fr_360px]">
        <div className="px-6 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption font-semibold uppercase tracking-[0.18em] text-primary">
              {t("eyebrow")}
            </span>
            {location.archived_at ? (
              <Badge variant="outline">{t("archived")}</Badge>
            ) : null}
            <Badge variant="secondary">
              {t(`source.${sourceKey(location.source)}`)}
            </Badge>
          </div>

          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
                {location.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                {client ? (
                  <Link
                    href={`/clients/${client.id}`}
                    className="inline-flex items-center gap-1.5 font-medium text-foreground transition-colors hover:text-primary"
                  >
                    <Building2 className="size-4" aria-hidden="true" />
                    {client.name}
                  </Link>
                ) : null}
                {location.external_ref ? (
                  <span className="font-mono">{location.external_ref}</span>
                ) : null}
                {location.zone ? <span>{location.zone}</span> : null}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {action}
              {mapsHref ? (
                <Button asChild variant="outline">
                  <a href={mapsHref} target="_blank" rel="noreferrer">
                    <MapPin aria-hidden="true" />
                    {t("openMaps")}
                    <ExternalLink aria-hidden="true" />
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="bg-background px-4 py-3">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-xl font-semibold">{metric.value}</span>
                  {metric.hint ? (
                    <span className="text-caption text-destructive">{metric.hint}</span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{metric.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t bg-primary/[0.045] px-6 py-6 lg:border-l lg:border-t-0">
          <p className="text-caption font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("identity")}
          </p>
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex gap-3">
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="font-medium">{address || t("noAddress")}</p>
                {coordinates ? (
                  <p className="mt-1 font-mono text-caption text-muted-foreground">
                    {coordinates}
                  </p>
                ) : null}
              </div>
            </div>
            {location.contact_name || location.contact_phone || location.contact_email ? (
              <div className="border-t pt-4">
                {location.contact_name ? (
                  <p className="font-medium">{location.contact_name}</p>
                ) : null}
                <div className="mt-2 flex flex-col gap-2 text-muted-foreground">
                  {location.contact_phone ? (
                    <a className="inline-flex items-center gap-2 hover:text-foreground" href={`tel:${location.contact_phone}`}>
                      <Phone className="size-3.5" aria-hidden="true" />
                      {location.contact_phone}
                    </a>
                  ) : null}
                  {location.contact_email ? (
                    <a className="inline-flex items-center gap-2 hover:text-foreground" href={`mailto:${location.contact_email}`}>
                      <Mail className="size-3.5" aria-hidden="true" />
                      {location.contact_email}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
            {location.opening_hours ? (
              <div className="flex gap-3 border-t pt-4">
                <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("openingHours")}</p>
                  <p className="mt-0.5 whitespace-pre-wrap">{location.opening_hours}</p>
                </div>
              </div>
            ) : null}
          </div>
          <p className="mt-6 border-t pt-4 font-mono text-caption uppercase tracking-wide text-muted-foreground">
            {t("updated", {
              date: format.dateTime(new Date(location.updated_at), {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </p>
        </div>
      </div>
    </header>
  );
}
