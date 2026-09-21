import { z } from "zod";
import { COMPLETION_PHOTOS, MONEY_MAX } from "@/lib/domain/field-rules";
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

/**
 * Límites del formulario de proyecto, compartidos con `project-form-fields`
 * para que el navegador frene exactamente lo que frena el servidor.
 */
export const PROJECT_LIMITS = {
  name: { min: 2, max: 150 },
  description: 2000,
  plannedInstallations: { min: 0, max: 100000 },
  minCompletionPhotos: COMPLETION_PHOTOS,
} as const;

// Sin techo, un importe de más de doce cifras pasaba la validación y lo
// rechazaba la columna (`numeric(14, 2)`) con un error que no decía nada.
const optionalAmount = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim().replace(",", "."))
  .refine((value) => value === "" || /^\d+(\.\d{1,2})?$/.test(value))
  .transform((value) => (value === "" ? null : Number(value)))
  .pipe(z.number().min(0).max(MONEY_MAX).nullable());

export const projectInputSchema = z
  .object({
    name: z.string().trim().min(PROJECT_LIMITS.name.min).max(PROJECT_LIMITS.name.max),
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
    description: z.string().trim().max(PROJECT_LIMITS.description),
    startsAt: optionalDate,
    endsAt: optionalDate,
    country: z.enum(["AR", "BR"]),
    zones: z.array(z.string().trim()).min(1).max(27),
    plannedInstallations: z.coerce
      .number()
      .int()
      .min(PROJECT_LIMITS.plannedInstallations.min)
      .max(PROJECT_LIMITS.plannedInstallations.max),
    billingMode: z.enum(["project", "per_installation"]),
    contractAmount: optionalAmount,
    // Override del mínimo de fotos para cerrar (FLD-R4.2). Vacío significa
    // "usá el de la empresa", que NO es lo mismo que cero: cero es una
    // decisión explícita de no pedir evidencia en este proyecto.
    minCompletionPhotos: z
      .string()
      .trim()
      .optional()
      .transform((value) => (!value ? null : Number(value)))
      .refine(
        (value) =>
          value === null ||
          (Number.isInteger(value) &&
            value >= PROJECT_LIMITS.minCompletionPhotos.min &&
            value <= PROJECT_LIMITS.minCompletionPhotos.max),
        { message: "invalidMinPhotos" },
      )
      .default(null),
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
      // «required» y no un código propio: el mensaje tiene que nombrar el
      // campo («Completá Importe total del proyecto»).
      context.addIssue({ code: "custom", path: ["contractAmount"], message: "required" });
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
  /** Null = hereda el mínimo de la empresa. Cero = este proyecto no pide fotos. */
  minCompletionPhotos: number | null;
};

export function projectCurrency(country: Country): OrderCurrency {
  return country === "BR" ? "BRL" : "ARS";
}
