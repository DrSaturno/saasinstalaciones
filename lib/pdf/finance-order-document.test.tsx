import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { FinanceOrderDocument, type FinanceOrderPdfData } from "@/lib/pdf/finance-order-document";

describe("FinanceOrderDocument", () => {
  it("genera un PDF legible con obligaciones, factura y pago parcial", async () => {
    const data: FinanceOrderPdfData = {
      orderNumber: "OT-TEST-001", title: "Instalación de prueba", client: "Cliente ficticio",
      site: "Sitio ficticio", zone: "AMBA", status: "Finalizada", currency: "ARS",
      clientAmount: 150000,
      entries: [{ direction: "payable", party: "Proveedor ficticio", category: "Instalación",
        amount: 60000, paid: 20000, open: 40000, due: "2026-09-28", status: "approved" }],
      invoices: [{ number: "F-TEST-001", direction: "Recibida", date: "2026-09-25", amount: 60000 }],
      transactions: [{ date: "2026-09-25", direction: "payable", party: "Proveedor ficticio",
        amount: 20000, method: "Transferencia" }],
      labels: Object.fromEntries(["title", "brand", "clientAmount", "supplierCosts", "payOpen", "collectOpen",
        "obligations", "party", "category", "amount", "paid", "open", "payable", "receivable", "noDate",
        "empty", "invoices", "emptyInvoices", "cash", "emptyCash", "footer"].map((key) => [key, key])),
    };
    const buffer = await renderToBuffer(<FinanceOrderDocument data={data} />);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(2000);
  });
});
