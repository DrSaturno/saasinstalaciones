export type FinanceDemoInvoice = {
  id: string;
  number: string;
  party: string;
  direction: "issued" | "received";
  amount: number;
  orders: string[];
  status?: "registered" | "sent";
};

export const financeDemoInvoicesKey = "seinstala-finance-demo-invoices-v1";
export const financeDemoInvoicesEvent = "finance-demo-invoices";

export const financeDemoInvoiceExamples: FinanceDemoInvoice[] = [
  { id: "invoice-example-1", number: "B-0001-000126", party: "Instalaciones Horizonte", direction: "received", amount: 128000, orders: ["OT-A-2601"] },
  { id: "invoice-example-2", number: "A-0002-000037", party: "Equipo Río Claro", direction: "received", amount: 380000, orders: ["OT-I-2602", "OT-I-2603"] },
  { id: "invoice-example-3", number: "A-0001-000654", party: "Tienda Faro", direction: "issued", amount: 490000, orders: ["OT-A-2601"], status: "sent" },
  { id: "invoice-example-4", number: "A-0001-000655", party: "Comercio Azul", direction: "issued", amount: 680000, orders: ["OT-I-2602"], status: "sent" },
];

export function readFinanceDemoInvoices(): FinanceDemoInvoice[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(financeDemoInvoicesKey) ?? "[]");
    if (!Array.isArray(parsed)) return financeDemoInvoiceExamples;
    const valid = parsed.filter((row): row is FinanceDemoInvoice =>
      !!row && typeof row === "object" && typeof row.id === "string" &&
      typeof row.number === "string" && typeof row.party === "string" &&
      typeof row.amount === "number" && Number.isFinite(row.amount) &&
      Array.isArray(row.orders) && row.orders.every((order: unknown) => typeof order === "string") &&
      (row.direction === "issued" || row.direction === "received") &&
      (row.status === undefined || row.status === "registered" || row.status === "sent"));
    const savedIds = new Set(valid.map((invoice) => invoice.id));
    return [...financeDemoInvoiceExamples.filter((invoice) => !savedIds.has(invoice.id)), ...valid];
  } catch {
    return financeDemoInvoiceExamples;
  }
}

export function writeFinanceDemoInvoices(invoices: FinanceDemoInvoice[]) {
  localStorage.setItem(financeDemoInvoicesKey, JSON.stringify(invoices));
  window.dispatchEvent(new Event(financeDemoInvoicesEvent));
}
