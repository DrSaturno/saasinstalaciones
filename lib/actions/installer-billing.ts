"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { isInstallerArea } from "@/lib/auth";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { supplierInvoiceMimeTypes, supplierInvoicePath, supplierInvoiceUploadSchema } from "@/lib/domain/installer-billing";
import { createClient } from "@/lib/supabase/server";

type Result = { error: string | null };

/** Códigos que levanta `finance_submit_my_invoice` → clave de mensaje. */
const SUBMIT_ERRORS: Record<string, string> = {
  invoice_amount_mismatch: "amountMismatch",
  entry_not_billable: "notBillable",
  invoice_number_required: "numberRequired",
  invalid_issue_date: "issueDate",
  currency_mismatch: "currencyMismatch",
  finance_denied: "denied",
  finance_invoices_received_number_idx: "numberTaken",
};

/**
 * Paso 1: reserva el lugar donde el proveedor sube su factura. La carpeta lleva
 * su propio id (sale de la sesión, nunca del formulario) y la política de
 * Storage sólo le deja escribir ahí.
 */
export async function prepareSupplierInvoiceUpload(input: unknown) {
  const t = await getTranslations("InstallerBilling.errors");
  const user = await getAuthorizedUser();
  if (!user || !isInstallerArea(user)) return { error: t("denied") };
  const parsed = supplierInvoiceUploadSchema.safeParse(input);
  if (!parsed.success) return { error: t("file") };
  const invoiceId = crypto.randomUUID();
  const path = supplierInvoicePath(parsed.data.companyId, user.id, invoiceId);
  const supabase = await createClient();
  const { data: upload, error } = await supabase.storage.from("finance-private").createSignedUploadUrl(path, { upsert: false });
  if (error || !upload) return { error: t("upload") };
  return { error: null, upload: { path, token: upload.token, invoiceId } };
}

const submitSchema = z.object({
  invoiceId: z.string().uuid(),
  companyId: z.string().uuid(),
  invoiceNumber: z.string().trim().min(1).max(100),
  issuedOn: z.iso.date(),
  amount: z.coerce.number().positive().max(999999999999.99),
  fileName: z.string().trim().min(1).max(255),
  entryIds: z.array(z.string().uuid()).min(1).max(100),
});

/**
 * Paso 2: registra la factura. La base valida todo de nuevo: que los pagos sean
 * de quien llama, estén aprobados y sin factura, y que el importe sea exactamente
 * la suma aprobada (sin IVA). Si algo falla, el archivo subido se borra.
 */
export async function submitSupplierInvoice(formData: FormData): Promise<Result> {
  const t = await getTranslations("InstallerBilling.errors");
  const user = await getAuthorizedUser();
  if (!user || !isInstallerArea(user)) return { error: t("denied") };
  let entryIds: unknown;
  try { entryIds = JSON.parse(String(formData.get("entryIds") ?? "")); } catch { return { error: t("data") }; }
  const parsed = submitSchema.safeParse({
    invoiceId: formData.get("invoiceId"), companyId: formData.get("companyId"),
    invoiceNumber: formData.get("invoiceNumber"), issuedOn: formData.get("issuedOn"),
    amount: formData.get("amount"), fileName: formData.get("fileName"), entryIds,
  });
  if (!parsed.success) return { error: t("data") };
  const data = parsed.data;
  const path = supplierInvoicePath(data.companyId, user.id, data.invoiceId);
  const supabase = await createClient();

  // El archivo tiene que existir, pesar lo permitido y ser del tipo permitido:
  // se comprueba contra lo que Storage guardó, no contra lo que dijo el navegador.
  const { data: info, error: infoError } = await supabase.storage.from("finance-private").info(path);
  const stored = z.object({ size: z.number().int().min(1).max(10485760), mime: z.enum(supplierInvoiceMimeTypes) })
    .safeParse({ size: info?.size, mime: info?.contentType });
  if (infoError || !stored.success) {
    await supabase.storage.from("finance-private").remove([path]);
    return { error: t("file") };
  }

  const { error } = await supabase.rpc("finance_submit_my_invoice", {
    p_id: data.invoiceId, p_company_id: data.companyId, p_invoice_number: data.invoiceNumber,
    p_issued_on: data.issuedOn, p_amount: Math.round(data.amount * 100) / 100,
    p_storage_path: path, p_file_name: data.fileName, p_entry_ids: data.entryIds,
  });
  if (error) {
    await supabase.storage.from("finance-private").remove([path]);
    const code = Object.keys(SUBMIT_ERRORS).find((key) => error.message.includes(key));
    return { error: t((code ? SUBMIT_ERRORS[code] : "save") as "save") };
  }
  revalidatePath("/earnings");
  return { error: null };
}
