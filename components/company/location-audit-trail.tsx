import { getFormatter, getTranslations } from "next-intl/server";
import { Activity } from "lucide-react";
import type { LocationEventView } from "@/lib/data/location-detail";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const fieldKeys = {
  external_ref: "externalRef",
  name: "name",
  address: "address",
  city: "city",
  state: "state",
  zone: "zone",
  country: "country",
  lat: "coordinates",
  lng: "coordinates",
  contact_name: "contact",
  contact_phone: "phone",
  contact_email: "email",
  opening_hours: "openingHours",
  access_notes: "access",
  parking_notes: "parking",
  technical_notes: "technical",
  risk_notes: "risks",
  permanent_notes: "notes",
  archived_at: "archivedAt",
} as const;

function eventKey(type: string): "backfilled" | "created" | "updated" | "change_proposed" | "unknown" {
  switch (type) {
    case "backfilled":
    case "created":
    case "updated":
    case "change_proposed":
      return type;
    default:
      return "unknown";
  }
}

function actorKey(context: string): "company_manager" | "coordinator" | "installer" | "system" | "migration" | "unknown" {
  switch (context) {
    case "company_manager":
    case "coordinator":
    case "installer":
    case "system":
    case "migration":
      return context;
    default:
      return "unknown";
  }
}

export async function LocationAuditTrail({ items }: { items: LocationEventView[] }) {
  const [t, format] = await Promise.all([
    getTranslations("CanonicalLocation"),
    getFormatter(),
  ]);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4 text-primary" aria-hidden="true" />
          {t("audit.title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("audit.description")}</p>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("audit.empty")}</p>
        ) : (
          <ol className="relative space-y-5 pl-5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-border">
            {items.map((item) => (
              <li key={item.id} className="relative [content-visibility:auto]">
                <span className="absolute -left-5 top-1 size-[11px] rounded-full border-[3px] border-background bg-primary" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{t(`audit.event.${eventKey(item.event_type)}`)}</p>
                  <time className="font-mono text-caption text-muted-foreground">
                    {format.dateTime(new Date(item.client_created_at ?? item.created_at), {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.actorName ?? t(`audit.actor.${actorKey(item.actor_context)}`)}
                </p>
                {item.changed_fields.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[...new Set(item.changed_fields.map((field) => fieldKeys[field as keyof typeof fieldKeys] ?? "unknown"))].map((key) => (
                      <Badge key={key} variant="outline" className="font-normal">
                        {t(`audit.field.${key}`)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {item.note ? <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{item.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
