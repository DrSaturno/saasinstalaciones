import { describe, expect, it } from "vitest";
import { z } from "zod";
import { firstFieldProblem } from "@/lib/domain/field-errors";
import { MONEY_MAX, optionalEmail, requiredEmail } from "@/lib/domain/field-rules";

function problemOf(schema: z.ZodType, value: unknown) {
  const parsed = schema.safeParse(value);
  if (parsed.success) throw new Error("se esperaba que la validación fallara");
  return firstFieldProblem(parsed.error);
}

describe("firstFieldProblem", () => {
  it("nombra el campo y el máximo cuando un texto se pasa", () => {
    const schema = z.object({ name: z.string().trim().min(2).max(10) });
    expect(problemOf(schema, { name: "x".repeat(11) })).toEqual({
      field: "name",
      reason: "tooLong",
      max: 10,
    });
  });

  it("distingue «falta» de «muy corto»", () => {
    const schema = z.object({ a: z.string().min(1), b: z.string().min(2) });
    expect(problemOf(schema, { a: "", b: "ok" })).toEqual({ field: "a", reason: "required" });
    expect(problemOf(schema, { a: "ok", b: "x" })).toEqual({ field: "b", reason: "tooShort", min: 2 });
  });

  it("un campo que no vino en el formulario cuenta como faltante", () => {
    const schema = z.object({ name: z.string() });
    expect(problemOf(schema, { name: null })).toEqual({ field: "name", reason: "required" });
  });

  it("reconoce un email obligatorio mal escrito", () => {
    expect(problemOf(z.object({ email: requiredEmail() }), { email: "no-es-email" })).toEqual({
      field: "email",
      reason: "invalidEmail",
    });
  });

  it("y uno opcional, que acepta vacío pero no cualquier cosa", () => {
    const schema = z.object({ contactEmail: optionalEmail() });
    expect(schema.safeParse({ contactEmail: "" }).success).toBe(true);
    expect(problemOf(schema, { contactEmail: "juan@" })).toEqual({
      field: "contactEmail",
      reason: "invalidEmail",
    });
  });

  it("dentro de una unión con vacío, reporta la rama que el usuario quiso llenar", () => {
    // `"" | monto` es la forma de los montos opcionales. Sin elegir la rama,
    // el error sólo diría «no encajó en ninguna opción».
    const amount = z.union([z.literal(""), z.coerce.number().finite().min(0).max(MONEY_MAX)]);
    const schema = z.object({ amount });
    expect(problemOf(schema, { amount: "9".repeat(15) })).toEqual({
      field: "amount",
      reason: "outOfRange",
      min: null,
      max: MONEY_MAX,
    });
    expect(problemOf(schema, { amount: "-1" })).toEqual({
      field: "amount",
      reason: "outOfRange",
      min: 0,
      max: null,
    });
  });

  it("un número que no se puede leer es «tiene que ser un número»", () => {
    const schema = z.object({ slots: z.coerce.number().int().min(1) });
    expect(problemOf(schema, { slots: "muchos" })).toEqual({ field: "slots", reason: "invalidNumber" });
  });

  it("traduce las reglas entre campos por su nombre", () => {
    const schema = z
      .object({ start: z.string(), end: z.string() })
      .refine((value) => value.end >= value.start, { path: ["end"], message: "endBeforeStart" });
    expect(problemOf(schema, { start: "2026-09-10", end: "2026-09-01" })).toEqual({
      field: "end",
      reason: "rule",
      rule: "endBeforeStart",
    });
  });

  it("una regla sin nombre conocido no inventa un motivo", () => {
    const schema = z.object({ x: z.string() }).refine(() => false, { path: ["x"], message: "otra cosa" });
    expect(problemOf(schema, { x: "a" })).toEqual({ field: "x", reason: "invalid" });
  });
});
