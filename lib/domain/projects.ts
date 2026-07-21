import { z } from "zod";
import type { BillingMode, Country, OrderCurrency } from "@/types/database";

export const ARGENTINA_ZONES = ["AMBA", "Interior"] as const;

export const BRAZIL_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT",
  "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO",
  "RR", "SC", "SP", "SE", "TO",
] as const;

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
    clientName: z.string().trim().min(2).max(150),
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
