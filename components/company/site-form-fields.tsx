"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SiteFormDefaults } from "@/lib/domain/sites";
import type { Country } from "@/types/database";
import { useTranslations } from "next-intl";

const EMPTY: SiteFormDefaults = {
  name: "", externalRef: "", address: "", city: "", state: "", zone: "",
  lat: null, lng: null, contactName: "", contactPhone: "", contactEmail: "",
  openingHours: "", accessNotes: "", parkingNotes: "", technicalNotes: "",
  riskNotes: "", permanentNotes: "",
};

export function SiteFormFields({ defaults = EMPTY, zones, country, pending }: {
  defaults?: SiteFormDefaults;
  zones: string[];
  country: Country;
  pending: boolean;
}) {
  const t = useTranslations("SiteForm");
  const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <>
      <section className="space-y-4 rounded-xl border p-4">
        <h3 className="text-sm font-semibold">{t("identity")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2"><Label htmlFor="site-name">{t("name")}</Label><Input id="site-name" name="name" defaultValue={defaults.name} required disabled={pending} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="site-ref">{t("reference")}</Label><Input id="site-ref" name="externalRef" defaultValue={defaults.externalRef} disabled={pending} /></div>
          <div className="flex flex-col gap-2 sm:col-span-2"><Label htmlFor="site-address">{t("address")}</Label><Input id="site-address" name="address" defaultValue={defaults.address} disabled={pending} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="site-city">{t("city")}</Label><Input id="site-city" name="city" defaultValue={defaults.city} disabled={pending} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="site-state">{country === "BR" ? t("stateBrazil") : t("province")}</Label><Input id="site-state" name="state" defaultValue={defaults.state} disabled={pending || country === "BR"} placeholder={country === "BR" ? t("stateFromZone") : undefined} /></div>
          <div className="flex flex-col gap-2 sm:col-span-2"><Label htmlFor="site-zone">{t("zone")}</Label><select id="site-zone" name="zone" defaultValue={defaults.zone || zones[0]} className={selectClass} required disabled={pending}>{zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2"><Label htmlFor="site-lat">{t("latitude")}</Label><Input id="site-lat" name="lat" type="number" min="-90" max="90" step="any" defaultValue={defaults.lat ?? ""} disabled={pending} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="site-lng">{t("longitude")}</Label><Input id="site-lng" name="lng" type="number" min="-180" max="180" step="any" defaultValue={defaults.lng ?? ""} disabled={pending} /></div>
        </div>
        <p className="text-xs text-muted-foreground">{t("mapsHelp")}</p>
      </section>

      <section className="space-y-4 rounded-xl border p-4">
        <h3 className="text-sm font-semibold">{t("contact")}</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2"><Label htmlFor="site-contact">{t("contactName")}</Label><Input id="site-contact" name="contactName" defaultValue={defaults.contactName} disabled={pending} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="site-phone">{t("phone")}</Label><Input id="site-phone" name="contactPhone" defaultValue={defaults.contactPhone} disabled={pending} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="site-email">{t("email")}</Label><Input id="site-email" name="contactEmail" type="email" defaultValue={defaults.contactEmail} disabled={pending} /></div>
        </div>
        <div className="flex flex-col gap-2"><Label htmlFor="site-hours">{t("openingHours")}</Label><Input id="site-hours" name="openingHours" defaultValue={defaults.openingHours} placeholder={t("openingPlaceholder")} disabled={pending} /></div>
      </section>

      <section className="space-y-4 rounded-xl border p-4">
        <h3 className="text-sm font-semibold">{t("operation")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2"><Label htmlFor="site-access">{t("access")}</Label><Textarea id="site-access" name="accessNotes" rows={3} defaultValue={defaults.accessNotes} disabled={pending} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="site-parking">{t("parking")}</Label><Textarea id="site-parking" name="parkingNotes" rows={3} defaultValue={defaults.parkingNotes} disabled={pending} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="site-technical">{t("technical")}</Label><Textarea id="site-technical" name="technicalNotes" rows={3} defaultValue={defaults.technicalNotes} disabled={pending} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="site-risks">{t("risks")}</Label><Textarea id="site-risks" name="riskNotes" rows={3} defaultValue={defaults.riskNotes} disabled={pending} /></div>
        </div>
        <div className="flex flex-col gap-2"><Label htmlFor="site-notes">{t("permanentNotes")}</Label><Textarea id="site-notes" name="permanentNotes" rows={4} defaultValue={defaults.permanentNotes} disabled={pending} /></div>
      </section>
    </>
  );
}
