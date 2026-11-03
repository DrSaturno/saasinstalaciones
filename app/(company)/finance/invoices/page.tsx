import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FinanceInvoiceForm } from "@/components/company/finance-invoice-form";
import { FinanceInvoiceSendButton } from "@/components/company/finance-invoice-send-button";

export default async function FinanceInvoicesPage() {
  const user = await getCurrentUser();
  if (user?.role !== "company_manager" || !user.companyId || !user.canManageFinance) redirect("/dashboard");
  const [t, supabase] = await Promise.all([getTranslations("FinanceOperations"), createClient()]);
  const companyId = user.companyId;
  const [suppliersResult, clientsResult, entriesResult, invoicesResult] = await Promise.all([
    supabase.from("finance_suppliers").select("id,name").eq("company_id", companyId).order("name"),
    supabase.from("clients").select("id,name").eq("company_id", companyId).order("name"),
    supabase.from("finance_entries").select("id,direction,supplier_id,client_id,order_id,amount,currency,description,status")
      .eq("company_id", companyId).neq("status", "void").order("created_at", { ascending: false }).limit(500),
    supabase.from("finance_invoices").select("id,direction,client_id,supplier_id,invoice_number,issued_on,amount,currency,status,file_name")
      .eq("company_id", companyId).order("issued_on", { ascending: false }).limit(100),
  ]);
  if (suppliersResult.error || clientsResult.error || entriesResult.error || invoicesResult.error) {
    return <main className="mx-auto max-w-6xl p-5"><h1 className="text-2xl font-bold">{t("invoicesTitle")}</h1>
      <p className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm">{t("schemaPending")}</p></main>;
  }
  const entries = entriesResult.data ?? [];
  const entryIds = entries.map((row) => row.id);
  const orderIds = [...new Set(entries.map((row) => row.order_id).filter((id): id is string => !!id))];
  const [allocationsResult, ordersResult] = await Promise.all([
    entryIds.length ? supabase.from("finance_invoice_allocations").select("entry_id,amount")
      .eq("company_id", companyId).in("entry_id", entryIds)
      : Promise.resolve({ data: [] as { entry_id: string; amount: number }[] }),
    orderIds.length ? supabase.from("work_orders").select("id,order_number")
      .eq("company_id", companyId).in("id", orderIds)
      : Promise.resolve({ data: [] as { id: string; order_number: string }[] }),
  ]);
  const used = new Map<string, number>();
  for (const allocation of allocationsResult.data ?? []) {
    used.set(allocation.entry_id, (used.get(allocation.entry_id) ?? 0) + allocation.amount);
  }
  const orderNumbers = new Map((ordersResult.data ?? []).map((row) => [row.id, row.order_number]));
  const suppliers = suppliersResult.data ?? [];
  const clients = clientsResult.data ?? [];
  const partyNames = new Map([...suppliers, ...clients].map((row) => [row.id, row.name]));
  const available = entries.map((row) => ({
    id: row.id,
    partyId: row.direction === "payable" ? row.supplier_id ?? "" : row.client_id ?? "",
    direction: row.direction === "payable" ? "received" as const : "issued" as const,
    label: `${orderNumbers.get(row.order_id ?? "") ?? t("withoutOrder")} · ${row.description || t(`categories.${row.direction === "payable" ? "other" : "service"}`)}`,
    capacity: Math.max(0, Math.round((row.amount - (used.get(row.id) ?? 0)) * 100) / 100),
    currency: row.currency,
  }));
  const money = (amount: number, currency: string) => new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(amount);
  return <main className="mx-auto max-w-[1480px] space-y-5 pb-12">
    <header><Link href="/finance" className="text-sm text-primary">← {t("back")}</Link>
      <h1 className="mt-2 text-2xl font-bold">{t("invoicesTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("invoicesSubtitle")}</p></header>
    <FinanceInvoiceForm entries={available} clients={clients} suppliers={suppliers} />
    <section className="rounded-xl border bg-white"><h2 className="border-b p-4 font-semibold">{t("registeredInvoices")}</h2>
      <div className="divide-y">{(invoicesResult.data ?? []).map((invoice) =>
        <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <div><p className="font-semibold">{invoice.invoice_number} · {invoice.direction === "issued" ? t("issuedInvoice") : t("receivedInvoice")}</p>
            <p className="text-muted-foreground">{partyNames.get(invoice.client_id ?? invoice.supplier_id ?? "") ?? "—"} · {invoice.issued_on}</p></div>
          <p className="font-mono font-semibold">{money(invoice.amount, invoice.currency)}</p>
          <div className="flex flex-wrap gap-3"><a href={`/api/finance/invoices/${invoice.id}/file`} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">{invoice.file_name ?? t("invoiceFile")} →</a>
            {invoice.direction === "issued" && invoice.status === "registered" && <FinanceInvoiceSendButton id={invoice.id} />}
            {invoice.status === "sent" && <span className="text-muted-foreground">{t("invoiceSent")}</span>}</div>
        </div>)}
      {(invoicesResult.data ?? []).length === 0 && <p className="p-5 text-sm text-muted-foreground">{t("noInvoices")}</p>}</div>
    </section>
  </main>;
}
