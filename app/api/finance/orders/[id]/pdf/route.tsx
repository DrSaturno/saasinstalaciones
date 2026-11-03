import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getTranslations } from "next-intl/server";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { FinanceOrderDocument, type FinanceOrderPdfData } from "@/lib/pdf/finance-order-document";
import type { OrderStatus } from "@/types/database";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthorizedUser();
  if (user?.role !== "company_manager" || !user.companyId || !user.canManageFinance) return new NextResponse(null, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });
  const gate = await enforceRateLimit("finance_order_pdf", user.id, 30, 3600);
  if (!gate.allowed) return new NextResponse(null, { status: 429,
    headers: { "Retry-After": String(gate.retryAfterSeconds) } });
  const [supabase, t, ops, statusT] = await Promise.all([
    createClient(), getTranslations("FinancePdf"),
    getTranslations("FinanceOperations"), getTranslations("Status.order"),
  ]);
  const companyId = user.companyId;
  const { data: order } = await supabase.from("work_orders")
    .select("id,order_number,title,status,amount,currency,project_id,site_id")
    .eq("id", id).eq("company_id", companyId).maybeSingle();
  if (!order) return new NextResponse(null, { status: 404 });
  const {data:actualPrice,error:priceError}=await supabase.rpc("finance_order_commercial_amount",{p_order:order.id});
  if(priceError)return new NextResponse(null,{status:503});
  order.amount=actualPrice;
  const [projectResult, siteResult, entriesResult, suppliersResult, clientsResult] = await Promise.all([
    supabase.from("projects").select("client_name").eq("id", order.project_id)
      .eq("company_id", companyId).maybeSingle(),
    supabase.from("sites").select("name,zone").eq("id", order.site_id)
      .eq("company_id", companyId).maybeSingle(),
    supabase.from("finance_entry_balances")
      .select("id,direction,supplier_id,client_id,category,amount,paid_amount,open_amount,due_on,status")
      .eq("order_id", id).eq("company_id", companyId).order("created_at"),
    supabase.from("finance_suppliers").select("id,name").eq("company_id", companyId),
    supabase.from("clients").select("id,name").eq("company_id", companyId),
  ]);
  if (entriesResult.error || suppliersResult.error || clientsResult.error) {
    return new NextResponse(null, { status: 500 });
  }
  const entries = entriesResult.data ?? [];
  const entryIds = entries.map((row) => row.id);
  const [transactionsResult, allocationsResult] = await Promise.all([
    entryIds.length ? supabase.from("finance_transactions")
      .select("entry_id,amount,occurred_on,method")
      .eq("company_id", companyId).in("entry_id", entryIds).order("occurred_on")
      : Promise.resolve({ data: [] as { entry_id: string; amount: number; occurred_on: string; method: string }[] }),
    entryIds.length ? supabase.from("finance_invoice_allocations")
      .select("invoice_id,amount").eq("company_id", companyId).in("entry_id", entryIds)
      : Promise.resolve({ data: [] as { invoice_id: string; amount: number }[] }),
  ]);
  const invoiceIds = [...new Set((allocationsResult.data ?? []).map((row) => row.invoice_id))];
  const { data: invoices } = invoiceIds.length
    ? await supabase.from("finance_invoices")
      .select("id,invoice_number,direction,issued_on,amount")
      .eq("company_id", companyId).in("id", invoiceIds)
    : { data: [] as { id: string; invoice_number: string; direction: string; issued_on: string; amount: number }[] };
  const parties = new Map([...(suppliersResult.data ?? []), ...(clientsResult.data ?? [])]
    .map((row) => [row.id, row.name]));
  const entryById = new Map(entries.map((row) => [row.id, row]));
  const data: FinanceOrderPdfData = {
    orderNumber: order.order_number, title: order.title,
    client: projectResult.data?.client_name ?? "—", site: siteResult.data?.name ?? "—",
    zone: siteResult.data?.zone ?? "—", status: statusT(order.status as OrderStatus),
    currency: order.currency, clientAmount: order.amount,
    entries: entries.map((entry) => ({
      direction: entry.direction,
      party: parties.get(entry.supplier_id ?? entry.client_id ?? "") ?? "—",
      category: ops(`categories.${entry.category}` as "categories.installation"),
      amount: entry.amount, paid: entry.paid_amount, open: entry.open_amount,
      due: entry.due_on, status: entry.status,
    })),
    invoices: (invoices ?? []).map((invoice) => ({
      number: invoice.invoice_number,
      direction: ops(invoice.direction === "issued" ? "issuedInvoice" : "receivedInvoice"),
      date: invoice.issued_on,
      amount: (allocationsResult.data ?? []).filter((row) => row.invoice_id === invoice.id)
        .reduce((sum, row) => sum + row.amount, 0),
    })),
    transactions: (transactionsResult.data ?? []).map((tx) => {
      const entry = entryById.get(tx.entry_id);
      return { date: tx.occurred_on, direction: entry?.direction ?? "payable",
        party: parties.get(entry?.supplier_id ?? entry?.client_id ?? "") ?? "—",
        amount: tx.amount,
        method: ops(`paymentMethods.${tx.method}` as "paymentMethods.transfer") };
    }),
    labels: Object.fromEntries([
      "title", "brand", "clientAmount", "supplierCosts", "payOpen", "collectOpen",
      "obligations", "party", "category", "amount", "paid", "open", "payable",
      "receivable", "noDate", "empty", "invoices", "emptyInvoices", "cash", "emptyCash", "footer",
    ].map((key) => [key, t(key as "title")])),
  };
  const buffer = await renderToBuffer(<FinanceOrderDocument data={data} />);
  return new NextResponse(new Uint8Array(buffer), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="finanzas-${order.order_number.replaceAll(/[^a-zA-Z0-9-]/g, "")}.pdf"`,
    "Cache-Control": "private, no-store",
  } });
}
