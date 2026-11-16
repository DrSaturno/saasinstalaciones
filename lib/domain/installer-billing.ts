import { z } from "zod";

/**
 * Lo que el instalador o coordinador ve de sus pagos (FLX-20): qué tiene para
 * facturar, qué ya facturó y espera el pago, y qué cobró. Viene de
 * `finance_my_billing()`, que sólo devuelve lo suyo.
 */
const itemSchema = z.object({
  entry_id: z.string().uuid(),
  company_id: z.string().uuid(),
  company_name: z.string(),
  order_id: z.string().uuid().nullable(),
  order_number: z.string().nullable(),
  title: z.string(),
  site_name: z.string().nullable(),
  category: z.string(),
  amount: z.coerce.number(),
  currency: z.string(),
  status: z.enum(["approved", "settled"]),
  due_on: z.string().nullable(),
  settled_on: z.string().nullable(),
  paid_amount: z.coerce.number(),
  requires_invoice: z.boolean(),
  invoice: z.object({ id: z.string().uuid(), number: z.string(), issued_on: z.string(), amount: z.coerce.number() }).nullable(),
});
export type BillingItem = z.infer<typeof itemSchema>;

export function parseBilling(value: unknown): BillingItem[] {
  const parsed = z.array(itemSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export type BillingGroup = {
  companyId: string;
  companyName: string;
  /** Aprobado y sin factura: hay que facturarlo para poder cobrar. */
  toInvoice: BillingItem[];
  /** Factura cargada: espera el día de pago. */
  invoiced: BillingItem[];
  /** Cobrado. */
  paid: BillingItem[];
};

export function groupBilling(items: BillingItem[]): BillingGroup[] {
  const groups = new Map<string, BillingGroup>();
  for (const item of items) {
    const group = groups.get(item.company_id) ?? {
      companyId: item.company_id, companyName: item.company_name, toInvoice: [], invoiced: [], paid: [],
    };
    if (item.status === "settled") group.paid.push(item);
    else if (item.requires_invoice && !item.invoice) group.toInvoice.push(item);
    else group.invoiced.push(item);
    groups.set(item.company_id, group);
  }
  return [...groups.values()].sort((a, b) => a.companyName.localeCompare(b.companyName));
}

/** Total exacto (en centavos) de lo elegido para una factura. Una sola moneda, o null. */
export function invoiceTotal(items: BillingItem[]): { amount: number; currency: string } | null {
  if (!items.length || new Set(items.map((item) => item.currency)).size !== 1) return null;
  const cents = items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
  return { amount: cents / 100, currency: items[0].currency };
}

export const supplierInvoiceMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const supplierInvoiceUploadSchema = z.object({
  companyId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(255).refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
  mimeType: z.enum(supplierInvoiceMimeTypes),
  sizeBytes: z.number().int().min(1).max(10485760),
});

/** `<empresa>/supplier-invoices/<proveedor>/<factura>`: la única carpeta donde el proveedor puede escribir. */
export function supplierInvoicePath(companyId: string, userId: string, invoiceId: string): string {
  return `${companyId}/supplier-invoices/${userId}/${invoiceId}`;
}
