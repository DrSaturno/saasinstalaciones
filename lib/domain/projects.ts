import { z } from "zod";
import { AR_PROVINCES, BR_STATES } from "@/lib/domain/geography";
import type { BillingMode, Country, OrderCurrency } from "@/types/database";

// Fuente única de la taxonomía en lib/domain/geography.ts. Se re-exportan con los
// nombres históricos para no tocar los consumidores existentes.
export const ARGENTINA_ZONES = AR_PROVINCES;
export const BRAZIL_STATES = BR_STATES;

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value))
  .transform((value) => value || null);

const optionalAmount = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim().replace(",", "."))
  .refine((value) => value === "" || /^\d+(\.\d{1,2})?$/.test(value))
  .transform((value) => (value === "" ? null : Number(value)));

export const projectInputSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    clientId: z.string().uuid(),
    // Opcional: un proyecto puede nacer sin coordinador y asignarse después.
    // La columna en la base es nullable; exigirlo acá dejaba a la empresa sin
    // poder crear proyectos cuando todavía no hay ningún coordinador cargado.
    coordinatorId: z
      .string()
      .trim()
      .transform((value) => value || null)
      .refine(
        (value) =>
          value === null ||
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            value,
          ),
        { message: "invalidCoordinator" },
      ),
    description: z.string().trim().max(2000),
    startsAt: optionalDate,
    endsAt: optionalDate,
    country: z.enum(["AR", "BR"]),
    zones: z.array(z.string().trim()).min(1).max(27),
    plannedInstallations: z.coerce.number().int().min(0).max(100000),
    billingMode: z.enum(["project", "per_installation"]),
    contractAmount: optionalAmount,
  })
  .superRefine((value, context) => {
    if (value.startsAt && value.endsAt && value.endsAt < value.startsAt) {
      context.addIssue({ code: "custom", path: ["endsAt"], message: "endBeforeStart" });
    }

    const allowed = value.country === "AR" ? ARGENTINA_ZONES : BRAZIL_STATES;
    if (value.zones.some((zone) => !(allowed as readonly string[]).includes(zone))) {
      context.addIssue({ code: "custom", path: ["zones"], message: "invalidZone" });
    }

    if (value.billingMode === "project" && value.contractAmount === null) {
      context.addIssue({ code: "custom", path: ["contractAmount"], message: "amountRequired" });
    }
  });

export type ProjectInput = z.infer<typeof projectInputSchema>;

export type ProjectFormDefaults = {
  name: string;
  clientName: string;
  clientId: string;
  coordinatorId: string;
  description: string;
  startsAt: string;
  endsAt: string;
  country: Country;
  zones: string[];
  plannedInstallations: number;
  billingMode: BillingMode;
  contractAmount: number | null;
  currency: OrderCurrency;
};

export function projectCurrency(country: Country): OrderCurrency {
  return country === "BR" ? "BRL" : "ARS";
}
