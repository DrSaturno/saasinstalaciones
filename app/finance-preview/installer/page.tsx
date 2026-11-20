import { notFound } from "next/navigation";
import { BillingSection } from "@/components/installer/billing-section";
import type { BillingGroup, BillingItem } from "@/lib/domain/installer-billing";

const COMPANY = "10000000-0000-4000-8000-000000000001";
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const item = (n: number, over: Partial<BillingItem>): BillingItem => ({
  entry_id: id(n), company_id: COMPANY, company_name: "GF Instalaciones", order_id: id(100 + n),
  order_number: `INT-${700 + n}`, title: "", site_name: null, category: "installation", amount: 0, currency: "ARS",
  status: "approved", due_on: null, settled_on: null, paid_amount: 0, requires_invoice: true, invoice: null, ...over,
});

/** Datos de ejemplo: dos trabajos para facturar y uno ya facturado que espera el día de pago. */
const GROUP: BillingGroup = {
  companyId: COMPANY,
  companyName: "GF Instalaciones",
  toInvoice: [
    item(6, { title: "INSTALACION CENCOMEDIA SOFTYS", site_name: "Jumbo Escalada", amount: 62500 }),
    item(15, { title: "INSTALACION LOCAL RED BULL ROSARIO", site_name: "RED BULL ROSARIO", amount: 131000 }),
  ],
  invoiced: [
    item(33, {
      title: "RELEVO SOFTYS", site_name: "JUMBO ROSARIO", amount: 35000, due_on: "2026-11-17",
      invoice: { id: id(900), number: "0003-00000412", issued_on: "2026-11-14", amount: 35000 },
    }),
  ],
  paid: [],
};

/**
 * Demostración local de «Para facturar» (perfil del instalador). Sólo en
 * desarrollo y con datos de ejemplo: no hay sesión, así que enviar la factura
 * no funciona; sirve para ver cómo se ve y cómo se usa desde el teléfono.
 */
export default function InstallerBillingPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 bg-background p-4 pb-16">
      <BillingSection groups={[GROUP]} today="2026-11-16" />
    </main>
  );
}
