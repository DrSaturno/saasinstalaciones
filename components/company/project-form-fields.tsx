"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MONEY_MAX } from "@/lib/domain/field-rules";
import {
  ARGENTINA_ZONES,
  BRAZIL_STATES,
  PROJECT_LIMITS,
  projectCurrency,
  type ProjectFormDefaults,
} from "@/lib/domain/projects";
import { ClientDialog } from "@/components/company/client-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BillingMode, Country } from "@/types/database";

const EMPTY: ProjectFormDefaults = {
  name: "",
  clientName: "",
  clientId: "",
  coordinatorId: "",
  description: "",
  startsAt: "",
  endsAt: "",
  country: "AR",
  zones: ["Buenos Aires"],
  plannedInstallations: 0,
  billingMode: "per_installation",
  contractAmount: null,
  currency: "ARS",
  minCompletionPhotos: null,
};

/** Valor reservado de la opción «Crear cliente nuevo»: nunca es un id y nunca se envía. */
const NEW_CLIENT = "__new_client__";

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProjectFormFields({
  defaults = EMPTY,
  pending,
  clients,
  coordinators,
  canManageFinance = true,
  fixedCoordinatorId,
}: {
  defaults?: ProjectFormDefaults;
  pending: boolean;
  clients: { id: string; name: string }[];
  coordinators: { id: string; name: string }[];
  canManageFinance?: boolean;
  fixedCoordinatorId?: string;
}) {
  const t = useTranslations("CreateProject");
  // El cliente se controla acá porque «Crear cliente nuevo» tiene que poder
  // elegirlo apenas se guarda. Los recién creados se suman a la lista aunque la
  // página todavía no haya recargado la suya.
  const [clientId, setClientId] = useState(defaults.clientId);
  const [createdClients, setCreatedClients] = useState<{ id: string; name: string }[]>([]);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const clientOptions = [
    ...clients,
    ...createdClients.filter((created) => !clients.some((client) => client.id === created.id)),
  ];
  const [country, setCountry] = useState<Country>(defaults.country);
  const [billingMode, setBillingMode] = useState<BillingMode>(defaults.billingMode);
  const [zones, setZones] = useState<string[]>(defaults.zones);
  const options = country === "AR" ? ARGENTINA_ZONES : BRAZIL_STATES;
  const currency = projectCurrency(country);

  const changeCountry = (next: Country) => {
    setCountry(next);
    setZones(next === "AR" ? ["Buenos Aires"] : []);
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
          <Input id="project-name" name="name" defaultValue={defaults.name} placeholder={t("namePlaceholder")} required minLength={PROJECT_LIMITS.name.min} maxLength={PROJECT_LIMITS.name.max} disabled={pending} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-client">{t("client")}</Label>
          <select
            id="project-client"
            name="clientId"
            value={clientId}
            onChange={(event) => {
              // La opción especial abre el alta y deja elegido lo que había: si
              // se cancela, el formulario queda como estaba.
              if (event.target.value === NEW_CLIENT) setClientDialogOpen(true);
              else setClientId(event.target.value);
            }}
            className={selectClass}
            required
            disabled={pending}
          >
            <option value="">{t("selectClient")}</option>
            {clientOptions.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            {canManageFinance ? <option value={NEW_CLIENT}>{t("newClient")}</option> : null}
          </select>
          {canManageFinance ? (
            <ClientDialog
              open={clientDialogOpen}
              onOpenChange={setClientDialogOpen}
              onSaved={(created) => {
                setCreatedClients((current) => [...current, created]);
                setClientId(created.id);
              }}
            />
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="project-coordinator">{t("coordinator")}</Label>
        <select id="project-coordinator" name="coordinatorId" defaultValue={fixedCoordinatorId ?? defaults.coordinatorId} className={selectClass} disabled={pending || !canManageFinance}>
          <option value="">{t("noCoordinator")}</option>
          {coordinators.map((coordinator) => <option key={coordinator.id} value={coordinator.id}>{coordinator.name}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">
          {coordinators.length === 0 ? t("noCoordinatorsYet") : t("coordinatorOptional")}
        </p>
        {!canManageFinance ? <input type="hidden" name="coordinatorId" value={fixedCoordinatorId ?? defaults.coordinatorId} /> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {canManageFinance ? <div className="flex flex-col gap-2">
          <Label htmlFor="project-country">{t("country")}</Label>
          <select id="project-country" name="country" value={country} onChange={(event) => changeCountry(event.target.value as Country)} className={selectClass} disabled={pending}>
            <option value="AR">{t("argentina")}</option>
            <option value="BR">{t("brazil")}</option>
          </select>
        </div> : <input type="hidden" name="billingMode" value={defaults.billingMode} />}
        <div className="flex flex-col gap-2">
          <Label htmlFor="planned-installations">{t("plannedInstallations")}</Label>
          <Input id="planned-installations" name="plannedInstallations" type="number" min={PROJECT_LIMITS.plannedInstallations.min} max={PROJECT_LIMITS.plannedInstallations.max} defaultValue={defaults.plannedInstallations} required disabled={pending} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="billing-mode">{t("billingMode")}</Label>
          <select id="billing-mode" name="billingMode" value={billingMode} onChange={(event) => setBillingMode(event.target.value as BillingMode)} className={selectClass} disabled={pending}>
            <option value="project">{t("billingProject")}</option>
            <option value="per_installation">{t("billingInstallation")}</option>
          </select>
        </div>
        {/* Vacío = el mínimo de la empresa. Se deja explícito en el texto de
            ayuda porque un 0 acá significa otra cosa: no pedir fotos. */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="min-completion-photos">{t("minCompletionPhotos")}</Label>
          <Input
            id="min-completion-photos"
            name="minCompletionPhotos"
            type="number"
            min={PROJECT_LIMITS.minCompletionPhotos.min}
            max={PROJECT_LIMITS.minCompletionPhotos.max}
            placeholder={t("minCompletionPhotosPlaceholder")}
            defaultValue={defaults.minCompletionPhotos ?? ""}
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">{t("minCompletionPhotosHelp")}</p>
        </div>
      </div>

      <fieldset className="rounded-xl border p-4" disabled={pending}>
        <legend className="px-1 text-sm font-medium">{country === "AR" ? t("zonesArgentina") : t("statesBrazil")}</legend>
        <p className="mb-3 text-xs text-muted-foreground">{t("zonesHelp")}</p>
        <div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
          {options.map((zone) => (
            <label key={zone} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/60">
              <input type="checkbox" name="zones" value={zone} checked={zones.includes(zone)} onChange={() => toggleZone(zone)} className="size-4 accent-primary" />
              {zone}
            </label>
          ))}
        </div>
      </fieldset>

      {canManageFinance && billingMode === "project" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="contract-amount">{t("contractAmount")}</Label>
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center font-mono text-xs text-muted-foreground">{currency}</span>
            <Input id="contract-amount" name="contractAmount" type="number" min="0" max={MONEY_MAX} step="0.01" defaultValue={defaults.contractAmount ?? ""} className="pl-14 font-mono" required disabled={pending} />
          </div>
        </div>
      ) : <input type="hidden" name="contractAmount" value={canManageFinance ? "" : (defaults.contractAmount ?? "")} />}

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
        <Textarea id="project-description" name="description" defaultValue={defaults.description} rows={3} maxLength={PROJECT_LIMITS.description} disabled={pending} />
      </div>
    </>
  );
}
