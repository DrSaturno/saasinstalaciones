import type { Database } from "@/types/database";
import type { FinanceFilters } from "@/lib/data/finance-operations";
import { addFinanceDays, nextFinanceWeekday } from "@/lib/domain/finance-forecast";

export type FinanceDemoEntry = Database["public"]["Tables"]["finance_entries"]["Row"] & {
  partyName: string; orderNumber: string | null;
};

// Todos los nombres, números, importes y archivos son inventados. Nunca se escriben en la base.
export function buildFinanceDemo(today: string, filters: FinanceFilters) {
  const monday = nextFinanceWeekday(today, 1);
  const tuesday = nextFinanceWeekday(today, 2);
  const previous = addFinanceDays(today, -3);
  const make = (number: number, changes: Partial<FinanceDemoEntry>): FinanceDemoEntry => ({
    id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    company_id: "00000000-0000-4000-8000-000000000000",
    direction: "payable", order_id: null, supplier_id: null, client_id: null, project_id: null,
    category: "installation", installment: "total", zone: "amba", description: "",
    amount: 0, currency: "ARS", due_on: monday, status: "review", settled_on: null,
    source: "manual", source_key: null, created_by: null, updated_by: null,
    template_id: null, period_month: null,
    created_at: `${today}T12:00:00Z`, updated_at: `${today}T12:00:00Z`,
    partyName: "", orderNumber: null, ...changes,
  });
  const all = [
    make(1, { partyName: "Instalaciones Horizonte", orderNumber: "OT-A-2601", amount: 128000, description: "Instalación AMBA · equipo de dos personas", status: "approved" }),
    make(2, { partyName: "Coordinación Delta", orderNumber: "OT-A-2601", category: "coordination", amount: 34000, description: "Coordinación de instalación AMBA", status: "approved" }),
    make(3, { partyName: "Equipo Río Claro", orderNumber: "OT-I-2602", zone: "interior", amount: 285000, due_on: tuesday, description: "Saldo de instalación Interior", installment: "balance", status: "approved" }),
    make(4, { partyName: "Equipo Río Claro", orderNumber: "OT-I-2602", zone: "interior", amount: 95000, due_on: previous, description: "Anticipo de instalación Interior", installment: "advance", status: "settled", settled_on: previous }),
    make(5, { partyName: "Alquiler Oficina Norte", category: "fixed", installment: "recurring", zone: null, amount: 310000, due_on: addFinanceDays(today, 5), description: "Alquiler mensual", status: "approved" }),
    make(6, { partyName: "Servicios Nube Sur", category: "service", installment: "recurring", zone: null, amount: 58000, due_on: addFinanceDays(today, 8), description: "Servicio mensual de software", status: "review" }),
    make(7, { partyName: "Tienda Faro", direction: "receivable", orderNumber: "OT-A-2601", amount: 490000, due_on: addFinanceDays(today, 10), description: "Factura por instalación", status: "approved" }),
    make(8, { partyName: "Comercio Azul", direction: "receivable", orderNumber: "OT-I-2602", zone: "interior", amount: 680000, due_on: previous, settled_on: previous, description: "Cobro acreditado", status: "settled" }),
    make(9, { partyName: "Equipo Monte", orderNumber: "OT-I-2603", zone: "interior", amount: 173000, due_on: null, description: "Pendiente de finalización de OT" }),
    make(10, { partyName: "Proveedor Histórico", orderNumber: "OT-A-2509", amount: 82000, description: "Costo de referencia sin conciliar", source: "imported" }),
  ];
  const q = (filters.q ?? "").trim().toLocaleLowerCase();
  const dateKey = filters.status === "settled" ? "settled_on" : "due_on";
  const entries = all.filter((entry) =>
    (!filters.status || entry.status === filters.status) &&
    (!filters.direction || entry.direction === filters.direction) &&
    (!filters.from || !!entry[dateKey] && entry[dateKey] >= filters.from) &&
    (!filters.to || !!entry[dateKey] && entry[dateKey] <= filters.to) &&
    (!q || [entry.partyName, entry.orderNumber, entry.description].some((value) => value?.toLocaleLowerCase().includes(q)))
  );
  const documents = [
    { id: "demo-invoice-1", entry_id: all[0].id, kind: "invoice", file_name: "factura-ejemplo-amba.pdf" },
    { id: "demo-invoice-2", entry_id: all[1].id, kind: "invoice", file_name: "factura-ejemplo-coordinacion.pdf" },
    { id: "demo-invoice-3", entry_id: all[2].id, kind: "invoice", file_name: "factura-ejemplo-interior.pdf" },
    { id: "demo-invoice-4", entry_id: all[3].id, kind: "invoice", file_name: "factura-ejemplo-anticipo.pdf" },
    { id: "demo-payment-4", entry_id: all[3].id, kind: "transfer_proof", file_name: "comprobante-ejemplo.pdf" },
    { id: "demo-invoice-5", entry_id: all[4].id, kind: "invoice", file_name: "factura-ejemplo-alquiler.pdf" },
    { id: "demo-invoice-7", entry_id: all[6].id, kind: "invoice", file_name: "factura-ejemplo-cliente.pdf" },
    { id: "demo-invoice-8", entry_id: all[7].id, kind: "invoice", file_name: "factura-ejemplo-cobro.pdf" },
    { id: "demo-credit-8", entry_id: all[7].id, kind: "bank_credit", file_name: "acreditacion-ejemplo.pdf" },
  ];
  return {
    error: false as const, entries, documents,
    overview: all.filter((entry) => entry.direction === "payable" && ["review", "approved"].includes(entry.status)),
    rules: { amba_weekday: 1, interior_weekday: 2 },
    suppliers: [], clients: [], installers: [],
  };
}

