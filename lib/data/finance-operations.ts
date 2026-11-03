import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type FinanceFilters = { status?: string; direction?: string; from?: string; to?: string; q?: string };

export async function fetchFinanceOperations(
  supabase: SupabaseClient<Database>, companyId: string, filters: FinanceFilters,
) {
  const q = (filters.q ?? "").trim().toLocaleLowerCase();
  // El enlace desde una OT debe encontrar también asientos viejos fuera de los
  // 500 recientes. La búsqueda exacta de número se resuelve antes del límite.
  const { data: exactOrder } = q && q.length <= 50
    ? await supabase.from("work_orders").select("id").eq("company_id", companyId)
      .eq("order_number", filters.q!.trim()).maybeSingle()
    : { data: null };
  let query = supabase.from("finance_entry_balances").select("*").eq("company_id", companyId)
    .order(filters.status === "settled" ? "settled_on" : "created_at", { ascending: false }).limit(500);
  if (exactOrder) query = query.eq("order_id", exactOrder.id);
  if (["review", "approved", "settled", "void"].includes(filters.status ?? "")) query = query.eq("status", filters.status!);
  if (["payable", "receivable"].includes(filters.direction ?? "")) query = query.eq("direction", filters.direction!);
  const dateColumn = filters.status === "settled" ? "settled_on" : "due_on";
  if (/^\d{4}-\d{2}-\d{2}$/.test(filters.from ?? "")) query = query.gte(dateColumn, filters.from!);
  if (/^\d{4}-\d{2}-\d{2}$/.test(filters.to ?? "")) query = query.lte(dateColumn, filters.to!);
  const [entriesResult, suppliersResult, clientsResult, rulesResult, rosterResult] = await Promise.all([
    query,
    supabase.from("finance_suppliers").select("id,name,kind").eq("company_id", companyId).order("name"),
    supabase.from("clients").select("id,name").eq("company_id", companyId).order("name"),
    supabase.from("finance_payment_rules").select("amba_weekday,interior_weekday").eq("company_id", companyId).maybeSingle(),
    supabase.from("company_installers").select("installer_id").eq("company_id", companyId).eq("status", "active"),
  ]);
  if (entriesResult.error || suppliersResult.error || clientsResult.error || rulesResult.error || rosterResult.error) {
    return { error: true as const, entries: [], suppliers: [], clients: [], documents: [], rules: null, overview: [], installers: [] };
  }
  const rosterIds = (rosterResult.data ?? []).map((row) => row.installer_id);
  const { data: installers } = rosterIds.length
    ? await supabase.from("profiles").select("id,full_name").in("id", rosterIds)
    : { data: [] as { id: string; full_name: string }[] };
  const entries = entriesResult.data ?? [];
  const orderIds = [...new Set(entries.map((entry) => entry.order_id).filter((id): id is string => !!id))];
  const [ordersResult, documentsResult, allocationsResult] = await Promise.all([
    orderIds.length
      ? supabase.from("work_orders").select("id,order_number").eq("company_id", companyId).in("id", orderIds)
      : Promise.resolve({ data: [] as { id: string; order_number: string }[] }),
    entries.length
      ? supabase.from("finance_documents").select("id,entry_id,kind,file_name").eq("company_id", companyId).in("entry_id", entries.map((entry) => entry.id))
      : Promise.resolve({ data: [] as { id: string; entry_id: string; kind: string; file_name: string }[] }),
    entries.length
      ? supabase.from("finance_invoice_allocations").select("invoice_id,entry_id")
        .eq("company_id", companyId).in("entry_id", entries.map((entry) => entry.id))
      : Promise.resolve({ data: [] as { invoice_id: string; entry_id: string }[] }),
  ]);
  const invoiceIds = [...new Set((allocationsResult.data ?? []).map((row) => row.invoice_id))];
  const { data: invoices } = invoiceIds.length
    ? await supabase.from("finance_invoices").select("id,file_name,invoice_number")
      .eq("company_id", companyId).in("id", invoiceIds)
    : { data: [] as { id: string; file_name: string | null; invoice_number: string }[] };
  const invoiceNames = new Map((invoices ?? []).map((invoice) => [invoice.id, invoice.file_name ?? invoice.invoice_number]));
  const linkedInvoiceDocuments = (allocationsResult.data ?? []).filter((row) => invoiceNames.has(row.invoice_id))
    .map((row) => ({ id: row.invoice_id, entry_id: row.entry_id, kind: "invoice",
      file_name: invoiceNames.get(row.invoice_id)!, url: `/api/finance/invoices/${row.invoice_id}/file` }));
  const orderNumbers = new Map((ordersResult.data ?? []).map((order) => [order.id, order.order_number]));
  const supplierNames = new Map((suppliersResult.data ?? []).map((supplier) => [supplier.id, supplier.name]));
  const clientNames = new Map((clientsResult.data ?? []).map((client) => [client.id, client.name]));
  const visibleEntries = entries
    .map((entry) => ({
      ...entry,
      partyName: entry.direction === "payable" ? supplierNames.get(entry.supplier_id ?? "") ?? "—" : clientNames.get(entry.client_id ?? "") ?? "—",
      orderNumber: orderNumbers.get(entry.order_id ?? "") ?? null,
    }))
    .filter((entry) => !q || [entry.partyName, entry.orderNumber, entry.description]
      .some((value) => value?.toLocaleLowerCase().includes(q)));
  const overview: Pick<typeof entries[number], "amount" | "currency" | "due_on" | "category" | "zone" | "source" | "status">[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page, error } = await supabase.from("finance_entry_balances")
      .select("open_amount,currency,due_on,category,zone,source,status")
      .eq("company_id", companyId).eq("direction", "payable")
      .in("status", ["review", "approved"])
      .order("id").range(offset, offset + 999);
    if (error) return { error: true as const, entries: [], suppliers: [], clients: [], documents: [], rules: null, overview: [], installers: [] };
    overview.push(...(page ?? []).map((row) => ({
      amount: row.open_amount, currency: row.currency, due_on: row.due_on,
      category: row.category, zone: row.zone, source: row.source, status: row.status,
    })));
    if (!page || page.length < 1000) break;
  }
  return {
    error: false as const,
    entries: visibleEntries,
    suppliers: suppliersResult.data ?? [],
    clients: clientsResult.data ?? [],
    documents: [...(documentsResult.data ?? []), ...linkedInvoiceDocuments],
    rules: rulesResult.data ?? null,
    overview,
    installers: installers ?? [],
  };
}
