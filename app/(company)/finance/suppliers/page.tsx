import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { countryTimezone } from "@/lib/domain/availability";
import { financeBusinessDate } from "@/lib/domain/finance-business-date";

export default async function FinanceSuppliersPage({ searchParams }: {
  searchParams: Promise<{ supplier?: string; month?: string; q?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "company_manager" || !user.companyId || !user.canManageFinance) redirect("/dashboard");
  const [t, params, supabase] = await Promise.all([
    getTranslations("FinanceOperations"), searchParams, createClient(),
  ]);
  const companyId = user.companyId;
  const { data: company } = await supabase.from("companies").select("country")
    .eq("id", companyId).maybeSingle();
  const today = financeBusinessDate(new Date(), countryTimezone(company?.country ?? "AR"));
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "")
    ? params.month! : today.slice(0, 7);
  const next = new Date(`${month}-01T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = next.toISOString().slice(0, 10);
  const page = Math.max(0, Math.min(10000, Number.parseInt(params.page ?? "0", 10) || 0));
  let supplierQuery = supabase.from("finance_suppliers")
    .select("id,name,kind,tax_id", { count: "exact" }).eq("company_id", companyId).order("name");
  if (params.q?.trim()) supplierQuery = supplierQuery.ilike("name", `%${params.q.trim().slice(0, 70)}%`);
  const [listResult, selectedResult] = await Promise.all([
    supplierQuery.range(page * 50, page * 50 + 49),
    params.supplier && /^[0-9a-f-]{36}$/i.test(params.supplier)
      ? supabase.from("finance_suppliers").select("id,name,kind,tax_id")
        .eq("company_id", companyId).eq("id", params.supplier).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (listResult.error || selectedResult.error) return <main className="p-5"><h1>{t("suppliersTitle")}</h1><p>{t("schemaPending")}</p></main>;
  const filtered = listResult.data ?? [];
  const selected = selectedResult.data;
  const money = (amount: number, currency: string) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(amount);
  if (!selected) return <main className="mx-auto max-w-5xl space-y-5 pb-12">
    <header><Link href="/finance" className="text-sm text-primary">← {t("back")}</Link>
      <h1 className="mt-2 text-2xl font-bold">{t("suppliersTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("suppliersHint")}</p></header>
    <form className="flex gap-2 rounded-xl border bg-white p-4"><input name="q" defaultValue={params.q ?? ""}
      aria-label={t("searchSuppliers")} placeholder={t("searchSuppliers")}
      className="min-w-0 flex-1 rounded-md border p-2 text-sm" />
      <button className="rounded-md border px-4 py-2 text-sm">{t("filter")}</button></form>
    <p className="text-xs text-muted-foreground">{t("suppliersCount", { count: listResult.count ?? 0 })}</p>
    <section className="space-y-2">{filtered.map((supplier) =>
      <Link key={supplier.id} href={`/finance/suppliers?${new URLSearchParams({ supplier: supplier.id, month })}`}
        className="flex items-center justify-between rounded-xl border bg-white p-4 hover:border-primary/40">
        <span><strong>{supplier.name}</strong><span className="ml-3 text-xs text-muted-foreground">{t(`supplierKinds.${supplier.kind}` as "supplierKinds.other")}</span></span>
        <span className="text-sm font-semibold text-primary">{t("open")} →</span>
      </Link>)}</section>
    {filtered.length === 0 && <p className="rounded-xl border bg-white p-5 text-sm">{t("noSuppliers")}</p>}
    <nav className="flex gap-3 text-sm">{page > 0 && <Link href={`/finance/suppliers?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), page: String(page - 1) })}`} className="text-primary">← {t("previousPage")}</Link>}
      {(listResult.count ?? 0) > (page + 1) * 50 && <Link href={`/finance/suppliers?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), page: String(page + 1) })}`} className="text-primary">{t("nextPage")} →</Link>}</nav>
  </main>;
  const entries: { id: string; order_id: string | null; description: string; open_amount: number;
    currency: string; due_on: string | null; status: string }[] = [];
  let loadError = false;
  for (let offset = 0; ; offset += 1000) {
    const { data, error: entryError } = await supabase.from("finance_entry_balances")
      .select("id,order_id,description,open_amount,currency,due_on,status")
      .eq("company_id", companyId).eq("supplier_id", selected.id)
      .neq("status", "void").order("id").range(offset, offset + 999);
    if (entryError) { loadError = true; break; }
    entries.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const [invoicesResult, cashResult] = await Promise.all([
    supabase.from("finance_invoices")
      .select("id,invoice_number,issued_on,amount,currency,file_name")
      .eq("company_id", companyId).eq("supplier_id", selected.id)
      .gte("issued_on", `${month}-01`).lt("issued_on", nextMonth)
      .order("issued_on", { ascending: false }).limit(200),
    supabase.from("finance_cash_movements")
      .select("id,order_id,settled_on,amount,currency,method")
      .eq("company_id", companyId).eq("supplier_id", selected.id)
      .gte("settled_on", `${month}-01`).lt("settled_on", nextMonth)
      .order("settled_on", { ascending: false }).limit(200),
  ]);
  if (loadError || invoicesResult.error || cashResult.error) return <main className="p-5">
    <h1 className="text-2xl font-bold">{selected.name}</h1><p>{t("schemaPending")}</p></main>;
  const orderIds = [...new Set([...entries.map((row) => row.order_id),
    ...(cashResult.data ?? []).map((row) => row.order_id)].filter((id): id is string => !!id))];
  const { data: orders } = orderIds.length ? await supabase.from("work_orders")
    .select("id,order_number").eq("company_id", companyId).in("id", orderIds)
    : { data: [] as { id: string; order_number: string }[] };
  const orderNumbers = new Map((orders ?? []).map((row) => [row.id, row.order_number]));
  const open = new Map<string, number>();
  for (const entry of entries) open.set(entry.currency, (open.get(entry.currency) ?? 0) + entry.open_amount);
  const recent = entries.sort((a, b) => (b.due_on ?? "").localeCompare(a.due_on ?? "")).slice(0, 50);
  return <main className="mx-auto max-w-[1480px] space-y-5 pb-12">
    <header><Link href="/finance/suppliers" className="text-sm text-primary">← {t("suppliersTitle")}</Link>
      <h1 className="mt-2 text-2xl font-bold">{selected.name}</h1>
      <p className="text-sm text-muted-foreground">{t(`supplierKinds.${selected.kind}` as "supplierKinds.other")}{selected.tax_id ? ` · ${selected.tax_id}` : ""}</p></header>
    <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">{t("supplierOpenBalance")}</h2>
      {[...open].map(([currency, amount]) => <p key={currency} className="mt-2 font-mono text-2xl font-semibold">{money(amount, currency)}</p>)}
      {open.size === 0 && <p className="mt-2 text-muted-foreground">—</p>}</section>
    <form className="flex items-end gap-2 text-sm"><input type="hidden" name="supplier" value={selected.id} />
      <label>{t("expenseMonth")}<input type="month" name="month" defaultValue={month}
        className="mt-1 block rounded-md border p-2" /></label>
      <button className="rounded-md border px-4 py-2">{t("filter")}</button></form>
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border bg-white"><h2 className="border-b p-4 font-semibold">{t("supplierInvoicesMonth")}</h2>
        <div className="divide-y">{(invoicesResult.data ?? []).map((invoice) => <div key={invoice.id} className="flex justify-between gap-3 p-4 text-sm">
          <span><strong>{invoice.invoice_number}</strong><span className="block text-xs text-muted-foreground">{invoice.issued_on}</span></span>
          <span className="text-right"><strong className="font-mono">{money(invoice.amount, invoice.currency)}</strong>
            <a href={`/api/finance/invoices/${invoice.id}/file`} target="_blank" rel="noopener noreferrer"
              className="block text-xs text-primary">{invoice.file_name ?? t("invoiceFile")}</a></span>
        </div>)}{(invoicesResult.data ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("noInvoices")}</p>}</div>
      </div>
      <div className="rounded-xl border bg-white"><h2 className="border-b p-4 font-semibold">{t("supplierPaymentsMonth")}</h2>
        <div className="divide-y">{(cashResult.data ?? []).map((tx) => <div key={tx.id} className="flex justify-between gap-3 p-4 text-sm">
          <span>{tx.settled_on} · {t(`paymentMethods.${tx.method}` as "paymentMethods.transfer")}
            {tx.order_id && orderNumbers.has(tx.order_id) && <Link href={`/finance/orders/${tx.order_id}`}
              className="block font-mono text-xs text-primary">{orderNumbers.get(tx.order_id)}</Link>}</span>
          <strong className="font-mono">{money(tx.amount, tx.currency)}</strong>
        </div>)}{(cashResult.data ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("noCashHistory")}</p>}</div>
      </div>
    </section>
    <section className="rounded-xl border bg-white"><h2 className="border-b p-4 font-semibold">{t("supplierOrdersAndCosts")}</h2>
      <div className="divide-y">{recent.map((entry) => <div key={entry.id} className="grid gap-2 p-4 text-sm sm:grid-cols-[1fr_1fr_auto]">
        <span>{entry.order_id && orderNumbers.has(entry.order_id)
          ? <Link href={`/finance/orders/${entry.order_id}`} className="font-mono text-primary">{orderNumbers.get(entry.order_id)}</Link>
          : t("withoutOrder")}{entry.description && <span className="block text-xs text-muted-foreground">{entry.description}</span>}</span>
        <span>{entry.due_on ?? t("noDate")} · {t(`statuses.${entry.status}` as "statuses.review")}</span>
        <span className="font-mono">{t("openPayables")}: {money(entry.open_amount, entry.currency)}</span>
      </div>)}{recent.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("empty")}</p>}</div>
      {entries.length > 50 && <p className="p-4 text-xs text-muted-foreground">{t("supplierRecentLimit")}</p>}
    </section>
  </main>;
}
