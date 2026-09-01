import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";

import { OrderDocument, type OrderPdfData } from "@/lib/pdf/order-document";

const LABELS = Object.fromEntries(
  [
    "documentKind", "issued", "assignment", "client", "project", "installer",
    "scheduledDate", "priority", "amount", "site", "siteName", "address",
    "contact", "phone", "openingHours", "logistics", "indoor", "outdoor",
    "withFreight", "withoutFreight", "permits", "instructions", "description", "access",
    "parking", "technical", "risks", "freight", "history",
    "installerSignature", "clientSignature",
  ].map((key) => [key, key]),
);

function orden(overrides: Partial<OrderPdfData> = {}): OrderPdfData {
  return {
    orderNumber: "INT-720",
    title: "Instalación de vinilo en fachada",
    status: "planificada",
    statusLabel: "Planificada",
    priorityLabel: "Alta",
    description: "Colocar gráfica en frente y laterales.",
    scheduledDate: "1 de agosto de 2026",
    createdAt: "28/07/26",
    amount: "$ 125.000,50",
    indoor: false,
    requiresFreight: true,
    freightDetails: "Camioneta con escalera extensible.",
    company: "Gráfica Demo SA",
    project: "Renovación YPF",
    client: "YPF",
    installer: "Rogelio Instalador",
    site: {
      name: "Estación Centro",
      address: "Av. Corrientes 1234",
      city: "CABA",
      state: "Buenos Aires",
      contactName: "Marta Gómez",
      contactPhone: "11 5555-5555",
      openingHours: "Lunes a viernes de 8 a 18",
      accessNotes: "Entrar por el portón lateral.",
      parkingNotes: "Estacionar en la playa trasera.",
      technicalNotes: "Tomacorriente a 20 m.",
      riskNotes: "Trabajo en altura: usar arnés.",
    },
    history: [
      { label: "Sistema", note: "Orden creada", date: "27/07/26" },
      { label: "Relevamiento", note: "Medidas tomadas", date: "28/07/26" },
    ],
    openRequirements: [],
    labels: LABELS,
    ...overrides,
  };
}

/** El PDF se genera en el servidor: si el documento rompe, rompe en producción. */
describe("OrderDocument", () => {
  it("genera un PDF válido con la orden completa", async () => {
    const buffer = await renderToBuffer(<OrderDocument data={orden()} />);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1_000);
  });

  it("se banca una orden mínima, sin instalador ni fecha ni historial", async () => {
    const buffer = await renderToBuffer(
      <OrderDocument
        data={orden({
          description: "",
          scheduledDate: null,
          amount: null,
          installer: "",
          freightDetails: "",
          requiresFreight: false,
          indoor: true,
          history: [],
          site: {
            name: "Local sin ficha",
            address: "",
            city: "",
            state: "",
            contactName: "",
            contactPhone: "",
            openingHours: "",
            accessNotes: "",
            parkingNotes: "",
            technicalNotes: "",
            riskNotes: "",
          },
        })}
      />,
    );
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("acepta cualquier estado de la máquina", async () => {
    const buffer = await renderToBuffer(
      <OrderDocument data={orden({ status: "cancelada", statusLabel: "Cancelada" })} />,
    );
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("arma la sección de permisos cuando hay algo pendiente de gestionar", async () => {
    // Sin esto, un permiso vencido queda igual de invisible que hoy: el
    // instalador lo descubre recién al llegar al lugar.
    const buffer = await renderToBuffer(
      <OrderDocument
        data={orden({
          openRequirements: [
            { type: "Autorización de ingreso", statusLabel: "Vencido", expiresLabel: "15/1/26" },
            { type: "Registro de instaladores", statusLabel: "Pendiente", expiresLabel: null },
          ],
        })}
      />,
    );
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1_000);
  });
});
