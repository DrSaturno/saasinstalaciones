"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { createClient } from "@/lib/supabase/server";
import { countryTimezone } from "@/lib/domain/availability";
import { financeBusinessDate } from "@/lib/domain/finance-business-date";

import { verifyFinanceUpload } from "@/lib/data/finance-upload";

type Result = { error: string | null };

async function financeContext() {
  const user = await getAuthorizedUser();
  if (user?.role !== "company_manager" || !user.companyId ||
      ("canManageFinance" in user && !user.canManageFinance)) return null;
  return { user, supabase: await createClient() };
}

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  kind: z.enum(["installer", "coordinator", "logistics", "service", "employee", "other"]),
  taxId: z.string().trim().max(40).default(""),
  installerId: z.string().uuid().optional(),
});

export async function createFinanceSupplier(formData: FormData): Promise<Result> {
  const t = await getTranslations("FinanceOperations.errors");
  const context = await financeContext();
  if (!context) return { error: t("denied") };
  const parsed = supplierSchema.safeParse({
    name: formData.get("name"), kind: formData.get("kind"), taxId: formData.get("taxId"),
    installerId: String(formData.get("installerId") ?? "").trim() || undefined,
  });
  if (!parsed.success) return { error: t("supplierData") };
  if (parsed.data.installerId) {
    if (!(["installer", "coordinator"] as string[]).includes(parsed.data.kind)) return { error: t("supplierData") };
    const { data: membership } = await context.supabase.from("company_installers").select("installer_id")
      .eq("company_id", context.user.companyId!).eq("installer_id", parsed.data.installerId)
      .eq("status", "active").maybeSingle();
    if (!membership) return { error: t("rosterMissing") };
  }
  const { error } = await context.supabase.from("finance_suppliers").insert({
    company_id: context.user.companyId!, name: parsed.data.name,
    kind: parsed.data.kind, tax_id: parsed.data.taxId,
    installer_id: parsed.data.installerId ?? null,
  });
  if (error) return { error: t("supplierSave") };
  revalidatePath("/finance/operations");
  revalidatePath("/finance/expenses");
  revalidatePath("/finance/invoices");
  const orderId = String(formData.get("orderId") ?? "");
  if (z.string().uuid().safeParse(orderId).success) revalidatePath(`/finance/orders/${orderId}`);
  return { error: null };
}

export async function updateFinancePaymentRules(formData: FormData): Promise<Result> {
  const t = await getTranslations("FinanceOperations.errors");
  const context = await financeContext();
  if (!context) return { error: t("denied") };
  const parsed = z.object({
    amba: z.coerce.number().int().min(1).max(7),
    interior: z.coerce.number().int().min(1).max(7),
  }).safeParse({ amba: formData.get("amba"), interior: formData.get("interior") });
  if (!parsed.success) return { error: t("weekdays") };
  const { error } = await context.supabase.from("finance_payment_rules").upsert({
    company_id: context.user.companyId!, amba_weekday: parsed.data.amba,
    interior_weekday: parsed.data.interior, updated_at: new Date().toISOString(),
  });
  if (error) return { error: t("rulesSave") };
  revalidatePath("/finance/operations");
  revalidatePath("/finance", "layout");
  return { error: null };
}

const entrySchema = z.object({
  direction: z.enum(["payable", "receivable"]),
  supplierId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  orderNumber: z.string().trim().max(50).optional(),
  category: z.enum(["installation", "coordination", "logistics", "fixed", "payroll", "variable", "service", "motorcycle", "travel", "daily", "other"]),
  installment: z.enum(["advance", "balance", "total", "recurring"]),
  zone: z.enum(["amba", "interior"]).optional(),
  description: z.string().trim().max(500),
  amount: z.coerce.number().positive().max(999999999999.99),
  currency: z.enum(["ARS", "BRL"]),
  dueOn: z.iso.date().optional(),
});

