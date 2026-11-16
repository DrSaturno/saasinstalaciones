import { FinanceTransactionProof } from "@/components/company/finance-transaction-proof";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { countryTimezone } from "@/lib/domain/availability";
import { financeBusinessDate } from "@/lib/domain/finance-business-date";

export default async function FinanceCashPage({ searchParams }: {
  searchParams: Promise<{ month?: string; direction?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "company_manager" || !user.companyId || !user.canManageFinance) redirect("/dashboard");
  const [t, flow, params, supabase] = await Promise.all([
    getTranslations("FinanceOperations"), getTranslations("FinanceApproval"), searchParams, createClient(),
  ]);
  const { data: company } = await supabase.from("companies").select("country")
    .eq("id", user.companyId).maybeSingle();
  const today = financeBusinessDate(new Date(), countryTimezone(company?.country ?? "AR"));
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "")
    ? params.month! : today.slice(0, 7);
  const start = `${month}-01`;
  const nextDate = new Date(`${start}T12:00:00Z`);
  nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  const nextMonth = nextDate.toISOString().slice(0, 10);
  const page = Math.max(0, Math.min(10000, Number.parseInt(params.page ?? "0", 10) || 0));
  let query = supabase.from("finance_cash_movements")
    .select("id,entry_id,direction,settled_on,amount,currency,order_id,supplier_id,client_id,category,description,method,reference,proof_document_id,batch_id,cheque_id", { count: "exact" })
    .eq("company_id", user.companyId).gte("settled_on", start).lt("settled_on", nextMonth);
  if (params.direction === "payable" || params.direction === "receivable") {
    query = query.eq("direction", params.direction);
  }
  const { data: movements, count, error } = await query
    .order("settled_on", { ascending: false }).order("id").range(page * 50, page * 50 + 49);
  if (error) return <main className="p-5"><h1 className="text-2xl font-bold">{t("cashLedgerTitle")}</h1>
    <p>{t("schemaPending")}</p></main>;
  const supplierIds = [...new Set((movements ?? []).map((row) => row.supplier_id).filter((id): id is string => !!id))];
  const clientIds = [...new Set((movements ?? []).map((row) => row.client_id).filter((id): id is string => !!id))];
  const orderIds = [...new Set((movements ?? []).map((row) => row.order_id).filter((id): id is string => !!id))];
  const [suppliersResult, clientsResult, ordersResult] = await Promise.all([
    supplierIds.length ? supabase.from("finance_suppliers").select("id,name")
      .eq("company_id", user.companyId).in("id", supplierIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    clientIds.length ? supabase.from("clients").select("id,name")
      .eq("company_id", user.companyId).in("id", clientIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    orderIds.length ? supabase.from("work_orders").select("id,order_number")
      .eq("company_id", user.companyId).in("id", orderIds)
      : Promise.resolve({ data: [] as { id: string; order_number: string }[] }),
  ]);
  const parties = new Map([...(suppliersResult.data ?? []), ...(clientsResult.data ?? [])]
    .map((row) => [row.id, row.name]));
  const orders = new Map((ordersResult.data ?? []).map((row) => [row.id, row.order_number]));
  const money = (amount: number, currency: string) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(amount);
  const queryString = new URLSearchParams({ month, ...(params.direction ? { direction: params.direction } : {}) });
  return <main className="mx-auto max-w-[1480px] space-y-5 pb-12">
    <header><Link href="/finance" className="text-sm text-primary">← {t("back")}</Link>
      <h1 className="mt-2 text-2xl font-bold">{t("cashLedgerTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("cashLedgerHint")}</p></header>
    <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 text-sm">
      <label>{t("expenseMonth")}<input type="month" name="month" defaultValue={month} className="mt-1 block rounded-md border p-2" /></label>
      <label>{t("direction")}<select name="direction" defaultValue={params.direction ?? ""} className="mt-1 block rounded-md border p-2">
        <option value="">{t("allDirections")}</option><option value="payable">{flow("kindPaymentOut")}</option>
        <option value="receivable">{flow("kindCollectionIn")}</option></select></label>
      <button className="rounded-md border px-4 py-2">{t("filter")}</button>
    </form>
    <p className="text-xs text-muted-foreground">{t("cashCount", { count: count ?? 0 })}</p>
    <section className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[760px] text-left text-sm">
      <thead className="border-b bg-muted/30 text-xs text-muted-foreground"><tr>
        <th className="p-3">{t("actualDate")}</th><th className="p-3">{flow("kindColumn")}</th>
        <th className="p-3">{t("party")}</th><th className="p-3">{t("orderNumber")}</th>
        <th className="p-3">{t("paymentMethod")}</th><th className="p-3">{t("paymentReference")}</th>
        <th className="p-3">{t("proof")}</th><th className="p-3 text-right">{t("amount")}</th></tr></thead>
      <tbody className="divide-y">{(movements ?? []).map((row) => <tr key={row.id}>
        <td className="p-3 font-mono text-xs">{row.settled_on}</td>
        <td className="p-3"><span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ${row.direction === "payable" ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>{flow(row.direction === "payable" ? "kindPaymentOut" : "kindCollectionIn")}</span></td>
        <td className="p-3">{parties.get(row.supplier_id ?? row.client_id ?? "") ?? "—"}</td>
        <td className="p-3 font-mono">{row.order_id && orders.has(row.order_id)
          ? <Link href={`/finance/orders/${row.order_id}`} className="text-primary hover:underline">{orders.get(row.order_id)}</Link>
          : t("withoutOrder")}</td>
        <td className="p-3">{t(`paymentMethods.${row.method}` as "paymentMethods.transfer")}</td>
        <td className="p-3 text-xs">{row.reference || "—"}</td>
        <td className="p-3 text-xs">{row.proof_document_id
          ? <a href={`/api/finance/documents/${row.proof_document_id}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t("openProof")}</a>
          : <><span>{t("noDocument")}</span><FinanceTransactionProof transactionId={row.id} entryId={row.entry_id} operationId={row.batch_id??row.cheque_id??undefined} operationType={row.batch_id?"batch":row.cheque_id?"cheque":undefined}/></>}</td>
        <td className={`p-3 text-right font-mono font-semibold ${row.direction === "payable" ? "text-orange-700" : "text-emerald-700"}`}>{row.direction === "payable" ? "− " : "+ "}{money(row.amount, row.currency)}</td>
      </tr>)}</tbody></table>
      {(movements ?? []).length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t("emptyCashLedger")}</p>}
    </section>
    <nav className="flex gap-3 text-sm">{page > 0 && <Link href={`/finance/cash?${queryString}&page=${page - 1}`} className="text-primary">← {t("previousPage")}</Link>}
      {(count ?? 0) > (page + 1) * 50 && <Link href={`/finance/cash?${queryString}&page=${page + 1}`} className="text-primary">{t("nextPage")} →</Link>}</nav>
  </main>;
}


