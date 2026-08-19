import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarClock, ClipboardCheck, FileText, UserRound } from "lucide-react";
import type { LocationRequirementView } from "@/lib/data/location-detail";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function requirementKey(status: string): "pending" | "valid" | "expired" | "rejected" | "not_required" | "unknown" {
  switch (status) {
    case "pending":
    case "valid":
    case "expired":
    case "rejected":
    case "not_required":
      return status;
    default:
      return "unknown";
  }
}

export async function LocationRequirements({ items }: { items: LocationRequirementView[] }) {
  const [t, format] = await Promise.all([
    getTranslations("CanonicalLocation"),
    getFormatter(),
  ]);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-primary" aria-hidden="true" />
          {t("requirements.title")}
          {items.length ? <span className="font-mono text-xs text-muted-foreground">{items.length}</span> : null}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("requirements.description")}</p>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("requirements.empty")}</p>
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              <article key={item.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{item.requirement_type}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.kind === "permit" ? t("requirements.permit") : t("requirements.requirement")}
                    </p>
                  </div>
                  <Badge variant={item.status === "rejected" || item.status === "expired" ? "destructive" : "outline"}>
                    {t(`requirements.status.${requirementKey(item.status)}`)}
                  </Badge>
                </div>
                {item.expires_on ? (
                  <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarClock className="size-3.5" aria-hidden="true" />
                    {t("requirements.expires", {
                      date: format.dateTime(new Date(`${item.expires_on}T12:00:00`), { dateStyle: "medium" }),
                    })}
                  </p>
                ) : null}
                {item.responsibleName ? (
                  <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <UserRound className="size-3.5" aria-hidden="true" />
                    {item.responsibleName}
                  </p>
                ) : null}
                {item.documentName ? (
                  <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="size-3.5" aria-hidden="true" />
                    {item.documentName}
                  </p>
                ) : null}
                {item.notes ? <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{item.notes}</p> : null}
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
