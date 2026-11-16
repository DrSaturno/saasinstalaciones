"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CheckCheck, Clock3, FileText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { FinanceWorkspace, WorkspaceEntry } from "@/lib/data/finance-workspace";
import { financeStage, financeWaitsForOrder, financeZoneKey, sumByCurrency, type FinanceZoneKey } from "@/lib/domain/finance-approval";
import { nextFinanceWeekday } from "@/lib/domain/finance-forecast";
import { financeDisplayDate, financeMoney } from "@/lib/domain/finance-presentation";
import { useFinanceActions } from "@/components/company/finance-action-context";
import { FinanceConfirmNotice } from "@/components/company/finance-confirm-notice";
import { FinanceDigestSettings, type DigestSettings } from "@/components/company/finance-digest-settings";
import { FinanceHelp } from "@/components/company/finance-hint";

const ZONES: FinanceZoneKey[] = ["amba", "interior", "general"];

/**
 * El dueño puede corregir el importe de todo lo propio de la empresa: lo que nace
 * de una OT (el cambio vuelve a la OT, D8), los gastos fijos y sueldos (sólo ese
 * mes, la plantilla no cambia) y los gastos puntuales. Lo importado del sistema
 * anterior queda fijo.
 */
function amountEditable(entry: WorkspaceEntry): boolean {
  if (entry.source === "operations") return /^order-(team|helper|cost):/.test(entry.source_key ?? "") || Boolean(entry.template_id);
  return entry.source === "manual";
}

function parseAmount(text: string): number | null {
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) && value > 0 && Math.abs(value * 100 - Math.round(value * 100)) < 0.0001 ? value : null;
}

/**
 * Aprobación semanal (FLX-10/11, D16): todo lo que espera la decisión del dueño,
 * separado en AMBA, interior y gastos sin OT, con el subtotal de cada grupo.
 * Quien no es dueño ve la misma lista, sin poder aprobar.
 */
