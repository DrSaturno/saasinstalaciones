import { getTranslations } from "next-intl/server";
import { KeyRound, NotebookText, ParkingCircle, ShieldAlert, Wrench } from "lucide-react";
import type { CanonicalLocation } from "@/lib/data/location-detail";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function LocationConditions({ location }: { location: CanonicalLocation }) {
  const t = await getTranslations("CanonicalLocation");
  const items = [
    { key: "access", value: location.access_notes, icon: KeyRound },
    { key: "parking", value: location.parking_notes, icon: ParkingCircle },
    { key: "technical", value: location.technical_notes, icon: Wrench },
    { key: "risks", value: location.risk_notes, icon: ShieldAlert },
    { key: "notes", value: location.permanent_notes, icon: NotebookText },
  ] as const;
  const visible = items.filter((item) => item.value.trim() !== "");

  return (
    <section aria-labelledby="location-conditions-title">
      <div className="mb-3">
        <h2 id="location-conditions-title" className="text-lg font-semibold">
          {t("conditions.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("conditions.description")}</p>
      </div>
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          {t("conditions.empty")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.key} className={item.key === "notes" ? "sm:col-span-2" : undefined}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon className="size-4 text-primary" aria-hidden="true" />
                    {t(`conditions.${item.key}`)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {item.value}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