export async function createFinanceEntry(formData: FormData): Promise<Result> {
  const t = await getTranslations("FinanceOperations.errors");
  const context = await financeContext();
  if (!context) return { error: t("denied") };
  const optional = (name: string) => String(formData.get(name) ?? "").trim() || undefined;
  const parsed = entrySchema.safeParse({
    direction: formData.get("direction"), supplierId: optional("supplierId"),
    clientId: optional("clientId"), orderNumber: optional("orderNumber"),
    category: formData.get("category"), installment: formData.get("installment"),
    zone: optional("zone"), description: formData.get("description"),
    amount: formData.get("amount"), currency: formData.get("currency"), dueOn: optional("dueOn"),
  });
  if (!parsed.success) return { error: t("entryData") };
  const data = parsed.data;
  if (data.direction === "payable" && !data.supplierId) return { error: t("supplierRequired") };
  if (data.direction === "receivable" && !data.clientId) return { error: t("clientRequired") };
  if (data.installment === "advance" && !data.dueOn) return { error: t("advanceDate") };
  let orderId: string | null = null;
  let zone = data.zone ?? null;
  if (data.orderNumber) {
    const { data: order, error } = await context.supabase.from("work_orders")
      .select("id, currency, project_id, site_id").eq("company_id", context.user.companyId!)
      .eq("order_number", data.orderNumber).maybeSingle();
    if (error || !order) return { error: t("orderMissing") };
    if (order.currency !== data.currency) return { error: t("currencyMismatch") };
    if (data.direction === "payable") {
      const { data: site } = await context.supabase.from("sites").select("zone,state,city")
        .eq("company_id", context.user.companyId!).eq("id", order.site_id).maybeSingle();
      if (!site) return { error: t("orderMissing") };
      // Misma clasificación que usan los sincronizadores: provincia + ciudad.
      const { data: classified } = await context.supabase.rpc("finance_classify_zone", {
        p_state: site.state ?? "", p_city: site.city ?? "", p_zone: site.zone ?? "",
      });
      const actualZone = classified === "amba" ? "amba" : "interior";
      if (zone && zone !== actualZone) return { error: t("zoneMismatch") };
      zone = actualZone;
    }
    if (data.direction === "receivable") {
      const { data: project } = await context.supabase.from("projects").select("client_id")
        .eq("id", order.project_id).eq("company_id", context.user.companyId!).maybeSingle();
      if (project?.client_id && project.client_id !== data.clientId) return { error: t("clientMismatch") };
    }
    orderId = order.id;
  }
  const { error } = await context.supabase.from("finance_entries").insert({
    company_id: context.user.companyId!, direction: data.direction, order_id: orderId,
    supplier_id: data.direction === "payable" ? data.supplierId : null,
    client_id: data.direction === "receivable" ? data.clientId : null,
    category: data.category, installment: data.installment, zone,
    description: data.description, amount: Math.round(data.amount * 100) / 100,
    currency: data.currency, due_on: data.dueOn ?? null, created_by: context.user.id,
  });
  if (error) return { error: t("entrySave") };
  revalidatePath("/finance/operations");
  revalidatePath("/finance", "layout");
  revalidatePath("/finance/expenses");
  revalidatePath("/finance/invoices");
  revalidatePath("/finance/orders");
  if (orderId) revalidatePath(`/finance/orders/${orderId}`);
  return { error: null };
}

export async function changeFinanceEntryStatus(id: string, status: "approved" | "void"): Promise<Result> {
  const t = await getTranslations("FinanceOperations.errors");
  const context = await financeContext();
  if (!context || !z.string().uuid().safeParse(id).success ||
      !z.enum(["approved", "void"]).safeParse(status).success) return { error: t("denied") };
  const { error, data } = await context.supabase.from("finance_entries")
    .update({ status, updated_by: context.user.id })
    .eq("id", id).eq("company_id", context.user.companyId!)
    .select("id,order_id").maybeSingle();
  if (error?.message.includes("approval_owner_only")) return { error: t("ownerApproves") };
  if (error?.message.includes("order_completion_required")) return { error: t("orderNotFinished") };
  if (error || !data) return { error: t("statusChange") };
  revalidatePath("/finance/operations");
  revalidatePath("/finance", "layout");
  revalidatePath("/finance/expenses");
  if (data.order_id) revalidatePath(`/finance/orders/${data.order_id}`);
  return { error: null };
}

