import { describe, expect, it } from "vitest";
import { embeddedOrderAmount, embeddedProjectContractAmount } from "@/lib/data/pricing";

describe("importes comerciales anidados", () => {
  it("lee el importe cuando PostgREST lo entrega como objeto", () => {
    expect(embeddedOrderAmount({ work_order_pricing: { amount: 500 } })).toBe(500);
  });

  it("lee el importe cuando lo entrega como arreglo", () => {
    expect(embeddedOrderAmount({ work_order_pricing: [{ amount: 700 }] })).toBe(700);
  });

  it("acepta numeric serializado como texto", () => {
    expect(embeddedOrderAmount({ work_order_pricing: { amount: "1250.50" } })).toBe(1250.5);
  });

  it("devuelve null si no hay fila: sin importe cargado o sin permiso para verlo", () => {
    expect(embeddedOrderAmount({ work_order_pricing: null })).toBeNull();
    expect(embeddedOrderAmount({ work_order_pricing: [] })).toBeNull();
    expect(embeddedOrderAmount({})).toBeNull();
  });

  it("un cero es un importe, no la ausencia de importe", () => {
    expect(embeddedOrderAmount({ work_order_pricing: { amount: 0 } })).toBe(0);
  });

  it("mismo criterio para el monto de contrato del proyecto", () => {
    expect(embeddedProjectContractAmount({ project_pricing: { contract_amount: 9000 } })).toBe(9000);
    expect(embeddedProjectContractAmount({ project_pricing: [{ contract_amount: 9000 }] })).toBe(9000);
    expect(embeddedProjectContractAmount({ project_pricing: [] })).toBeNull();
    expect(embeddedProjectContractAmount({})).toBeNull();
  });
});
