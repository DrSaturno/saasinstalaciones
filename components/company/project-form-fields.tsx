"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ARGENTINA_ZONES,
  BRAZIL_STATES,
  projectCurrency,
  type ProjectFormDefaults,
} from "@/lib/domain/projects";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BillingMode, Country } from "@/types/database";

const EMPTY: ProjectFormDefaults = {
  name: "",
  clientName: "",
  description: "",
  startsAt: "",
  endsAt: "",
  country: "AR",
  zones: ["AMBA"],
  plannedInstallations: 0,
  billingMode: "per_installation",
  contractAmount: null,
  currency: "ARS",
};

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProjectFormFields({
  defaults = EMPTY,
  pending,
}: {
  defaults?: ProjectFormDefaults;
  pending: boolean;
}) {
  const t = useTranslations("CreateProject");
  const [country, setCountry] = useState<Country>(defaults.country);
  const [billingMode, setBillingMode] = useState<BillingMode>(defaults.billingMode);
  const [zones, setZones] = useState<string[]>(defaults.zones);
  const options = country === "AR" ? ARGENTINA_ZONES : BRAZIL_STATES;
  const currency = projectCurrency(country);

  const changeCountry = (next: Country) => {
    setCountry(next);
    setZones(next === "AR" ? ["AMBA"] : []);
  };

  const toggleZone = (zone: string) => {
    setZones((current) =>
      current.includes(zone) ? current.filter((item) => item !== zone) : [...current, zone],
    );
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-name">{t("name")}</Label>
          <Input id="project-name" name="name" defaultValue={defaults.name} placeholder={t("namePlaceholder")} required disabled={pending} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-client">{t("client")}</Label>
          <Input id="project-client" name="clientName" defaultValue={defaults.clientName} placeholder={t("clientPlaceholder")} required disabled={pending} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-country">{t("country")}</Label>
          <select id="project-country" name="country" value={country} onChange={(event) => changeCountry(event.target.value as Country)} className={selectClass} disabled={pending}>
            <option value="AR">{t("argentina")}</option>
            <option value="BR">{t("brazil")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="planned-installations">{t("plannedInstallations")}</Label>
          <Input id="planned-installations" name="plannedInstallations" type="number" min="0" max="100000" defaultValue={defaults.plannedInstallations} required disabled={pending} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="billing-mode">{t("billingMode")}</Label>
          <select id="billing-mode" name="billingMode" value={billingMode} onChange={(event) => setBillingMode(event.target.value as BillingMode)} className={selectClass} disabled={pending}>
            <option value="project">{t("billingProject")}</option>
            <option value="per_installation">{t("billingInstallation")}</option>
          </select>
        </div>
      </div>

      <fieldset className="rounded-xl border p-4" disabled={pending}>
        <legend className="px-1 text-sm font-medium">{country === "AR" ? t("zonesArgentina") : t("statesBrazil")}</legend>
        <p className="mb-3 text-xs text-muted-foreground">{t("zonesHelp")}</p>
        <div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
          {options.map((zone) => (
            <label key={zone} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/60">
              <input type="checkbox" name="zones" value={zone} checked={zones.includes(zone)} onChange={() => toggleZone(zone)} className="accent-primary" />
              {zone}
            </label>
          ))}
        </div>
      </fieldset>

      {billingMode === "project" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="contract-amount">{t("contractAmount")}</Label>
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center font-mono text-xs text-muted-foreground">{currency}</span>
            <Input id="contract-amount" name="contractAmount" type="number" min="0" step="0.01" defaultValue={defaults.contractAmount ?? ""} className="pl-14 font-mono" required disabled={pending} />
          </div>
        </div>
      ) : <input type="hidden" name="contractAmount" value="" />}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-start">{t("start")}</Label>
          <Input id="project-start" name="startsAt" type="date" defaultValue={defaults.startsAt} disabled={pending} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-end">{t("end")}</Label>
          <Input id="project-end" name="endsAt" type="date" defaultValue={defaults.endsAt} disabled={pending} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="project-description">{t("projectDescription")}</Label>
        <Textarea id="project-description" name="description" defaultValue={defaults.description} rows={3} disabled={pending} />
      </div>
    </>
  );
}