export async function registerFinanceTransaction(formData: FormData): Promise<Result> {
  const t = await getTranslations("FinanceOperations.errors");
  const context = await financeContext();
  if (!context) return { error: t("denied") };
  const parsed = z.object({
    entryId: z.string().uuid(), requestId: z.string().uuid(),
    amount: z.coerce.number().positive().max(999999999999.99),
    occurredOn: z.iso.date(),
    method: z.enum(["transfer", "cash"]),
    reference: z.string().trim().max(160),
    proofDocumentId: z.string().uuid().optional(),
  }).safeParse({
    entryId: formData.get("entryId"), requestId: formData.get("requestId"), amount: formData.get("amount"),
    occurredOn: formData.get("occurredOn"), method: formData.get("method"),
    reference: formData.get("reference") ?? "",
    proofDocumentId: String(formData.get("proofDocumentId") ?? "").trim() || undefined,
  });
  if (!parsed.success) return { error: t("transactionData") };
  const { data: company } = await context.supabase.from("companies").select("country")
    .eq("id", context.user.companyId!).maybeSingle();
  if (!company) return { error: t("denied") };
  const today = financeBusinessDate(new Date(), countryTimezone(company.country));
  if (parsed.data.occurredOn > today) return { error: t("settlementDate") };
  const { data: entry } = await context.supabase.from("finance_entries")
    .select("id,status,amount,order_id").eq("company_id", context.user.companyId!)
    .eq("id", parsed.data.entryId).maybeSingle();
  if (!entry || entry.status !== "approved") return { error: t("transactionState") };
  const { data: existing } = await context.supabase.from("finance_transactions")
    .select("amount").eq("company_id", context.user.companyId!)
    .eq("entry_id", entry.id);
  const paid = (existing ?? []).reduce((sum, item) => sum + Number(item.amount), 0);
  const amount = Math.round(parsed.data.amount * 100) / 100;
  if (amount > Math.round((Number(entry.amount) - paid) * 100) / 100) return { error: t("transactionBalance") };
  const { error } = await context.supabase.rpc("finance_register_payment_batch", {
    p_id: parsed.data.requestId, p_data: {
      amount, occurred_on: parsed.data.occurredOn, method: parsed.data.method,
      reference: parsed.data.reference, allocations: [{entry_id: entry.id, amount,
        ...(parsed.data.proofDocumentId ? {proof_document_id: parsed.data.proofDocumentId} : {})}],
    },
  });
  if (error?.message.includes("invoice_required_to_pay")) return { error: t("invoiceRequiredToPay") };
  if (error) return { error: t("transactionSave") };
  revalidatePath("/finance/operations");
  revalidatePath("/finance/expenses");
  revalidatePath("/finance", "layout");
  if (entry.order_id) revalidatePath(`/finance/orders/${entry.order_id}`);
  return { error: null };
}