export function FinanceApprovals({ data, today, canApprove, digest }: {
  data: FinanceWorkspace; today: string; canApprove: boolean;
  /** Configuración del aviso semanal; sin ella no se muestra el bloque. */
  digest?: { settings: DigestSettings; accountEmail: string; canEdit: boolean };
}) {
  const t = useTranslations("FinanceApproval");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const { approveFinancePayables } = useFinanceActions();
  const finished = useMemo(
    () => new Set(data.orders.filter((order) => order.status === "finalizada").map((order) => order.id)),
    [data.orders],
  );
  const review = data.entries.filter((entry) => entry.direction === "payable" && entry.status === "review" && entry.amount > 0);
  const approvable = review.filter((entry) => !financeWaitsForOrder(entry, finished));
  const waiting = review.filter((entry) => financeWaitsForOrder(entry, finished));
  const awaitingInvoice = data.entries.filter(
    (entry) => entry.direction === "payable" && financeStage(entry, entry.invoices.length > 0 || data.documents.some((file) => file.entry_id === entry.id && file.kind === "invoice")) === "awaitingInvoice",
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set(approvable.map((entry) => entry.id)));
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);

  const amountOf = (entry: WorkspaceEntry) => (entry.id in amounts ? parseAmount(amounts[entry.id]) : entry.amount);
  const invalid = approvable.filter((entry) => selected.has(entry.id) && amountOf(entry) === null);
  const chosen = approvable.filter((entry) => selected.has(entry.id));
  const totals = (rows: WorkspaceEntry[]) => sumByCurrency(rows, (row) => amountOf(row) ?? 0, (row) => row.currency);
  const money = (rows: WorkspaceEntry[]) => {
    const list = totals(rows);
    return list.length ? list.map((row) => financeMoney(row.amount, row.currency, locale)).join(" + ") : "—";
  };
  const payday = (zone: FinanceZoneKey) => (zone === "general" ? null : nextFinanceWeekday(today, zone === "amba" ? 1 : 2));

  function toggle(id: string) {
    setConfirming(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleGroup(rows: WorkspaceEntry[], on: boolean) {
    setConfirming(false);
    setSelected((current) => {
      const next = new Set(current);
      for (const row of rows) { if (on) next.add(row.id); else next.delete(row.id); }
      return next;
    });
  }
  function submit() {
    start(async () => {
      const result = await approveFinancePayables(chosen.map((entry) => {
        const amount = amountOf(entry);
        return { entryId: entry.id, ...(amount !== null && amount !== entry.amount ? { amount } : {}) };
      }));
      setConfirming(false);
      if (result.error) { toast.error(result.error); return; }
      toast.success(t("approvedToast", { count: result.approved ?? chosen.length }));
      setSelected(new Set());
      setAmounts({});
      router.refresh();
    });
  }

  return (
    <main className="space-y-5 pb-28">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="finance-title">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#718391]">{t("hint")}</p>
        </div>
        <Link href="/finance/help" className="finance-button">{t("howItWorks")}</Link>
      </header>

      {digest && <FinanceDigestSettings data={data} today={today} initial={digest.settings} accountEmail={digest.accountEmail} canEdit={digest.canEdit} />}

      {!canApprove && (
        <p role="status" className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-relaxed text-sky-950">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("ownerOnlyNotice")}
        </p>
      )}

      <div className="finance-card grid divide-y divide-[#e5ecf1] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {ZONES.map((zone) => {
          const rows = approvable.filter((entry) => financeZoneKey(entry) === zone);
          const date = payday(zone);
          return (
            <div key={zone} className="px-5 py-4">
              <p className="flex items-center gap-2 text-xs font-medium text-[#718391]">
                {t(`zones.${zone}`)}
                {date && <span className="rounded-md bg-[#eef5fa] px-1.5 py-0.5 text-[11px] text-[#54809b]">{t(zone === "amba" ? "paysMonday" : "paysTuesday", { date: financeDisplayDate(date, locale) })}</span>}
              </p>
              <p className="mt-2 text-[22px] leading-tight font-semibold tracking-tight tabular-nums">{money(rows.filter((entry) => selected.has(entry.id)))}</p>
              <p className="mt-1 text-xs text-[#8494a0]">{t("selectedOf", { selected: rows.filter((entry) => selected.has(entry.id)).length, total: rows.length })}</p>
            </div>
          );
        })}
      </div>

      {approvable.length === 0 && (
        <div className="finance-card p-12 text-center">
          <CheckCheck className="mx-auto mb-3 size-7 text-emerald-500" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-600">{t("nothingToApprove")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("nothingToApproveHint")}</p>
        </div>
      )}

      {ZONES.map((zone) => {
        const rows = approvable.filter((entry) => financeZoneKey(entry) === zone);
        if (!rows.length) return null;
        const allOn = rows.every((entry) => selected.has(entry.id));
        const date = payday(zone);
        return (
          <section key={zone} className="finance-card overflow-hidden" aria-labelledby={`approval-${zone}`}>
            <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <h2 id={`approval-${zone}`} className="text-sm font-semibold">{t(`zones.${zone}`)}</h2>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-500">{rows.length}</span>
                <FinanceHelp text={t(`zoneHelp.${zone}`)} />
                {date && <span className="text-xs text-[#7c8d9b]">{t(zone === "amba" ? "paysMonday" : "paysTuesday", { date: financeDisplayDate(date, locale) })}</span>}
              </div>
              <div className="flex items-center gap-4 text-xs">
                {canApprove && (
                  <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => toggleGroup(rows, !allOn)}>
                    {t(allOn ? "unselectAll" : "selectAll")}
                  </button>
                )}
                <span className="text-[#6b7f8f]">{t("subtotal")} <strong className="ml-1 text-[15px] font-semibold text-[#17354a] tabular-nums">{money(rows.filter((entry) => selected.has(entry.id)))}</strong></span>
              </div>
            </header>
            <div className="overflow-x-auto">
              <table className="finance-table min-w-[720px]">
                <thead>
                  <tr>
                    {canApprove && <th className="w-10"><span className="sr-only">{t("select")}</span></th>}
                    <th>{t("party")}</th>
                    <th>{t("order")}</th>
                    <th>{t("concept")}</th>
                    <th className="text-right">
                      <span className="inline-flex items-center gap-1">{t("amount")}<FinanceHelp text={t("amountHelp")} /></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => {
                    const editable = canApprove && amountEditable(entry);
                    const value = entry.id in amounts ? amounts[entry.id] : String(entry.amount);
                    const bad = selected.has(entry.id) && amountOf(entry) === null;
                    const changed = amountOf(entry) !== null && amountOf(entry) !== entry.amount;
                    return (
                      <tr key={entry.id}>
                        {canApprove && (
                          <td>
                            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={selected.has(entry.id)} onChange={() => toggle(entry.id)} aria-label={t("selectRow", { party: entry.partyName })} />
                          </td>
                        )}
                        <td className="finance-primary-cell">
                          <p className="font-semibold text-[#25465b]">{entry.partyName}</p>
                          <p className="mt-1 text-xs text-[#7c8d9a]">{t(`categories.${entry.category}` as "categories.installation")}</p>
                        </td>
                        <td>
                          {entry.order_id ? (
                            <Link href={`/finance/orders/${entry.order_id}`} className="rounded-md bg-[#f0f5f8] px-2 py-1 font-mono text-xs font-medium text-[#47718b] hover:bg-blue-50">{entry.orderNumber}</Link>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                          {entry.siteName && <p className="mt-1.5 max-w-52 truncate text-xs text-[#7c8d9a]" title={entry.siteName}>{entry.siteName}</p>}
                        </td>
                        <td className="max-w-64 text-xs text-[#5f7687]"><span className="line-clamp-2" title={entry.description}>{entry.description || entry.projectName || "—"}</span></td>
                        <td className="whitespace-nowrap text-right">
                          {editable ? (
                            <label className="inline-flex flex-col items-end gap-1">
                              <span className="sr-only">{t("amountFor", { party: entry.partyName })}</span>
                              <span className="inline-flex items-center gap-1.5">
                                <span className="text-xs text-[#8494a0]">{entry.currency}</span>
                                <input
                                  inputMode="decimal"
                                  value={value}
                                  onChange={(event) => { setConfirming(false); setAmounts((current) => ({ ...current, [entry.id]: event.target.value })); }}
                                  aria-invalid={bad}
                                  className={`w-32 rounded-lg border px-2.5 py-1.5 text-right text-[15px] font-semibold tabular-nums ${bad ? "border-red-400 bg-red-50" : changed ? "border-amber-400 bg-amber-50" : "border-[#dfe7ed]"}`}
                                />
                              </span>
                              {changed && <span className="text-[11px] text-amber-800">{t("wasAmount", { amount: financeMoney(entry.amount, entry.currency, locale) })}</span>}
                              {bad && <span className="text-[11px] text-red-700">{t("invalidAmount")}</span>}
                            </label>
                          ) : (
                            <span className="text-[15px] font-semibold tabular-nums">{financeMoney(entry.amount, entry.currency, locale)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {(waiting.length > 0 || awaitingInvoice.length > 0) && (
        <section className="grid gap-4 md:grid-cols-2">
          {waiting.length > 0 && (
            <div className="finance-card p-5">
              <p className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4 text-amber-500" aria-hidden="true" />{t("notFinishedTitle", { count: waiting.length })}</p>
              <p className="mt-2 text-xs leading-relaxed text-[#718391]">{t("notFinishedHint")}</p>
              <p className="mt-3 text-lg font-semibold tabular-nums">{money(waiting)}</p>
            </div>
          )}
          {awaitingInvoice.length > 0 && (
            <Link href="/finance/payments?stage=awaitingInvoice" className="finance-card block p-5 hover:bg-[#f8fbfd]">
              <p className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4 text-violet-500" aria-hidden="true" />{t("awaitingInvoiceTitle", { count: awaitingInvoice.length })}</p>
              <p className="mt-2 text-xs leading-relaxed text-[#718391]">{t("awaitingInvoiceHint")}</p>
              <p className="mt-3 text-lg font-semibold tabular-nums">{money(awaitingInvoice)}</p>
            </Link>
          )}
        </section>
      )}

      {canApprove && approvable.length > 0 && (
        <div className="sticky bottom-4 z-10 space-y-3 rounded-2xl border border-[#d5e2ea] bg-white/95 p-4 shadow-lg backdrop-blur">
          {confirming && (
            <FinanceConfirmNotice
              pending={pending}
              message={t("confirmMessage", {
                count: chosen.length,
                amba: money(chosen.filter((entry) => financeZoneKey(entry) === "amba")),
                interior: money(chosen.filter((entry) => financeZoneKey(entry) === "interior")),
                general: money(chosen.filter((entry) => financeZoneKey(entry) === "general")),
              })}
              confirmLabel={t("confirmApprove")}
              onCancel={() => setConfirming(false)}
              onConfirm={submit}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[#5f7687]">
              {t("selectedSummary", { count: chosen.length })}
              <strong className="ml-2 text-base font-semibold text-[#17354a] tabular-nums">{money(chosen)}</strong>
            </p>
            <button
              type="button"
              disabled={pending || chosen.length === 0 || invalid.length > 0}
              onClick={() => setConfirming(true)}
              className="finance-button finance-button-primary"
            >
              <CheckCheck className="size-4" aria-hidden="true" />
              {pending ? t("approving") : t("approveSelected", { count: chosen.length })}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
