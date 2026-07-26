"use client";

import { useActionState, useState } from "react";
import { MapPinned } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { saveCoverage, type CoverageState } from "@/lib/actions/availability";
import { AR_PROVINCES } from "@/lib/domain/geography";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: CoverageState = { error: null };

/**
 * Dónde trabaja el instalador. Define qué búsquedas de la bolsa le aparecen:
 * sin provincias marcadas no ve ninguna.
 */
export function CoverageSettings({
  zones,
  baseLat,
  baseLng,
  serviceRadiusKm,
}: {
  zones: string[];
  baseLat: number | null;
  baseLng: number | null;
  serviceRadiusKm: number | null;
}) {
  const t = useTranslations("Coverage");
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(zones);
  const [state, formAction, pending] = useActionState(
    async (previous: CoverageState, formData: FormData) => {
      const next = await saveCoverage(previous, formData);
      if (next.ok) {
        toast.success(t("saved"));
        router.refresh();
      }
      return next;
    },
    initial,
  );

  const toggle = (zone: string) =>
    setSelected((current) =>
      current.includes(zone) ? current.filter((item) => item !== zone) : [...current, zone],
    );

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <MapPinned className="size-4 text-primary" aria-hidden="true" />
          <CardTitle>{t("title")}</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          <fieldset disabled={pending}>
            <legend className="text-sm font-medium">{t("provinces")}</legend>
            <p className="mt-1 mb-3 text-xs text-muted-foreground">{t("provincesHelp")}</p>
            <div className="grid max-h-44 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {AR_PROVINCES.map((province) => (
                <label
                  key={province}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/60"
                >
                  <input
                    type="checkbox"
                    name="zones"
                    value={province}
                    checked={selected.includes(province)}
                    onChange={() => toggle(province)}
                    className="accent-primary"
                  />
                  {province}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="border-t pt-4">
            <p className="text-sm font-medium">{t("radiusTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("radiusHelp")}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="coverage-lat">{t("latitude")}</Label>
                <Input
                  id="coverage-lat"
                  name="baseLat"
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  defaultValue={baseLat ?? ""}
                  disabled={pending}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="coverage-lng">{t("longitude")}</Label>
                <Input
                  id="coverage-lng"
                  name="baseLng"
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  defaultValue={baseLng ?? ""}
                  disabled={pending}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="coverage-radius">{t("radiusKm")}</Label>
                <Input
                  id="coverage-radius"
                  name="serviceRadiusKm"
                  type="number"
                  min="1"
                  max="3000"
                  defaultValue={serviceRadiusKm ?? ""}
                  placeholder={t("radiusPlaceholder")}
                  disabled={pending}
                />
              </div>
            </div>
          </div>

          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="sm:self-start">
            {pending ? t("saving") : t("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