export async function createFinanceExpenseTemplate(formData: FormData): Promise<Result> {
  const t = await getTranslations("FinanceOperations.errors");
  const context = await financeContext();
  if (!context) return { error: t("denied") };
  const parsed = z.object({
    supplierId: z.string().uuid(),
    category: z.enum(["fixed", "payroll", "variable", "service", "logistics", "motorcycle", "travel", "daily", "other"]),
    description: z.string().trim().min(2).max(500),
    amount: z.coerce.number().positive().max(999999999999.99),
    currency: z.enum(["ARS", "BRL"]),
    dueDay: z.coerce.number().int().min(1).max(31),
    startsOn: z.iso.date(),
  }).safeParse({
    supplierId: formData.get("supplierId"), category: formData.get("category"),
    description: formData.get("description"), amount: formData.get("amount"),
    currency: formData.get("currency"), dueDay: formData.get("dueDay"),
    startsOn: formData.get("startsOn"),
  });
  if (!parsed.success) return { error: t("templateData") };
  const d = parsed.data;
  const { error } = await context.supabase.from("finance_expense_templates").insert({
    company_id: context.user.companyId!, supplier_id: d.supplierId,
    category: d.category, description: d.description, amount: Math.round(d.amount * 100) / 100,
    currency: d.currency, due_day: d.dueDay, starts_on: d.startsOn,
    created_by: context.user.id,
  });
  if (error) return { error: t("templateSave") };
  revalidatePath("/finance/expenses");
  return { error: null };
}

export async function updateFinanceExpenseTemplate(formData: FormData): Promise<Result> {
  const t = await getTranslations("FinanceOperations.errors");
  const context = await financeContext();
  if (!context) return { error: t("denied") };
  const parsed = z.object({
    id: z.string().uuid(),
    description: z.string().trim().min(2).max(500),
    amount: z.coerce.number().positive().max(999999999999.99),
    dueDay: z.coerce.number().int().min(1).max(31),
    active: z.enum(["true", "false"]),
  }).safeParse({
    id: formData.get("id"), description: formData.get("description"),
    amount: formData.get("amount"), dueDay: formData.get("dueDay"),
    active: formData.get("active"),
  });
  if (!parsed.success) return { error: t("templateData") };
  const d = parsed.data;
  const { error, data } = await context.supabase.from("finance_expense_templates")
    .update({ description: d.description, amount: Math.round(d.amount * 100) / 100,
      due_day: d.dueDay, active: d.active === "true", updated_at: new Date().toISOString() })
    .eq("id", d.id).eq("company_id", context.user.companyId!).select("id").maybeSingle();
  if (error || !data) return { error: t("templateSave") };
  revalidatePath("/finance/expenses");
  return { error: null };
}

export async function generateFinanceExpenseMonth(month: string): Promise<Result> {
  const t = await getTranslations("FinanceOperations.errors");
  const context = await financeContext();
  if (!context) return { error: t("denied") };
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: t("templateData") };
  const { error } = await context.supabase.rpc("finance_generate_expense_month", {
    p_month: `${month}-01`,
  });
  if (error) return { error: t("templateGenerate") };
  revalidatePath("/finance/expenses");
  revalidatePath("/finance/operations");
  revalidatePath("/finance", "layout");
  return { error: null };
}

