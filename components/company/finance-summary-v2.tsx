"use client";
import { useFinanceActions } from "@/components/company/finance-action-context";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Download, RefreshCw, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { FinanceWorkspace, WorkspaceEntry } from "@/lib/data/finance-workspace";
import { financeStage, sumByCurrency } from "@/lib/domain/finance-approval";
import { financePeriodRange, type FinancePeriod } from "@/lib/domain/finance-ledger";
import { nextFinanceWeekday } from "@/lib/domain/finance-forecast";
import { financeDisplayDate, financeMoney } from "@/lib/domain/finance-presentation";
import { FinanceHelp } from "@/components/company/finance-hint";
import { FinanceInsights } from "@/components/company/finance-insights";
import { FinancePeriodControls } from "@/components/company/finance-period-controls";
import { FinanceMovements } from "@/components/company/finance-movements";

type AlertItem = { id: string; title: string; detail: string; amount: string; href: string; orderId: string | null; orderNumber: string | null };

/**
 * Resumen de Finanzas. «Para resolver» dice CUÁLES son y cada una abre el pago,
 * el cobro o la OT en un clic (FLX-70); la previsión del lunes y el martes sólo
 * cuenta lo que ya tiene factura (D12).
 */
export function FinanceSummaryV2({ data, today }: { data: FinanceWorkspace; today: string }) {
  const { importExistingFinanceOrders } = useFinanceActions();
  const t = useTranslations("FinanceV2"), flow = useTranslations("FinanceApproval"), locale = useLocale();
  const [pending, start] = useTransition();
  const [period, setPeriod] = useState<FinancePeriod>("month"), [range, setRange] = useState(financePeriodRange(today, "month"));
  const [open, setOpen] = useState<string | null>(null);
  const change = (p: FinancePeriod, from?: string, to?: string) => { setPeriod(p); setRange(p === "custom" ? { from: from ?? range.from, to: to ?? range.to } : financePeriodRange(today, p)); };

  const invoiced = new Set(data.documents.filter((file) => file.kind === "invoice").map((file) => file.entry_id));
  const stageOf = (entry: WorkspaceEntry) => financeStage(entry, invoiced.has(entry.id) || entry.invoices.length > 0);
  const finished = new Set(data.orders.filter((order) => order.status === "finalizada").map((order) => order.id));
  const entryById = new Map(data.entries.map((entry) => [entry.id, entry]));
  const money = (rows: WorkspaceEntry[]) => {
    const totals = sumByCurrency(rows, (row) => row.open_amount, (row) => row.currency);
    return totals.length ? totals.map((row) => financeMoney(row.amount, row.currency, locale)).join(" + ") : null;
  };
  const entryHref = (entry: WorkspaceEntry) => `/finance/${entry.direction === "payable" ? "payments" : "collections"}?entry=${entry.id}`;
  const item = (entry: WorkspaceEntry): AlertItem => ({
    id: entry.id, title: entry.partyName, detail: entry.description || entry.projectName || "",
    amount: financeMoney(entry.open_amount, entry.currency, locale), href: entryHref(entry),
    orderId: entry.order_id, orderNumber: entry.orderNumber,
  });

  const payables = data.entries.filter((entry) => entry.direction === "payable" && entry.status !== "void" && entry.amount > 0);
  const toApprove = payables.filter((entry) => entry.status === "review" && (!entry.order_id || finished.has(entry.order_id)));
  const awaitingInvoice = payables.filter((entry) => stageOf(entry) === "awaitingInvoice");
  const readyToPay = payables.filter((entry) => stageOf(entry) === "ready" && entry.open_amount > 0);
  const reviewCollections = data.entries.filter((entry) => entry.status === "review" && entry.direction === "receivable");
  const collectedNoInvoice = data.entries.filter((entry) => entry.direction === "receivable" && entry.status === "approved" && entry.open_amount <= 0 && entry.paid_amount > 0 && !invoiced.has(entry.id) && entry.invoices.length === 0);
  const overdueCheques = data.cheques.filter((cheque) => cheque.status === "pending" && cheque.maturity_on < today);
  const differences = data.entries.filter((entry) => entry.invoices.some((invoice) => invoice.sourceAmount !== null && invoice.sourceAmount !== entry.amount));
  // Un movimiento por operación: un lote o un cheque comparten comprobante.
  const missingProofs = [...new Map(data.transactions
    .filter((tx) => ["transfer", "check"].includes(tx.method) && !tx.proof_document_id)
    .map((tx) => [tx.batch_id ?? tx.cheque_id ?? tx.id, tx])).values()];
  const excessReservations = data.entries.filter((entry) => entry.status !== "void" && entry.reserved_amount > entry.open_amount).length;

  const alerts: { key: string; label: string; help: string; items: AlertItem[]; all: string; tone: "amber" | "violet" | "sky" }[] = [
    { key: "toApprove", label: flow("alerts.toApprove"), help: flow("alerts.toApproveHelp"), items: toApprove.map(item), all: "/finance/approvals", tone: "amber" },
    { key: "awaitingInvoice", label: flow("alerts.awaitingInvoice"), help: flow("alerts.awaitingInvoiceHelp"), items: awaitingInvoice.map(item), all: "/finance/payments?stage=awaitingInvoice", tone: "violet" },
    { key: "readyToPay", label: flow("alerts.readyToPay"), help: flow("alerts.readyToPayHelp"), items: readyToPay.map(item), all: "/finance/payments?stage=ready", tone: "sky" },
    { key: "reviewCollections", label: t("reviewCollections"), help: flow("alerts.reviewCollectionsHelp"), items: reviewCollections.map(item), all: "/finance/collections?status=review", tone: "amber" },
    { key: "collectedNoInvoice", label: flow("alerts.collectedNoInvoice"), help: flow("alerts.collectedNoInvoiceHelp"), items: collectedNoInvoice.map(item), all: "/finance/invoices?direction=issued", tone: "amber" },
    { key: "missingProofs", label: flow("alerts.missingProofs"), help: flow("alerts.missingProofsHelp"), all: "/finance/cash", tone: "amber",
      items: missingProofs.flatMap((tx) => { const entry = entryById.get(tx.entry_id); return entry ? [{ ...item(entry), id: tx.id, amount: financeMoney(tx.amount, entry.currency, locale), detail: `${financeDisplayDate(tx.occurred_on, locale)}${tx.reference ? ` · ${tx.reference}` : ""}` }] : []; }) },
    { key: "differences", label: t("invoiceDifferencesLabel"), help: flow("alerts.differencesHelp"), items: differences.map(item), all: "/finance/queries?differences=1", tone: "amber" },
  ];
  const toneClass = { amber: "bg-amber-50 text-amber-700", violet: "bg-violet-50 text-violet-700", sky: "bg-sky-50 text-sky-700" };

  return (
    <main className="space-y-6 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="finance-title">{t("summary")}</h1><p className="mt-2 text-[13px] text-[#718391]">{t("summaryHint")}</p></div>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance/help" className="finance-button"><CircleHelp className="size-4" aria-hidden="true" />{flow("howItWorks")}</Link>
          <button disabled={pending} onClick={() => start(async () => { const res = await importExistingFinanceOrders(); if (res.error) toast.error(res.error); else toast.success(t("synced")); })} className="finance-button"><RefreshCw className={`size-3.5 ${pending ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />{t("syncOrders")}</button>
          <a className="finance-button" href={`/api/finance/summary/pdf?from=${range.from}&to=${range.to}`} target="_blank" rel="noopener noreferrer"><Download className="size-4" aria-hidden="true" />{t("downloadPdf")}</a>
          <Link href="/finance/approvals" className="finance-button finance-button-primary"><CheckCheck className="size-4" aria-hidden="true" />{flow("approvePayments")}{toApprove.length > 0 && <span className="rounded-md bg-white/20 px-1.5 text-xs tabular-nums">{toApprove.length}</span>}</Link>
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
        <section className="finance-card overflow-hidden">
          <header className="flex items-center gap-2.5 border-b border-[#e9eef3] px-5 py-4"><CalendarDays className="size-4 text-primary" aria-hidden="true" /><h2 className="text-sm font-semibold">{t("upcomingPayments")}</h2><FinanceHelp text={flow("forecastHelp")} /></header>
          <div className="grid divide-y divide-[#e5ecf1] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {(["amba", "interior"] as const).map((zone) => {
              const date = nextFinanceWeekday(today, zone === "amba" ? 1 : 2);
              const inZone = payables.filter((entry) => entry.zone === zone && entry.open_amount > 0);
              const ready = inZone.filter((entry) => stageOf(entry) === "ready" && (!entry.due_on || entry.due_on <= date));
              const waiting = inZone.filter((entry) => stageOf(entry) === "awaitingInvoice");
              return (
                <Link href={`/finance/payments?zone=${zone}&stage=ready`} key={zone} className="group px-6 py-5 transition-colors hover:bg-[#f8fbfd] motion-reduce:transition-none">
                  <div className="flex items-center justify-between gap-2"><p className="text-[13px] font-medium">{t(zone === "amba" ? "monday" : "tuesday")}</p><span className="rounded-md bg-[#eef5fa] px-2 py-1 text-xs font-medium text-[#54809b]">{zone === "amba" ? "AMBA" : t("interior")}</span></div>
                  <p className="mt-1 text-xs text-[#8596a3]">{financeDisplayDate(date, locale)}</p>
                  <p className="mt-5 text-xs text-[#718391]">{flow("readyToPayShort", { count: ready.length })}</p>
                  <p className={`mt-1 font-sans text-[30px] leading-tight font-semibold tracking-[-.04em] tabular-nums ${ready.length ? "" : "text-slate-300"}`}>{money(ready) ?? "—"}</p>
                  <p className="mt-3 text-xs text-violet-800">{waiting.length ? flow("awaitingInvoiceShort", { count: waiting.length, amount: money(waiting) ?? "" }) : flow("noneAwaitingInvoice")}</p>
                  <p className="mt-4 flex items-center gap-2 text-xs text-[#718391]">{t("paymentCalendar")}<ChevronRight className="size-3.5 text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" /></p>
                </Link>
              );
            })}
          </div>
          <p className="border-t border-[#e9eef3] bg-[#fafcfe] px-5 py-3 text-xs leading-relaxed text-[#7b8e9d]">{flow("forecastFootnote")}</p>
        </section>

        <section className="finance-card overflow-hidden">
          <header className="flex items-center gap-2.5 border-b border-[#e9eef3] px-5 py-4"><TriangleAlert className="size-4 text-amber-500" aria-hidden="true" /><h2 className="text-sm font-semibold">{t("attention")}</h2><FinanceHelp text={flow("attentionHelp")} /></header>
          <ul className="px-3 py-2">
            {alerts.map((alert) => {
              const count = alert.items.length, expanded = open === alert.key;
              return (
                <li key={alert.key} className="border-b border-[#eef2f6] last:border-b-0">
                  <button type="button" disabled={!count} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : alert.key)} className="flex min-h-[54px] w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-[#f8fbfd] disabled:hover:bg-transparent">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-lg text-sm font-semibold tabular-nums ${count ? toneClass[alert.tone] : "bg-[#f3f6f8] text-[#95a5b0]"}`}>{count}</span>
                    <span className={`flex-1 text-[13px] ${count ? "text-[#33556b]" : "text-[#8fa0ac]"}`}>{alert.label}</span>
                    {count > 0 && <ChevronDown className={`size-4 text-[#a9b8c2] transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />}
                  </button>
                  {expanded && (
                    <div className="mb-3 space-y-2 rounded-lg bg-[#f7fafc] p-3">
                      <p className="text-xs leading-relaxed text-[#6b7f8f]">{alert.help}</p>
                      <ul className="space-y-1.5">
                        {alert.items.slice(0, 6).map((row) => (
                          <li key={row.id} className="flex items-center gap-2 rounded-lg border border-[#e3ebf1] bg-white px-3 py-2 text-xs">
                            <Link href={row.href} className="min-w-0 flex-1 hover:text-primary">
                              <span className="block truncate font-medium text-[#25465b]">{row.title}</span>
                              {row.detail && <span className="block truncate text-[#8495a2]">{row.detail}</span>}
                            </Link>
                            {row.orderId && <Link href={`/finance/orders/${row.orderId}`} className="rounded-md bg-[#f0f5f8] px-1.5 py-0.5 font-mono text-[11px] text-[#47718b] hover:bg-blue-50" title={flow("openOrder")}>{row.orderNumber}</Link>}
                            <span className="whitespace-nowrap font-semibold tabular-nums">{row.amount}</span>
                          </li>
                        ))}
                      </ul>
                      <Link href={alert.all} className="inline-flex items-center gap-1 text-xs font-medium text-primary">{count > 6 ? flow("seeAllCount", { count }) : flow("seeAll")}<ChevronRight className="size-3.5" aria-hidden="true" /></Link>
                    </div>
                  )}
                </li>
              );
            })}
            {overdueCheques.length > 0 && <li><Link href="/finance/cheques?overdue=1" className="flex min-h-[54px] items-center gap-3 px-2"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-sm font-semibold text-amber-700 tabular-nums">{overdueCheques.length}</span><span className="flex-1 text-[13px] text-[#33556b]">{t("overdueLabel")}</span><ChevronRight className="size-3.5 text-[#a9b8c2]" aria-hidden="true" /></Link></li>}
            {excessReservations > 0 && <li><Link href="/finance/cheques" className="block px-2 py-3 text-xs text-amber-800">{t("excessReservations", { count: excessReservations })}</Link></li>}
          </ul>
        </section>
      </div>

      <FinanceInsights data={data} today={today} />

      <section className="finance-card flex flex-wrap items-center justify-between gap-4 px-5 py-4"><p className="flex items-center gap-2 text-[13px] font-medium text-[#647b8c]"><SlidersHorizontal className="size-4" aria-hidden="true" />{t("activityPeriod")}</p><FinancePeriodControls period={period} from={range.from} to={range.to} onChange={change} /></section>
      {range.from > range.to ? <p role="alert" className="text-destructive">{t("invalidRange")}</p> : <FinanceMovements data={data} from={range.from} to={range.to} />}
    </main>
  );
}
