import "server-only";

import { applicationOrigin } from "@/lib/app-origin";
import { logEvent } from "@/lib/observability";
import { EXTERNAL_TIMEOUT_MS } from "@/lib/http/timeout";

export type InvitationEmailStatus = "sent" | "not_configured" | "failed";

type InvitationEmailCopy = {
  subject: string;
  heading: string;
  body: string;
  cta: string;
  expires: string;
  fallback: string;
  imageAlt?: string;
  language?: "es" | "pt";
};

type SendInvitationEmailInput = {
  to: string;
  token: string;
  invitationUrl: string;
  copy: InvitationEmailCopy;
};

type SendManagerActivationEmailInput = {
  to: string;
  userId: string;
  activationUrl: string;
  copy: InvitationEmailCopy;
};

export function invitationUrl(token: string): string {
  const path = `/invite/${encodeURIComponent(token)}`;
  try {
    return new URL(path, applicationOrigin()).toString();
  } catch {
    // Un origen mal configurado no puede tumbar el alta: se devuelve el link
    // local y la UI ofrece copiarlo a mano.
    return `http://localhost:3000${path}`;
  }
}

export function invitationHeroUrl(origin?: string): string {
  const path = "/images/invitation-email-hero.jpg";
  try {
    return new URL(path, origin ?? applicationOrigin()).toString();
  } catch {
    return `http://localhost:3000${path}`;
  }
}

/**
 * Link cross-device para activar una cuenta y fijar su primera contraseña.
 * Recibe el hash que entrega `generateLink`; nunca usa ni expone el OTP crudo.
 */
export function managerActivationUrl(
  tokenHash: string,
  origin = applicationOrigin(),
): string {
  const url = new URL("/api/auth/callback", origin);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "invite");
  return url.toString();
}

export async function sendInvitationEmail(
  input: SendInvitationEmailInput,
): Promise<InvitationEmailStatus> {
  return sendEmail({
    to: input.to,
    url: input.invitationUrl,
    copy: input.copy,
    imageUrl: invitationHeroUrl(),
    idempotencyKey: `installer-invitation-${input.token}`,
  });
}

export async function sendManagerActivationEmail(
  input: SendManagerActivationEmailInput,
): Promise<InvitationEmailStatus> {
  return sendEmail({
    to: input.to,
    url: input.activationUrl,
    copy: input.copy,
    // El token de activación no debe aparecer en headers ni logs.
    idempotencyKey: `company-manager-activation-${input.userId}`,
  });
}

async function sendEmail(input: {
  to: string;
  url: string;
  copy: InvitationEmailCopy;
  imageUrl?: string;
  idempotencyKey: string;
}): Promise<InvitationEmailStatus> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) return "not_configured";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.copy.subject,
        html: invitationHtml(input.url, input.copy, input.imageUrl),
        text: invitationText(input.url, input.copy),
      }),
      cache: "no-store",
      // Sin timeout, un Resend colgado bloquea la Server Action que lo espera
      // hasta que la plataforma corta la función. En el alta de empresa eso es
      // grave: la compensación que borra empresa y usuario corre DESPUÉS de
      // esta llamada, así que un cuelgue deja exactamente el huérfano que esa
      // compensación existe para evitar (OPS-13).
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
    });

    if (!response.ok) {
      logEvent("error", "email.invitation.failed", {
        provider: "resend",
        http_status: response.status,
      });
      return "failed";
    }
    return "sent";
  } catch (error) {
    logEvent("error", "email.invitation.failed", {
      provider: "resend",
      reason: error instanceof Error ? error.name : "unknown",
    });
    return "failed";
  }
}

function invitationHtml(
  url: string,
  copy: InvitationEmailCopy,
  imageUrl?: string,
): string {
  const safeUrl = escapeHtml(url);
  const hero =
    imageUrl && copy.imageAlt
      ? `<div style="padding:0 24px">
          <img src="${escapeHtml(imageUrl)}" width="512" alt="${escapeHtml(copy.imageAlt)}" style="display:block;width:100%;max-width:512px;height:auto;border:0;border-radius:12px;background:#f3f8ff" />
        </div>`
      : "";
  return `<!doctype html>
<html lang="${copy.language ?? "es"}">
  <body style="margin:0;background:#fafafa;color:#070709;font-family:Inter,Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:40px 20px">
      <div style="overflow:hidden;background:#fff;border:1px solid #e8edf2;border-radius:16px">
        <p style="margin:0;padding:28px 32px 22px;color:#2597d0;font-size:16px;font-weight:700;letter-spacing:-0.2px">Se Instala</p>
        ${hero}
        <div style="padding:28px 32px 32px">
          <h1 style="margin:0 0 14px;font-size:28px;line-height:1.2;letter-spacing:-0.5px">${escapeHtml(copy.heading)}</h1>
          <p style="margin:0 0 24px;color:#60606c;font-size:16px;line-height:1.6">${escapeHtml(copy.body)}</p>
          <a href="${safeUrl}" style="display:inline-block;border-radius:10px;background:#2597d0;color:#fff;padding:13px 20px;text-decoration:none;font-weight:700">${escapeHtml(copy.cta)}</a>
          <p style="margin:26px 0 8px;color:#868c98;font-size:13px;line-height:1.5">${escapeHtml(copy.expires)}</p>
          <p style="margin:0;color:#868c98;font-size:12px;line-height:1.5">${escapeHtml(copy.fallback)}</p>
          <p style="margin:8px 0 0;word-break:break-all;color:#60606c;font-size:12px;line-height:1.5">${safeUrl}</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function invitationText(url: string, copy: InvitationEmailCopy): string {
  return [copy.heading, copy.body, `${copy.cta}: ${url}`, copy.expires, copy.fallback].join(
    "\n\n",
  );
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