export async function registerFinanceInvoice(formData: FormData): Promise<Result> {
  const t = await getTranslations("FinanceOperations.errors");
  const context = await financeContext();
  if (!context) return { error: t("denied") };
  let allocations: unknown;
  try { allocations = JSON.parse(String(formData.get("allocations") ?? "")); }
  catch { return { error: t("invoiceData") }; }
  const parsed = z.object({
    direction: z.enum(["issued", "received"]),
    partyId: z.string().uuid(),
    invoiceNumber: z.string().trim().min(1).max(100),
    issuedOn: z.iso.date(),
    dueOn: z.iso.date().optional(),
    currency: z.enum(["ARS", "BRL"]),
    allocations: z.array(z.object({ entry_id: z.string().uuid(),
      amount: z.number().positive().max(999999999999.99) })).min(1).max(100),
  }).safeParse({
    direction: formData.get("direction"), partyId: formData.get("partyId"),
    invoiceNumber: formData.get("invoiceNumber"), issuedOn: formData.get("issuedOn"),
    dueOn: String(formData.get("dueOn") ?? "").trim() || undefined,
    currency: formData.get("currency"), allocations,
  });
  if (!parsed.success) return { error: t("invoiceData") };
  const d = parsed.data;
  if (new Set(d.allocations.map((a) => a.entry_id)).size !== d.allocations.length) {
    return { error: t("invoiceData") };
  }
  const amount = d.allocations.reduce((sum, a) => sum + Math.round(a.amount * 100), 0) / 100;
  const path=String(formData.get('uploadedPath')??'');
  const invoiceId=path.split('/')[2]??'';
  const file=await verifyFinanceUpload(context.supabase,context.user.companyId!,path,'invoice',invoiceId,String(formData.get('fileName')??''));
  if(!file)return {error:t('fileData')};
  const { error } = await context.supabase.rpc("finance_register_invoice", {
    p_id: invoiceId, p_company_id: context.user.companyId!, p_direction: d.direction,
    p_party_id: d.partyId, p_invoice_number: d.invoiceNumber,
    p_issued_on: d.issuedOn, p_due_on: (d.dueOn ?? null) as string, /* null válido: el generador no marca los parámetros opcionales */
    p_amount: amount, p_currency: d.currency,
    p_storage_path: path, p_file_name: file.name.slice(0, 255),
    p_allocations: d.allocations,
  });
  if (error) {
    await context.supabase.storage.from("finance-private").remove([path]);
    return { error: t("invoiceSave") };
  }
  revalidatePath("/finance/invoices");
  revalidatePath("/finance/operations");
  revalidatePath("/finance", "layout");
  const { data: linked } = await context.supabase.from("finance_entries")
    .select("order_id").eq("company_id", context.user.companyId!)
    .in("id", d.allocations.map((row) => row.entry_id));
  for (const orderId of new Set((linked ?? []).map((row) => row.order_id).filter((id): id is string => !!id))) {
    revalidatePath(`/finance/orders/${orderId}`);
  }
  return { error: null };
}

export async function markFinanceInvoiceSent(id: string): Promise<Result> {
  const t = await getTranslations("FinanceOperations.errors");
  const context = await financeContext();
  if (!context || !z.string().uuid().safeParse(id).success) return { error: t("denied") };
  const { error, data } = await context.supabase.from("finance_invoices")
    .update({ status: "sent" }).eq("id", id).eq("company_id", context.user.companyId!)
    .eq("direction", "issued").eq("status", "registered").select("id").maybeSingle();
  if (error || !data) return { error: t("invoiceSend") };
  revalidatePath("/finance/invoices");
  revalidatePath("/finance/operations");
  return { error: null };
}

const documentKinds = ["invoice", "transfer_proof", "bank_credit", "payment_order"] as const;

