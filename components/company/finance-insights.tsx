"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChartNoAxesCombined } from "lucide-react";
import type { FinanceWorkspace } from "@/lib/data/finance-workspace";
import { buildFinanceInsights, type ProfitRow } from "@/lib/domain/finance-insights";
import { financeDisplayDate, financeMoney } from "@/lib/domain/finance-presentation";
import { FinanceHelp } from "@/components/company/finance-hint";

/**
 * Números del negocio en el Resumen (FLX-60, D13): caja del mes, previsión
 * semanal, resultado acumulado y por proyecto/cliente, cobranza y fijos.
 * Cada bloque trae su «?» con qué cuenta y qué no.
 */
export function FinanceInsights({ data, today }: { data: FinanceWorkspace; today: string }) {
  const t = useTranslations("FinanceInsights");
  const locale = useLocale();
  const insights = useMemo(() => buildFinanceInsights({
    entries: data.entries.map((entry) => ({
      id: entry.id, direction: entry.direction, status: entry.status, category: entry.category, amount: entry.amount,
      open_amount: entry.open_amount, paid_amount: entry.paid_amount, currency: entry.currency, due_on: entry.due_on,
      period_month: entry.period_month, projectId: entry.projectId,
    })),
    transactions: data.transactions,
    projects: data.projects,
    clients: data.clients,
  }, today), [data, today]);
  const [currency, setCurrency] = useState(insights[0]?.currency ?? "ARS");
  const [view, setView] = useState<"projects" | "clients">("projects");
  const current = insights.find((row) => row.currency === currency) ?? insights[0];
  if (!current) return null;

  const money = (value: number) => financeMoney(value, current.currency, locale);
  const signed = (value: number) => `${value < 0 ? "−" : ""}${money(Math.abs(value))}`;
  const tone = (value: number) => (value < 0 ? "text-red-700" : "text-emerald-700");
  const percent = (value: number | null) => (value === null ? "—" : `${value.toLocaleString(locale)} %`);
  const netChange = current.month.net - current.previousMonth.net;
  const rows: ProfitRow[] = view === "projects" ? current.projects : current.clients;
  const agingParts = [
    ["current", current.aging.current, "bg-emerald-400"], ["days30", current.aging.days30, "bg-amber-400"],
    ["days60", current.aging.days60, "bg-orange-500"], ["older", current.aging.older, "bg-red-500"],
    ["undated", current.aging.undated, "bg-slate-300"],
  ] as const;
  const weekPeak = Math.max(1, ...current.weeks.flatMap((week) => [week.income, week.expense]));

  return (
    <section className="space-y-5" aria-labelledby="finance-insights-title">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="finance-insights-title" className="flex items-center gap-2 text-base font-semibold"><ChartNoAxesCombined className="size-4 text-primary" aria-hidden="true" />{t("title")}<FinanceHelp text={t("titleHelp")} /></h2>
        {insights.length > 1 && (
          <select aria-label={t("currency")} value={current.currency} onChange={(event) => setCurrency(event.target.value)} className="border">
            {insights.map((row) => <option key={row.currency} value={row.currency}>{row.currency}</option>)}
          </select>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="finance-card p-5">
          <p className="flex items-center gap-1 text-xs font-medium text-[#718391]">{t("cashFlowMonth")}<FinanceHelp text={t("cashFlowHelp")} /></p>
          <p className={`mt-2 text-[26px] leading-tight font-semibold tracking-tight tabular-nums ${tone(current.month.net)}`}>{signed(current.month.net)}</p>
          <dl className="mt-3 space-y-1 border-t border-[#e9eef3] pt-3 text-xs text-[#6b7f8f]">
            <div className="flex justify-between"><dt>{t("income")}</dt><dd className="font-medium text-emerald-700 tabular-nums">+ {money(current.month.income)}</dd></div>
            <div className="flex justify-between"><dt>{t("expense")}</dt><dd className="font-medium text-orange-700 tabular-nums">− {money(current.month.expense)}</dd></div>
            <div className="flex justify-between"><dt>{t("vsPreviousMonth")}</dt><dd className={`font-medium tabular-nums ${tone(netChange)}`}>{netChange >= 0 ? "+ " : "− "}{money(Math.abs(netChange))}</dd></div>
          </dl>
        </div>
        <div className="finance-card p-5">
          <p className="flex items-center gap-1 text-xs font-medium text-[#718391]">{t("accumulatedProfit")}<FinanceHelp text={t("accumulatedHelp")} /></p>
          <p className={`mt-2 text-[26px] leading-tight font-semibold tracking-tight tabular-nums ${tone(current.accumulated.profit)}`}>{signed(current.accumulated.profit)}</p>
          <dl className="mt-3 space-y-1 border-t border-[#e9eef3] pt-3 text-xs text-[#6b7f8f]">
            <div className="flex justify-between"><dt>{t("billable")}</dt><dd className="font-medium tabular-nums">{money(current.accumulated.income)}</dd></div>
            <div className="flex justify-between"><dt>{t("costs")}</dt><dd className="font-medium tabular-nums">{money(current.accumulated.cost)}</dd></div>
            <div className="flex justify-between"><dt>{t("marginGeneral")}</dt><dd className={`font-semibold tabular-nums ${tone(current.accumulated.profit)}`}>{percent(current.accumulated.margin)}</dd></div>
          </dl>
        </div>
        <div className="finance-card p-5">
          <p className="flex items-center gap-1 text-xs font-medium text-[#718391]">{t("receivables")}<FinanceHelp text={t("agingHelp")} /></p>
          <p className="mt-2 text-[26px] leading-tight font-semibold tracking-tight tabular-nums">{money(current.aging.total)}</p>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            {agingParts.map(([key, value, color]) => value > 0 && <span key={key} className={color} style={{ width: `${(value / Math.max(current.aging.total, 1)) * 100}%` }} />)}
          </div>
          <dl className="mt-3 space-y-1 text-xs text-[#6b7f8f]">
            {agingParts.map(([key, value, color]) => (value > 0 || key === "current") && (
              <div key={key} className="flex items-center justify-between gap-2"><dt className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${color}`} aria-hidden="true" />{t(`aging.${key}`)}</dt><dd className="font-medium tabular-nums">{money(value)}</dd></div>
            ))}
          </dl>
        </div>
        <div className="finance-card p-5">
          <p className="flex items-center gap-1 text-xs font-medium text-[#718391]">{t("fixedMonth")}<FinanceHelp text={t("fixedHelp")} /></p>
          <p className="mt-2 text-[26px] leading-tight font-semibold tracking-tight tabular-nums">{money(current.fixed.remaining)}</p>
          <p className="mt-1 text-xs text-[#8494a0]">{t("fixedRemaining")}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><span className="block h-full bg-primary" style={{ width: `${current.fixed.total ? (current.fixed.paid / current.fixed.total) * 100 : 0}%` }} /></div>
          <dl className="mt-3 space-y-1 text-xs text-[#6b7f8f]">
            <div className="flex justify-between"><dt>{t("fixedTotal", { count: current.fixed.count })}</dt><dd className="font-medium tabular-nums">{money(current.fixed.total)}</dd></div>
            <div className="flex justify-between"><dt>{t("fixedPaid")}</dt><dd className="font-medium tabular-nums">{money(current.fixed.paid)}</dd></div>
          </dl>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <section className="finance-card overflow-hidden" aria-labelledby="finance-weeks-title">
          <header className="flex items-center gap-2 border-b border-[#e9eef3] px-5 py-4"><h3 id="finance-weeks-title" className="text-sm font-semibold">{t("weeklyForecast")}</h3><FinanceHelp text={t("weeklyHelp")} /></header>
          <table className="finance-table">
            <thead><tr><th>{t("week")}</th><th className="text-right">{t("toCollect")}</th><th className="text-right">{t("toPay")}</th><th className="text-right">{t("balance")}</th></tr></thead>
            <tbody>
              {current.weeks.map((week, index) => (
                <tr key={week.from}>
                  <td className="text-xs text-[#5f7687]"><span className="font-medium text-[#25465b]">{t(index === 0 ? "thisWeek" : "weekOf")}</span> {financeDisplayDate(week.from, locale)}
                    <span className="mt-1.5 flex h-1.5 gap-0.5" aria-hidden="true"><span className="rounded-full bg-emerald-400" style={{ width: `${(week.income / weekPeak) * 50}%` }} /><span className="rounded-full bg-orange-400" style={{ width: `${(week.expense / weekPeak) * 50}%` }} /></span>
                  </td>
                  <td className="text-right text-emerald-700 tabular-nums">{money(week.income)}</td>
                  <td className="text-right text-orange-700 tabular-nums">{money(week.expense)}</td>
                  <td className={`text-right font-semibold tabular-nums ${tone(week.net)}`}>{signed(week.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="finance-card overflow-hidden" aria-labelledby="finance-profit-title">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e9eef3] px-5 py-4">
            <div className="flex items-center gap-2"><h3 id="finance-profit-title" className="text-sm font-semibold">{t("profitBy")}</h3><FinanceHelp text={t("profitHelp")} /></div>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-medium">
              {(["projects", "clients"] as const).map((value) => (
                <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`rounded-md px-3 py-1.5 ${view === value ? "bg-white text-primary shadow-sm" : "text-[#6b7f8f]"}`}>{t(value)}</button>
              ))}
            </div>
          </header>
          <div className="max-h-[360px] overflow-auto">
            <table className="finance-table min-w-[520px]">
              <thead><tr><th>{t(view === "projects" ? "project" : "client")}</th><th className="text-right">{t("billable")}</th><th className="text-right">{t("costs")}</th><th className="text-right">{t("profit")}</th><th className="text-right">{t("margin")}</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="max-w-56 truncate font-medium text-[#25465b]" title={row.name}>{row.name}</td>
                    <td className="text-right tabular-nums">{money(row.income)}</td>
                    <td className="text-right tabular-nums">{money(row.cost)}</td>
                    <td className={`text-right font-semibold tabular-nums ${tone(row.profit)}`}>{signed(row.profit)}</td>
                    <td className={`text-right tabular-nums ${tone(row.profit)}`}>{percent(row.margin)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground">{t("noProfitRows")}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[#edf1f5] bg-[#fafcfe] px-5 py-3 text-xs leading-relaxed text-[#7b8e9d]">{t("profitFootnote")}</p>
        </section>
      </div>
    </section>
  );
}
