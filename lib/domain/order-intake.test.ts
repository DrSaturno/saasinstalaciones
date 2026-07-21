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