export async function uploadFinanceDocument(formData: FormData): Promise<Result> {
  const t = await getTranslations("FinanceOperations.errors");
  const context = await financeContext();
  if (!context) return { error: t("denied") };
  const entryId = String(formData.get("entryId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const path=String(formData.get('uploadedPath')??'');
  if(!z.string().uuid().safeParse(entryId).success||!documentKinds.includes(kind as typeof documentKinds[number]))return {error:t('fileData')};
  const file=await verifyFinanceUpload(context.supabase,context.user.companyId!,path,'entry',entryId,String(formData.get('fileName')??''));
  if(!file)return {error:t('fileData')};
  const { data: entry } = await context.supabase.from("finance_entries").select("id, direction, order_id")
    .eq("id", entryId).eq("company_id", context.user.companyId!).maybeSingle();
  if (!entry) return { error: t("entryMissing") };
  if ((kind === "transfer_proof" && entry.direction !== "payable") ||
      ((kind === "bank_credit" || kind === "payment_order") && entry.direction !== "receivable")) {
    return { error: t("documentKind") };
  }
  // Si el pago o cobro ya está registrado y le falta comprobante, este archivo
  // ES su comprobante: se ata al movimiento (y a todo su lote o cheque). Antes
  // quedaba suelto en la obligación y el Resumen seguía avisando «sin comprobante».
  if (kind === "transfer_proof" || kind === "bank_credit") {
    const { data: unproven } = await context.supabase.from("finance_transactions")
      .select("id,batch_id,cheque_id").eq("company_id", context.user.companyId!).eq("entry_id", entryId)
      .is("proof_document_id", null).order("created_at", { ascending: false }).limit(1);
    const tx = unproven?.[0];
    if (tx) {
      const { error: linkError, data: linked } = await context.supabase.rpc("finance_attach_operation_proof", {
        p_operation: tx.batch_id ?? tx.cheque_id ?? tx.id,
        p_type: tx.batch_id ? "batch" : tx.cheque_id ? "cheque" : "transaction",
        p_path: path, p_name: file.name.slice(0, 255), p_mime: file.type, p_size: file.size,
      });
      if (linkError || !linked) {
        await context.supabase.storage.from("finance-private").remove([path]);
        return { error: t("documentLink") };
      }
      revalidatePath("/finance", "layout");
      if (entry.order_id) revalidatePath(`/finance/orders/${entry.order_id}`);
      return { error: null };
    }
  }
  const { error: insertError } = await context.supabase.from("finance_documents").insert({
    company_id: context.user.companyId!, entry_id: entryId, kind,
    storage_path: path, file_name: file.name.slice(0, 255), mime_type: file.type,
    size_bytes: file.size, uploaded_by: context.user.id,
  });
  if (insertError) {
    await context.supabase.storage.from("finance-private").remove([path]);
    return { error: t("documentLink") };
  }
  revalidatePath("/finance/operations");
  if (entry.order_id) revalidatePath(`/finance/orders/${entry.order_id}`);
  return { error: null };
}

export async function attachFinanceTransactionProof(formData: FormData): Promise<Result> {
  const t = await getTranslations("FinanceOperations.errors");
  const context = await financeContext();
  if (!context) return { error: t("denied") };
  const transactionId = String(formData.get("transactionId") ?? "");
  const batchId = String(formData.get("operationType") ?? "") === "batch" ? String(formData.get("operationId") ?? "") : "";
  const targetEntry = String(formData.get("entryId") ?? "");
  const byBatch = !transactionId && z.string().uuid().safeParse(batchId).success && z.string().uuid().safeParse(targetEntry).success;
  if(!byBatch&&!z.string().uuid().safeParse(transactionId).success)return {error:t('fileData')};
  const lookup = context.supabase.from("finance_transactions")
    .select("id,entry_id,proof_document_id").eq("company_id", context.user.companyId!);
  const { data: tx } = byBatch
    ? await lookup.eq("batch_id", batchId).eq("entry_id", targetEntry).maybeSingle()
    : await lookup.eq("id", transactionId).maybeSingle();
  if (!tx || tx.proof_document_id) return { error: t("transactionState") };
  const { data: entry } = await context.supabase.from("finance_entries")
    .select("direction,order_id,supplier_id").eq("id", tx.entry_id)
    .eq("company_id", context.user.companyId!).maybeSingle();
  if (!entry) return { error: t("entryMissing") };
  const path=String(formData.get('uploadedPath')??'');
  const file=await verifyFinanceUpload(context.supabase,context.user.companyId!,path,'entry',tx.entry_id,String(formData.get('fileName')??''));
  if(!file)return {error:t('fileData')};
  const operation=String(formData.get('operationId')??'')||tx.id;
  const operationType=String(formData.get('operationType')??'transaction');
  const {error:linkError,data:linkedCount}=await context.supabase.rpc('finance_attach_operation_proof',{p_operation:operation,p_type:operationType,p_path:path,p_name:file.name,p_mime:file.type,p_size:file.size});
  if(linkError||!linkedCount)return {error:t('documentLink')};
  revalidatePath('/finance','layout');
  revalidatePath("/finance/cash");
  revalidatePath("/finance/operations");
  if (entry.order_id) revalidatePath(`/finance/orders/${entry.order_id}`);
  if (entry.supplier_id) revalidatePath("/finance/suppliers");
  return { error: null };
}
