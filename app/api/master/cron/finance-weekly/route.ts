import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { INTL_LOCALE } from "@/i18n/config";
import { applicationOrigin } from "@/lib/app-origin";
import { buildWeeklyDigest, type DigestPayload } from "@/lib/domain/finance-approval";
import { sendFinanceEmail } from "@/lib/email/finance";
import { supplierNoticeEmail, weeklyDigestEmail } from "@/lib/email/finance-templates";
import { logEvent } from "@/lib/observability";
import { requireCronSecret } from "../../_guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/master/cron/finance-weekly — aviso semanal de Finanzas (FLX-10).
 *
 * Lo llama el planificador (`vercel.json`) CADA HORA. La base decide a quién le
 * toca ahora según el día y la hora que cada empresa configuró (por defecto,
 * domingo 04:00 hora local) y no repite el aviso en la misma semana. Por cada
 * empresa a la que le toca:
 *   1. Le manda al dueño qué tiene para aprobar (AMBA e interior por separado)
 *      y cuánto se paga el lunes y el martes. El correo sólo avisa y enlaza: la
 *      aprobación se hace dentro de la plataforma, con sesión.
 *   2. Le recuerda a cada proveedor los pagos aprobados que esperan su factura.
 *
 * Vive bajo `/api/master` porque necesita service_role (no hay sesión que
 * consultar) y ése es el único lugar donde ese cliente está permitido.
 */
export async function GET(request: Request) {
  const guard = requireCronSecret(request);
  if (guard.error) return guard.error;
  const { admin } = guard;

  let origin: string;
  try { origin = applicationOrigin(); } catch { return NextResponse.json({ error: "origin_not_configured" }, { status: 503 }); }

  const { data: companies, error } = await admin.rpc("finance_weekly_digest");
  if (error) {
    logEvent("error", "finance.weekly_digest.failed", { code: error.code ?? null });
    return NextResponse.json({ error: "digest_failed" }, { status: 500 });
  }

  const digests: Record<string, number> = {};
  for (const company of companies ?? []) {
    const payload = company.payload as unknown as DigestPayload;
    const digest = buildWeeklyDigest(payload);
    // Sin nada que aprobar ni que pagar no se molesta a nadie (y esta semana ya está resuelta).
    if (digest.isEmpty) {
      digests.empty = (digests.empty ?? 0) + 1;
      await admin.rpc("finance_mark_digest_sent", { p_company: company.company_id });
      continue;
    }
    const locale = company.locale === "pt" ? "pt" : "es";
    const t = await getTranslations({ locale: INTL_LOCALE[locale], namespace: "FinanceEmails.weeklyDigest" });
    const status = await sendFinanceEmail({
      to: company.recipient,
      event: "weekly_digest",
      // Una vez por empresa y por domingo: un reintento del planificador no duplica.
      idempotencyKey: `finance-weekly-${company.company_id}-${payload.today}`,
      email: weeklyDigestEmail({
        digest, locale, companyName: company.company_name, url: `${origin}/finance/approvals`,
        copy: {
          subject: t("subject", { count: digest.toApproveCount }),
          eyebrow: t("eyebrow"),
          heading: t("heading"),
          introPending: t("introPending", { count: digest.toApproveCount }),
          introNothing: t("introNothing"),
          toApprove: t("toApprove"),
          amba: t("amba"), interior: t("interior"), general: t("general"),
          subtotal: t("subtotal"), none: t("none"),
          notFinished: t("notFinished", { count: digest.notFinishedCount }),
          whatIsPaid: t("whatIsPaid"), ready: t("ready"), awaitingInvoice: t("awaitingInvoice"),
          generalReady: t("generalReady"), cta: t("cta"), footnote: t("footnote"),
        },
      }),
    });
    digests[status] = (digests[status] ?? 0) + 1;
    // Se da por mandado el de esta semana salvo que haya fallado el envío o el correo
    // no esté configurado: en esos casos la próxima pasada (dentro de 36 h) reintenta.
    if (status === "sent" || status === "skipped") {
      await admin.rpc("finance_mark_digest_sent", { p_company: company.company_id });
    }
  }

  const reminders: Record<string, number> = {};
  const { data: pending, error: reminderError } = await admin.rpc("finance_emit_invoice_reminders");
  if (reminderError) logEvent("error", "finance.invoice_reminders.failed", { code: reminderError.code ?? null });
  for (const row of pending ?? []) {
    const locale = row.locale === "pt" ? "pt" : "es";
    const t = await getTranslations({ locale: INTL_LOCALE[locale], namespace: "FinanceEmails.invoiceReminder" });
    const status = await sendFinanceEmail({
      to: row.email,
      event: "invoice_reminder",
      idempotencyKey: `finance-invoice-reminder-${row.installer_id}-${new Date().toISOString().slice(0, 10)}`,
      email: supplierNoticeEmail({
        locale, url: `${origin}/earnings`,
        copy: {
          subject: t("subject"), eyebrow: row.company_name, heading: t("heading"),
          body: t("body", { count: row.pending_count }), cta: t("cta"), footnote: t("footnote"),
        },
      }),
    });
    reminders[status] = (reminders[status] ?? 0) + 1;
  }

  logEvent("info", "finance.weekly_digest.done", { companies: companies?.length ?? 0, ...digests });
  return NextResponse.json({ companies: companies?.length ?? 0, digests, reminders });
}
