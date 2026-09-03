import { describe, expect, it } from "vitest";
import {
  isAcceptedOrderFile,
  MAX_ORDER_ATTACHMENT_BYTES,
  orderAttachmentRegistrationSchema,
  orderIntakeSchema,
} from "@/lib/domain/order-intake";

const valid = {
  siteId: "22222222-2222-2222-2222-222222222222",
  title: "Instalación de marquesina",
  description: "",
  status: "planificada",
  scheduledDate: "2026-08-10",
  scheduledEndDate: "2026-08-11",
  priority: "alta",
  indoor: false,
  requiresFreight: true,
  freightDetails: "Retiro desde depósito central",
  logisticsNotes: "Requiere elevador",
  amount: "125000.50",
  installerId: "a0000000-0000-4000-8000-000000000003",
};

describe("orderIntakeSchema", () => {
  it("normaliza una ficha completa", () => {
    const result = orderIntakeSchema.parse(valid);
    expect(result.amount).toBe(125000.5);
    expect(result.scheduledEndDate).toBe("2026-08-11");
  });

  it("acepta importe, fechas e instalador vacíos", () => {
    const result = orderIntakeSchema.parse({
      ...valid,
      amount: "",
      scheduledDate: "",
      scheduledEndDate: "",
      installerId: "",
      requiresFreight: false,
      freightDetails: "",
    });
    expect(result.amount).toBeNull();
    expect(result.installerId).toBeNull();
  });

  it("rechaza una fecha final anterior al inicio", () => {
    const result = orderIntakeSchema.safeParse({
      ...valid,
      scheduledEndDate: "2026-08-09",
    });
    expect(result.success).toBe(false);
  });

  it("exige instrucciones cuando la orden requiere flete", () => {
    const result = orderIntakeSchema.safeParse({ ...valid, freightDetails: "" });
    expect(result.success).toBe(false);
  });
});

describe("adjuntos de la ficha", () => {
  it("acepta imágenes y PDF dentro del límite", () => {
    expect(isAcceptedOrderFile({ type: "image/jpeg", size: 2_048 })).toBe(true);
    expect(isAcceptedOrderFile({ type: "application/pdf", size: 4_096 })).toBe(true);
  });

  it("rechaza ejecutables y archivos mayores a 10 MB", () => {
    expect(isAcceptedOrderFile({ type: "application/x-msdownload", size: 100 })).toBe(false);
    expect(
      isAcceptedOrderFile({
        type: "image/png",
        size: MAX_ORDER_ATTACHMENT_BYTES + 1,
      }),
    ).toBe(false);
  });

  it("limita el registro a diez adjuntos", () => {
    const attachment = {
      storagePath: "company/order/file.pdf",
      fileName: "plano.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2_048,
    };
    expect(
      orderAttachmentRegistrationSchema.safeParse(
        Array.from({ length: 11 }, () => attachment),
      ).success,
    ).toBe(false);
  });
});

describe("horarios de la orden", () => {
  const base = {
    siteId: "11111111-1111-4111-8111-111111111111",
    title: "Cartel de frente",
    scheduledDate: "2026-09-10",
    scheduledEndDate: "",
    amount: "",
    installerAmount: "",
    installerId: "",
  };

  it("acepta inicio y fin", () => {
    const parsed = orderIntakeSchema.parse({
      ...base,
      scheduledStartTime: "14:00",
      scheduledEndTime: "18:00",
    });
    expect(parsed.scheduledStartTime).toBe("14:00");
    expect(parsed.scheduledEndTime).toBe("18:00");
  });

  it("sin horario, los campos quedan en null y no en cadena vacía", () => {
    // `null` es «no se cargó». Una cadena vacía viajando hasta la base sería
    // una hora inventada esperando a fallar.
    const parsed = orderIntakeSchema.parse(base);
    expect(parsed.scheduledStartTime).toBeNull();
    expect(parsed.scheduledEndTime).toBeNull();
    expect(parsed.estimatedDurationMinutes).toBeNull();
  });

  it("rechaza una hora que no existe en el reloj", () => {
    expect(() =>
      orderIntakeSchema.parse({ ...base, scheduledStartTime: "25:00" }),
    ).toThrow();
  });

  it("acepta la duración estimada como entero de minutos", () => {
    const parsed = orderIntakeSchema.parse({
      ...base,
      scheduledStartTime: "09:00",
      estimatedDurationMinutes: "240",
    });
    expect(parsed.estimatedDurationMinutes).toBe(240);
  });

  it("rechaza una duración de cero o negativa", () => {
    for (const value of ["0", "-30"]) {
      expect(() =>
        orderIntakeSchema.parse({ ...base, estimatedDurationMinutes: value }),
      ).toThrow();
    }
  });
});
