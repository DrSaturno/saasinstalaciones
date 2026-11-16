"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Eye, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { useFinanceActions } from "@/components/company/finance-action-context";
import { FinanceHelp } from "@/components/company/finance-hint";
import type { FinanceWorkspace } from "@/lib/data/finance-workspace";
import { buildWeeklyDigest, type DigestEntry } from "@/lib/domain/finance-approval";
import { weeklyDigestEmail } from "@/lib/email/finance-templates";

export type DigestSettings = { enabled: boolean; weekday: number; hour: number; email: string };
export const DEFAULT_DIGEST_SETTINGS: DigestSettings = { enabled: true, weekday: 7, hour: 4, email: "" };

/** Lo abierto de la empresa, en la forma que usa el correo (la misma que arma la base). */
function digestEntries(data: FinanceWorkspace): DigestEntry[] {
  const finished = new Set(data.orders.filter((order) => order.status === "finalizada").map((order) => order.id));
  const invoiced = new Set(data.documents.filter((file) => file.kind === "invoice").map((file) => file.entry_id));
  return data.entries
    .filter((entry) => entry.direction === "payable" && ["review", "approved"].includes(entry.status) && entry.open_amount > 0)
    .map((entry) => ({
      id: entry.id, status: entry.status as "review" | "approved", zone: entry.zone, category: entry.category,
      party: entry.partyName, party_kind: entry.supplierKind ?? "other", order_number: entry.orderNumber,
      site: entry.siteName, city: null, description: entry.description, amount: entry.open_amount,
      currency: entry.currency, due_on: entry.due_on,
      order_finished: !entry.order_id || finished.has(entry.order_id),
      requires_invoice: ["installation", "coordination", "logistics", "service"].includes(entry.category),
      has_invoice: invoiced.has(entry.id) || entry.invoices.length > 0,
    }));
}

/**
 * Aviso semanal por correo (FLX-10): cuándo llega, a qué casilla, y cómo se ve.
 * La vista previa se arma con la misma plantilla y los mismos números que el
 * correo real, sin mandar nada.
 */
export function FinanceDigestSettings({ data, today, initial, accountEmail, canEdit }: {
  data: FinanceWorkspace; today: string; initial: DigestSettings; accountEmail: string; canEdit: boolean;
}) {
  const t = useTranslations("FinanceDigest");
  const mail = useTranslations("FinanceEmails.weeklyDigest");
  const locale = useLocale();
  const { saveFinanceDigestSettings, sendFinanceDigestTest } = useFinanceActions();
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  const weekdays = [1, 2, 3, 4, 5, 6, 7];
  const dayName = (day: number) => new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(2026, 10, 8 + day)));
  const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

  const html = useMemo(() => {
    const entries = digestEntries(data);
    const digest = buildWeeklyDigest({ today, amba_weekday: 1, interior_weekday: 2, entries });
    const lang = locale.startsWith("pt") ? "pt" : "es";
    return weeklyDigestEmail({
      digest, locale: lang, companyName: t("previewCompany"), url: "/finance/approvals",
      copy: {
        subject: mail("subject", { count: digest.toApproveCount }), eyebrow: mail("eyebrow"), heading: mail("heading"),
        introPending: mail("introPending", { count: digest.toApproveCount }), introNothing: mail("introNothing"),
        toApprove: mail("toApprove"), amba: mail("amba"), interior: mail("interior"), general: mail("general"),
        subtotal: mail("subtotal"), none: mail("none"), notFinished: mail("notFinished", { count: digest.notFinishedCount }),
        whatIsPaid: mail("whatIsPaid"), ready: mail("ready"), awaitingInvoice: mail("awaitingInvoice"),
        generalReady: mail("generalReady"), cta: mail("cta"), footnote: mail("footnote"),
      },
    });
  }, [data, today, locale, mail, t]);

  return (
    <section className="finance-card overflow-hidden" aria-labelledby="digest-title">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left">
        <Mail className="size-4 text-primary" aria-hidden="true" />
        <span id="digest-title" className="text-sm font-semibold">{t("title")}</span>
        <span className="text-xs text-[#718391]">
          {saved.enabled ? t("summary", { day: dayName(saved.weekday), hour: hourLabel(saved.hour) }) : t("summaryOff")}
        </span>
        <span className="ml-auto text-xs font-medium text-primary">{open ? t("hide") : t("configure")}</span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-[#e9eef3] p-5">
          <p className="max-w-3xl text-xs leading-relaxed text-[#718391]">{t("hint")}</p>
          <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => {
            event.preventDefault();
            start(async () => {
              const result = await saveFinanceDigestSettings({ ...settings, email: settings.email.trim() });
              if (result.error) { toast.error(result.error); return; }
              setSaved(settings); toast.success(t("saved"));
            });
          }}>
            <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
              <input type="checkbox" disabled={!canEdit} checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} className="size-4 accent-[var(--primary)]" />
              {t("enabled")}
            </label>
            <label className="space-y-1.5 text-xs text-[#6b7f8f]">{t("weekday")}
              <select disabled={!canEdit || !settings.enabled} value={settings.weekday} onChange={(event) => setSettings({ ...settings, weekday: Number(event.target.value) })} className="block w-full border capitalize">
                {weekdays.map((day) => <option key={day} value={day}>{dayName(day)}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs text-[#6b7f8f]">
              <span className="flex items-center gap-1">{t("hour")}<FinanceHelp text={t("hourHelp")} /></span>
              <select disabled={!canEdit || !settings.enabled} value={settings.hour} onChange={(event) => setSettings({ ...settings, hour: Number(event.target.value) })} className="block w-full border tabular-nums">
                {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs text-[#6b7f8f] sm:col-span-2">
              <span className="flex items-center gap-1">{t("email")}<FinanceHelp text={t("emailHelp")} /></span>
              <input type="email" disabled={!canEdit || !settings.enabled} value={settings.email} onChange={(event) => setSettings({ ...settings, email: event.target.value })} placeholder={accountEmail || t("emailPlaceholder")} className="block w-full border" />
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
              {canEdit && <button disabled={pending || !dirty} className="finance-button finance-button-primary">{pending ? t("saving") : t("save")}</button>}
              <button type="button" className="finance-button" onClick={() => setPreview(!preview)}><Eye className="size-4" aria-hidden="true" />{t(preview ? "hidePreview" : "showPreview")}</button>
              {canEdit && (
                <button type="button" disabled={pending} className="finance-button" onClick={() => start(async () => {
                  const result = await sendFinanceDigestTest();
                  if (result.error) toast.error(result.error); else toast.success(t("testSent"));
                })}><Send className="size-4" aria-hidden="true" />{t("sendTest")}</button>
              )}
              {dirty && <span className="text-xs text-amber-800">{t("unsaved")}</span>}
            </div>
          </form>

          {preview && (
            <div className="space-y-2">
              <p className="text-xs text-[#718391]">{t("previewNote")}</p>
              <div className="rounded-xl border border-[#dfe7ed] bg-[#f4f6f8] p-3">
                <p className="mb-2 text-xs"><span className="text-[#8494a0]">{t("subjectLabel")}</span> <strong>{html.subject}</strong></p>
                <iframe title={t("previewTitle")} srcDoc={html.html} sandbox="" className="h-[720px] w-full rounded-lg border-0 bg-white" />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
