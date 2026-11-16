import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { financeBusinessDate } from "@/lib/domain/finance-business-date";
import { countryTimezone } from "@/lib/domain/availability";
import { FinanceGenerateMonthButton, FinanceNewExpense } from "@/components/company/finance-new-expense";
import { FinanceExpenseTemplateList } from "@/components/company/finance-expense-template-list";
import { FinanceOperationsTable } from "@/components/company/finance-operations-table";

export default async function FinanceExpensesPage({ searchParams }: {
  searchParams: Promise<{ month?: string; q?: string; status?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "company_manager" || !user.companyId || !user.canManageFinance) redirect("/dashboard");
  const [t, expense, params, supabase] = await Promise.all([
    getTranslations("FinanceOperations"), getTranslations("FinanceExpense"), searchParams, createClient(),
  ]);
  const { data: company } = await supabase.from("companies").select("country")
    .eq("id", user.companyId).maybeSingle();
  const today = financeBusinessDate(new Date(), countryTimezone(company?.country ?? "AR"));
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "")
    ? params.month! : today.slice(0, 7);
  const start = `${month}-01`;
  const end = new Date(`${month}-01T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const nextMonth = end.toISOString().slice(0, 10);
  const [suppliersResult, templatesResult, entriesResult, clientsResult] = await Promise.all([
    supabase.from("finance_suppliers").select("id,name,kind")
      .eq("company_id", user.companyId).order("name"),
    supabase.from("finance_expense_templates").select("*")
      .eq("company_id", user.companyId).order("description"),
    supabase.from("finance_entry_balances").select("*")
      .eq("company_id", user.companyId).eq("direction", "payable")
      .is("order_id", null).gte("due_on", start).lt("due_on", nextMonth)
      .order("due_on"),
    supabase.from("clients").select("id,name").eq("company_id", user.companyId).order("name"),
  ]);
  if (suppliersResult.error || templatesResult.error || entriesResult.error || clientsResult.error) {
    return <main className="mx-auto max-w-6xl p-5"><h1 className="text-2xl font-bold">{t("expensesTitle")}</h1>
      <p className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm">{t("schemaPending")}</p></main>;
  }
  const suppliers = suppliersResult.data ?? [];
  const entries = entriesResult.data ?? [];
  const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const ids = entries.map((entry) => entry.id);
  const { data: documents } = ids.length
    ? await supabase.from("finance_documents").select("id,entry_id,kind,file_name")
      .eq("company_id", user.companyId).in("entry_id", ids)
    : { data: [] as { id: string; entry_id: string; kind: string; file_name: string }[] };
  const { data: allocations } = ids.length
    ? await supabase.from("finance_invoice_allocations").select("invoice_id,entry_id")
      .eq("company_id", user.companyId).in("entry_id", ids)
    : { data: [] as { invoice_id: string; entry_id: string }[] };
  const invoiceIds = [...new Set((allocations ?? []).map((row) => row.invoice_id))];
  const { data: invoices } = invoiceIds.length
    ? await supabase.from("finance_invoices").select("id,file_name,invoice_number")
      .eq("company_id", user.companyId).in("id", invoiceIds)
    : { data: [] as { id: string; file_name: string | null; invoice_number: string }[] };
  const invoiceById = new Map((invoices ?? []).map((row) => [row.id, row]));
  const linkedInvoiceDocuments = (allocations ?? []).flatMap((allocation) => {
    const invoice = invoiceById.get(allocation.invoice_id);
    return invoice ? [{ id: invoice.id, entry_id: allocation.entry_id, kind: "invoice",
      file_name: invoice.file_name ?? invoice.invoice_number,
      url: `/api/finance/invoices/${invoice.id}/file` }] : [];
  });
  const visible = entries.map((entry) => ({ ...entry,
    partyName: supplierNames.get(entry.supplier_id ?? "") ?? "—", orderNumber: null,
  })).filter((entry) => (!params.q || [entry.partyName, entry.description]
    .some((value) => value.toLocaleLowerCase().includes(params.q!.toLocaleLowerCase()))) &&
    (!params.status || entry.status === params.status));
  return <main className="mx-auto max-w-[1480px] space-y-5 pb-12">
    <header><Link href="/finance" className="text-sm text-primary hover:underline">← {t("back")}</Link>
      <h1 className="mt-2 text-2xl font-bold">{t("expensesTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("expensesSubtitle")}</p></header>
    <form className="flex items-end gap-3 text-sm"><label>{t("expenseMonth")}
      <input type="month" name="month" defaultValue={month} className="mt-1 block rounded-md border p-2" />
    </label><button className="rounded-md border px-4 py-2">{t("filter")}</button></form>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-white p-4"><p className="text-xs text-muted-foreground">{t("monthlyTemplates")}</p><p className="mt-2 font-mono text-2xl font-semibold">{templatesResult.data?.filter((row) => row.active).length ?? 0}</p></div>
      <div className="rounded-xl border bg-white p-4"><p className="text-xs text-muted-foreground">{t("expenseMonth")}</p><p className="mt-2 font-mono text-2xl font-semibold">{entries.length}</p></div>
      <div className="rounded-xl border bg-white p-4"><p className="text-xs text-muted-foreground">{t("openExpenseBalance")}</p><p className="mt-2 font-mono text-xl font-semibold">{new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(entries.filter((entry) => entry.currency === "ARS").reduce((sum, entry) => sum + entry.open_amount, 0))}</p></div>
    </div>
    <section className="finance-card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-base font-semibold">{expense("newExpense")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{expense("newExpenseHint")}</p></div>
        <FinanceGenerateMonthButton month={month} />
      </div>
      <FinanceNewExpense suppliers={suppliers} today={today} />
    </section>
    <FinanceExpenseTemplateList templates={templatesResult.data ?? []} supplierNames={Object.fromEntries(supplierNames)} />
    <FinanceOperationsTable entries={visible} documents={[...(documents ?? []), ...linkedInvoiceDocuments]} filters={params} today={today} filterAction="/finance/expenses" />
  </main>;
}
