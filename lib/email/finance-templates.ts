import type { DigestEntry, DigestTotals, WeeklyDigest } from "@/lib/domain/finance-approval";
import { financeDisplayDate, financeMoney } from "@/lib/domain/finance-presentation";

/**
 * Correos de Finanzas. Misma estética que la invitación (`lib/email/invitations.ts`):
 * fondo #fafafa, tarjeta blanca con borde suave y radio 16, marca en #2597d0,
 * botón azul. Sólo arma HTML y texto: no envía nada, para poder probarlo.
 */

export type FinanceEmail = { subject: string; html: string; text: string };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

function brandFrame(input: {
  language: "es" | "pt";
  eyebrow?: string;
  heading: string;
  intro: string;
  body?: string;
  cta: { label: string; url: string };
  footnote: string;
}): string {
  const url = escapeHtml(input.cta.url);
  return `<!doctype html>
<html lang="${input.language}">
  <body style="margin:0;background:#fafafa;color:#070709;font-family:Inter,Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:40px 20px">
      <div style="overflow:hidden;background:#fff;border:1px solid #e8edf2;border-radius:16px">
        <p style="margin:0;padding:28px 32px 22px;color:#2597d0;font-size:16px;font-weight:700;letter-spacing:-0.2px">Se Instala</p>
        <div style="padding:0 32px 32px">
          ${input.eyebrow ? `<p style="margin:0 0 8px;color:#868c98;font-size:13px">${escapeHtml(input.eyebrow)}</p>` : ""}
          <h1 style="margin:0 0 14px;font-size:26px;line-height:1.2;letter-spacing:-0.5px">${escapeHtml(input.heading)}</h1>
          <p style="margin:0 0 24px;color:#60606c;font-size:16px;line-height:1.6">${escapeHtml(input.intro)}</p>
          ${input.body ?? ""}
          <a href="${url}" style="display:inline-block;border-radius:10px;background:#2597d0;color:#fff;padding:13px 20px;text-decoration:none;font-weight:700">${escapeHtml(input.cta.label)}</a>
          <p style="margin:26px 0 0;color:#868c98;font-size:12px;line-height:1.5">${escapeHtml(input.footnote)}</p>
          <p style="margin:8px 0 0;word-break:break-all;color:#60606c;font-size:12px;line-height:1.5">${url}</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// Aviso del domingo al dueño
// ---------------------------------------------------------------------------

export type WeeklyDigestCopy = {
  subject: string;
  eyebrow: string;
  heading: string;
  introPending: string;
  introNothing: string;
  toApprove: string;
  amba: string;
  interior: string;
  general: string;
  subtotal: string;
  none: string;
  notFinished: string;
  whatIsPaid: string;
  ready: string;
  awaitingInvoice: string;
  generalReady: string;
  cta: string;
  footnote: string;
};

function moneyList(totals: DigestTotals, locale: string): string {
  return totals.length ? totals.map((row) => financeMoney(row.amount, row.currency, locale)).join(" + ") : "—";
}

function entryLabel(entry: DigestEntry): string {
  const place = [entry.order_number, entry.site, entry.city].filter(Boolean).join(" · ");
  return place || entry.description || "";
}

function zoneTable(title: string, rows: DigestEntry[], totals: DigestTotals, copy: WeeklyDigestCopy, locale: string): string {
  if (!rows.length) return "";
  const lines = rows.map((entry) => `<tr>
      <td style="padding:9px 0;border-top:1px solid #eef2f6;vertical-align:top">
        <span style="display:block;font-size:14px;font-weight:600;color:#070709">${escapeHtml(entry.party)}</span>
        <span style="display:block;margin-top:2px;font-size:12px;color:#868c98">${escapeHtml(entryLabel(entry))}</span>
      </td>
      <td style="padding:9px 0;border-top:1px solid #eef2f6;text-align:right;vertical-align:top;white-space:nowrap;font-size:14px;font-weight:600">${escapeHtml(financeMoney(entry.amount, entry.currency, locale))}</td>
    </tr>`).join("");
  return `<div style="margin:0 0 20px;border:1px solid #e8edf2;border-radius:12px;padding:14px 16px">
    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#2597d0">${escapeHtml(title)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${lines}
      <tr>
        <td style="padding:10px 0 0;border-top:1px solid #dfe7ed;font-size:13px;color:#60606c">${escapeHtml(copy.subtotal)}</td>
        <td style="padding:10px 0 0;border-top:1px solid #dfe7ed;text-align:right;white-space:nowrap;font-size:15px;font-weight:700">${escapeHtml(moneyList(totals, locale))}</td>
      </tr>
    </table>
  </div>`;
}

function sectionTitle(text: string): string {
  return `<h2 style="margin:8px 0 12px;font-size:17px;line-height:1.3;letter-spacing:-0.2px">${escapeHtml(text)}</h2>`;
}

export function weeklyDigestEmail(input: {
  digest: WeeklyDigest;
  companyName: string;
  url: string;
  locale: "es" | "pt";
  copy: WeeklyDigestCopy;
}): FinanceEmail {
  const { digest, copy, locale } = input;
  const zoneTitle = (zone: "amba" | "interior") => {
    const payday = digest.paydays.find((day) => day.zone === zone)!;
    return `${copy[zone]} · ${financeDisplayDate(payday.date, locale)}`;
  };
  const approveBlocks = [
    zoneTable(zoneTitle("amba"), digest.toApprove.amba, digest.toApproveTotals.amba, copy, locale),
    zoneTable(zoneTitle("interior"), digest.toApprove.interior, digest.toApproveTotals.interior, copy, locale),
    zoneTable(copy.general, digest.toApprove.general, digest.toApproveTotals.general, copy, locale),
  ].join("");
  const paidRows = digest.paydays.map((day) => `<tr>
      <td style="padding:10px 0;border-top:1px solid #eef2f6;font-size:14px;font-weight:600">${escapeHtml(zoneTitle(day.zone))}</td>
      <td style="padding:10px 0;border-top:1px solid #eef2f6;text-align:right;font-size:13px;color:#60606c">
        <span style="display:block;color:#070709;font-size:15px;font-weight:700">${escapeHtml(copy.ready)}: ${escapeHtml(moneyList(day.readyTotals, locale))}</span>
        <span style="display:block;margin-top:2px">${escapeHtml(copy.awaitingInvoice)}: ${escapeHtml(moneyList(day.awaitingInvoiceTotals, locale))}</span>
      </td>
    </tr>`).join("");
  const generalRow = digest.generalReady.length ? `<tr>
      <td style="padding:10px 0;border-top:1px solid #eef2f6;font-size:14px;font-weight:600">${escapeHtml(copy.generalReady)}</td>
      <td style="padding:10px 0;border-top:1px solid #eef2f6;text-align:right;font-size:15px;font-weight:700">${escapeHtml(moneyList(digest.generalReadyTotals, locale))}</td>
    </tr>` : "";
  const body = `${sectionTitle(copy.toApprove)}
    ${approveBlocks || `<p style="margin:0 0 20px;color:#60606c;font-size:14px">${escapeHtml(copy.none)}</p>`}
    ${digest.notFinishedCount ? `<p style="margin:-8px 0 20px;color:#868c98;font-size:12px;line-height:1.5">${escapeHtml(copy.notFinished)}</p>` : ""}
    ${sectionTitle(copy.whatIsPaid)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 26px">${paidRows}${generalRow}</table>`;

  const textZone = (title: string, rows: DigestEntry[], zoneTotals: DigestTotals) => rows.length
    ? [`${title}`, ...rows.map((entry) => `  - ${entry.party} · ${entryLabel(entry)} · ${financeMoney(entry.amount, entry.currency, locale)}`),
      `  ${copy.subtotal}: ${moneyList(zoneTotals, locale)}`].join("\n")
    : "";
  const text = [
    copy.heading,
    digest.toApproveCount ? copy.introPending : copy.introNothing,
    copy.toApprove,
    textZone(zoneTitle("amba"), digest.toApprove.amba, digest.toApproveTotals.amba),
    textZone(zoneTitle("interior"), digest.toApprove.interior, digest.toApproveTotals.interior),
    textZone(copy.general, digest.toApprove.general, digest.toApproveTotals.general),
    copy.whatIsPaid,
    ...digest.paydays.map((day) => `${zoneTitle(day.zone)}: ${copy.ready} ${moneyList(day.readyTotals, locale)} · ${copy.awaitingInvoice} ${moneyList(day.awaitingInvoiceTotals, locale)}`),
    digest.generalReady.length ? `${copy.generalReady}: ${moneyList(digest.generalReadyTotals, locale)}` : "",
    `${copy.cta}: ${input.url}`,
    copy.footnote,
  ].filter(Boolean).join("\n\n");

  return {
    subject: copy.subject,
    html: brandFrame({
      language: locale,
      eyebrow: `${copy.eyebrow} · ${input.companyName}`,
      heading: copy.heading,
      intro: digest.toApproveCount ? copy.introPending : copy.introNothing,
      body,
      cta: { label: copy.cta, url: input.url },
      footnote: copy.footnote,
    }),
    text,
  };
}

// ---------------------------------------------------------------------------
// Avisos al instalador o coordinador
// ---------------------------------------------------------------------------

export type SupplierNoticeCopy = {
  subject: string;
  eyebrow: string;
  heading: string;
  body: string;
  cta: string;
  footnote: string;
};

/** «Tu pago fue aprobado: cargá la factura» y el recordatorio usan el mismo marco. */
export function supplierNoticeEmail(input: { url: string; locale: "es" | "pt"; copy: SupplierNoticeCopy }): FinanceEmail {
  const { copy } = input;
  return {
    subject: copy.subject,
    html: brandFrame({
      language: input.locale, eyebrow: copy.eyebrow, heading: copy.heading, intro: copy.body,
      cta: { label: copy.cta, url: input.url }, footnote: copy.footnote,
    }),
    text: [copy.heading, copy.body, `${copy.cta}: ${input.url}`, copy.footnote].join("\n\n"),
  };
}
