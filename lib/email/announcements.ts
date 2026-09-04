import "server-only";

import { logEvent } from "@/lib/observability";
import { EXTERNAL_TIMEOUT_MS } from "@/lib/http/timeout";

export type AnnouncementEmailStatus = "sent" | "not_configured" | "failed";

type AnnouncementEmailInput = {
  to: string[];
  announcementId: string;
  companyName: string;
  title: string;
  body: string;
  copy: { subject: string; intro: string; footer: string };
};

/**
 * Manda el anuncio por email a los destinatarios (best effort).
 *
 * Va en BCC: los instaladores no tienen por qué ver la lista de mails de sus
 * compañeros. Si Resend no está configurado, la bandeja in-app ya alcanzó y
 * esto simplemente no corre.
 */
export async function sendAnnouncementEmail(
  input: AnnouncementEmailInput,
): Promise<AnnouncementEmailStatus> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from || input.to.length === 0) return "not_configured";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `announcement-${input.announcementId}`,
      },
      body: JSON.stringify({
        from,
        to: [from],
        bcc: input.to,
        subject: input.copy.subject,
        html: announcementHtml(input),
        text: [input.copy.intro, input.title, input.body, input.copy.footer].join("\n\n"),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
    });

    if (!response.ok) {
      logEvent("error", "email.announcement.failed", {
        provider: "resend",
        http_status: response.status,
        announcement_id: input.announcementId,
        recipients: input.to.length,
      });
      return "failed";
    }
    return "sent";
  } catch (error) {
    logEvent("error", "email.announcement.failed", {
      provider: "resend",
      reason: error instanceof Error ? error.name : "unknown",
      announcement_id: input.announcementId,
      recipients: input.to.length,
    });
    return "failed";
  }
}

function announcementHtml(input: AnnouncementEmailInput): string {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#fafafa;color:#070709;font-family:Inter,Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px">
      <div style="background:#fff;border:1px solid #eceff1;border-radius:14px;padding:32px">
        <p style="margin:0 0 24px;color:#2597d0;font-weight:700">${escapeHtml(input.companyName)}</p>
        <p style="margin:0 0 8px;color:#868c98;font-size:13px">${escapeHtml(input.copy.intro)}</p>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25">${escapeHtml(input.title)}</h1>
        <p style="margin:0 0 24px;color:#60606c;line-height:1.6;white-space:pre-wrap">${escapeHtml(input.body)}</p>
        <p style="margin:0;color:#868c98;font-size:12px;line-height:1.5">${escapeHtml(input.copy.footer)}</p>
      </div>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}
