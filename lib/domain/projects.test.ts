import { describe, expect, it } from "vitest";
import { projectCurrency, projectInputSchema } from "@/lib/domain/projects";

const base = {
  name: "Campaña nacional",
  clientName: "Cliente SA",
  description: "",
  startsAt: "2026-08-01",
  endsAt: "2026-09-01",
  country: "AR",
  zones: ["AMBA", "Interior"],
  plannedInstallations: 50,
  billingMode: "per_installation",
  contractAmount: "",
} as const;

describe("projectInputSchema", () => {
  it("acepta proyectos argentinos multizona", () => {
    expect(projectInputSchema.safeParse(base).success).toBe(true);
  });

  it("exige importe cuando se cobra por proyecto", () => {
    const result = projectInputSchema.safeParse({
      ...base,
      billingMode: "project",
    });
    expect(result.success).toBe(false);
  });

  it("acepta varios estados brasileños", () => {
    const result = projectInputSchema.safeParse({
      ...base,
      country: "BR",
      zones: ["SP", "RJ", "MG"],
      billingMode: "project",
      contractAmount: "150000.50",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza una zona que no corresponde al país", () => {
    expect(
      projectInputSchema.safeParse({ ...base, country: "BR", zones: ["AMBA"] }).success,
    ).toBe(false);
  });
});

describe("projectCurrency", () => {
  it("deriva la moneda por país", () => {
    expect(projectCurrency("AR")).toBe("ARS");
    expect(projectCurrency("BR")).toBe("BRL");
  });
});
