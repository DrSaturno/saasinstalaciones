import { FinanceLoadError } from "@/components/company/finance-load-error";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { financeBusinessDate } from "@/lib/domain/finance-business-date";
import { countryTimezone } from "@/lib/domain/availability";
import { FinanceEntryForm } from "@/components/company/finance-entry-form";
import { FinanceOperationsTable } from "@/components/company/finance-operations-table";
import { FinanceSupplierForm } from "@/components/company/finance-supplier-form";

export default async function FinanceOrderDetailPage({ params }: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "company_manager" || !user.companyId || !user.canManageFinance) redirect("/dashboard");
  const [{ id }, t, statusT, supabase] = await Promise.all([
    params, getTranslations("FinanceOperations"), getTranslations("Status.order"), createClient(),
  ]);
  const { data: order } = await supabase.from("work_orders")
    .select("id,order_number,title,status,scheduled_date,finalized_at,amount,installer_amount,currency,project_id,site_id,assigned_installer_id")
    .eq("company_id", user.companyId).eq("id", id).maybeSingle();
  if (!order) notFound();
  const {data:actualPrice,error:priceError}=await supabase.rpc("finance_order_commercial_amount",{p_order:order.id});
  if(priceError)return <FinanceLoadError/>;
  order.amount=actualPrice;
  const [projectResult, siteResult, suppliersResult, clientsResult, entriesResult, companyResult] = await Promise.all([
    supabase.from("projects").select("id,name,client_id,client_name,billing_mode,coordinator_id")
      .eq("company_id", user.companyId).eq("id", order.project_id).maybeSingle(),
    supabase.from("sites").select("id,name,city,zone,address")
      .eq("company_id", user.companyId).eq("id", order.site_id).maybeSingle(),
    supabase.from("finance_suppliers").select("id,name,kind")
      .eq("company_id", user.companyId).order("name"),
    supabase.from("clients").select("id,name").eq("company_id", user.companyId).order("name"),
    supabase.from("finance_entry_balances").select("*")
      .eq("company_id", user.companyId).eq("order_id", id).order("created_at"),
    supabase.from("companies").select("country").eq("id", user.companyId).maybeSingle(),
  ]);
  const site = siteResult.data;
  const project = projectResult.data;
  const entries = entriesResult.data ?? [];
  const entryIds = entries.map((entry) => entry.id);
  const [documentsResult, transactionsResult, allocationsResult] = await Promise.all([
    entryIds.length ? supabase.from("finance_documents").select("id,entry_id,kind,file_name")
      .eq("company_id", user.companyId).in("entry_id", entryIds)
      : Promise.resolve({ data: [] as { id: string; entry_id: string; kind: string; file_name: string }[] }),
    entryIds.length ? supabase.from("finance_transactions")
      .select("id,entry_id,amount,occurred_on,method,reference")
      .eq("company_id", user.companyId).in("entry_id", entryIds).order("occurred_on", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; entry_id: string; amount: number; occurred_on: string; method: string; reference: string }[] }),
    entryIds.length ? supabase.from("finance_invoice_allocations").select("invoice_id,entry_id,amount")
      .eq("company_id", user.companyId).in("entry_id", entryIds)
      : Promise.resolve({ data: [] as { invoice_id: string; entry_id: string; amount: number }[] }),
  ]);
  const invoiceIds = [...new Set((allocationsResult.data ?? []).map((row) => row.invoice_id))];
  const { data: invoices } = invoiceIds.length
    ? await supabase.from("finance_invoices").select("id,invoice_number,direction,issued_on,due_on,amount,currency,status,file_name")
      .eq("company_id", user.companyId).in("id", invoiceIds)
    : { data: [] as { id: string; invoice_number: string; direction: string; issued_on: string; due_on: string | null; amount: number; currency: string; status: string; file_name: string | null }[] };
  const suppliers = suppliersResult.data ?? [];
  const invoiceFiles = (allocationsResult.data ?? []).flatMap((allocation) => {
    const invoice = (invoices ?? []).find((row) => row.id === allocation.invoice_id);
    return invoice ? [{ id: invoice.id, entry_id: allocation.entry_id, kind: "invoice",
      file_name: invoice.file_name ?? invoice.invoice_number,
      url: `/api/finance/invoices/${invoice.id}/file` }] : [];
  });
  const supplierNames = new Map(suppliers.map((row) => [row.id, row.name]));
  const clientNames = new Map((clientsResult.data ?? []).map((row) => [row.id, row.name]));
  const visible = entries.map((entry) => ({ ...entry,
    partyName: entry.direction === "payable"
      ? supplierNames.get(entry.supplier_id ?? "") ?? "—"
      : clientNames.get(entry.client_id ?? "") ?? project?.client_name ?? "—",
    orderNumber: order.order_number,
  }));
  const active = entries.filter((entry) => entry.status !== "void");
  const payable = active.filter((entry) => entry.direction === "payable")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const receivable = active.filter((entry) => entry.direction === "receivable")
    .reduce((sum, entry) => sum + entry.open_amount, 0);
  const duePayable = active.filter((entry) => entry.direction === "payable")
    .reduce((sum, entry) => sum + entry.open_amount, 0);
  const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: order.currency }).format(value);
  const today = financeBusinessDate(new Date(), countryTimezone(companyResult.data?.country ?? "AR"));
  const rosterPeople = [order.assigned_installer_id, project?.coordinator_id]
    .filter((personId): personId is string => !!personId);
  const { data: people } = rosterPeople.length
    ? await supabase.from("profiles").select("id,full_name").in("id", rosterPeople)
    : { data: [] as { id: string; full_name: string }[] };
  const collectionStages = visible.filter((entry) => entry.direction === "receivable")
    .map((entry) => {
      const relatedIds = (allocationsResult.data ?? []).filter((allocation) => allocation.entry_id === entry.id)
        .map((allocation) => allocation.invoice_id);
      const relatedInvoices = (invoices ?? []).filter((invoice) => relatedIds.includes(invoice.id));
      const stage = entry.status === "settled" ? "collected" : entry.paid_amount > 0 ? "partial"
        : entry.due_on && entry.due_on < today ? "overdue"
        : relatedInvoices.some((invoice) => invoice.status === "sent") ? "sent"
        : relatedInvoices.length ? "invoiced" : "toInvoice";
      return { entry, stage };
    });
  return <main className="mx-auto max-w-[1480px] space-y-5 pb-12">
    <header><Link href="/finance/orders" className="text-sm text-primary">← {t("financeOrders")}</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3"><div>
        <p className="font-mono text-sm font-semibold text-primary">{order.order_number}</p>
        <h1 className="text-2xl font-bold">{order.title}</h1>
        <p className="text-sm text-muted-foreground">{project?.client_name ?? "—"} · {site?.name ?? "—"} · {site?.city ?? "—"} · {site?.zone ?? "—"}</p>
      </div><div className="flex flex-wrap gap-2"><a href={`/api/finance/orders/${id}/pdf`} className="rounded-md border px-4 py-2 text-sm font-semibold">{t("downloadFinancePdf")}</a>
        <Link href={`/orders/${id}`} className="rounded-md border px-4 py-2 text-sm font-semibold">{t("openOperationalOrder")}</Link></div></div></header>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border bg-white p-4"><p className="text-xs text-muted-foreground">{t("operationalStatus")}</p><p className="mt-2 font-semibold">{statusT(order.status)}</p></div>
      <div className="rounded-xl border bg-white p-4"><p className="text-xs text-muted-foreground">{t("amountClient")}</p><p className="mt-2 font-mono text-xl font-semibold">{order.amount == null ? "—" : money(order.amount)}</p></div>
      <div className="rounded-xl border bg-white p-4"><p className="text-xs text-muted-foreground">{t("supplierCosts")}</p><p className="mt-2 font-mono text-xl font-semibold">{money(payable)}</p><p className="text-xs text-muted-foreground">{t("openPayables")}: {money(duePayable)}</p></div>
      <div className="rounded-xl border bg-white p-4"><p className="text-xs text-muted-foreground">{t("openReceivables")}</p><p className="mt-2 font-mono text-xl font-semibold">{money(receivable)}</p><p className="text-xs text-muted-foreground">{t("estimatedMargin")}: {order.amount == null ? "—" : money(order.amount - payable)}</p></div>
    </section>
    {order.status !== "finalizada" && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">{t("notPayableUntilApproved")}</p>}
    {project?.billing_mode === "project" && <p className="rounded-lg border bg-white p-3 text-sm">{t("projectBillingNotice")}</p>}
    {order.installer_amount != null && <p className="rounded-lg border bg-white p-3 text-sm">{t("agreedInstallerAmount")}: <strong className="font-mono">{money(order.installer_amount)}</strong> · {t("registerSupplierCostHint")}</p>}
    <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">{t("collectionWorkflow")}</h2>
      {collectionStages.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("collectionEntryMissing")}</p>
        : <div className="mt-3 divide-y">{collectionStages.map(({ entry, stage }) =>
          <div key={entry.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
            <span>{entry.partyName} · {entry.due_on ?? t("noDate")}</span>
            <span className="font-semibold">{t(`collectionStages.${stage}` as "collectionStages.toInvoice")}</span>
            <span className="font-mono">{t("openReceivables")}: {money(entry.open_amount)}</span>
          </div>)}</div>}
    </section>
    <FinanceSupplierForm installers={people ?? []} orderId={id} />
    <FinanceEntryForm suppliers={suppliers} clients={clientsResult.data ?? []} orderNumber={order.order_number} />
    <section className="rounded-xl border bg-white p-5"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{t("linkedInvoices")}</h2>
      <Link href="/finance/invoices" className="text-sm font-semibold text-primary">{t("registerInvoice")} →</Link></div>
      {(allocationsResult.data ?? []).length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("noLinkedInvoices")}</p>
        : <div className="mt-3 divide-y text-sm">{(allocationsResult.data ?? []).map((allocation) => {
          const invoice = (invoices ?? []).find((row) => row.id === allocation.invoice_id);
          return <div key={`${allocation.invoice_id}:${allocation.entry_id}`} className="flex flex-wrap justify-between gap-2 py-2">
            <span>{invoice?.invoice_number ?? "—"} · {invoice?.direction === "issued" ? t("issuedInvoice") : t("receivedInvoice")} · {invoice?.issued_on ?? "—"}</span>
            <span className="font-mono">{money(allocation.amount)} · {invoice?.id
              ? <a href={`/api/finance/invoices/${invoice.id}/file`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{invoice.file_name ?? t("invoiceFile")}</a>
              : t("noDocument")}</span>
          </div>;
        })}</div>}
    </section>
    <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">{t("cashHistory")}</h2>
      {(transactionsResult.data ?? []).length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("noCashHistory")}</p>
        : <div className="mt-3 divide-y text-sm">{(transactionsResult.data ?? []).map((tx) => {
          const entry = visible.find((row) => row.id === tx.entry_id);
          return <div key={tx.id} className="flex flex-wrap justify-between gap-2 py-2">
            <span>{tx.occurred_on} · {entry?.partyName ?? "—"} · {t(`paymentMethods.${tx.method}` as "paymentMethods.transfer")}</span>
            <span className="font-mono">{entry?.direction === "payable" ? "−" : "+"}{money(tx.amount)}</span>
          </div>;
        })}</div>}
    </section>
    <FinanceOperationsTable entries={visible} documents={[...(documentsResult.data ?? []), ...invoiceFiles]} filters={{ q: order.order_number }} today={today} />
  </main>;
}
