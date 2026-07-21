import "server-only";

export type InvitationEmailStatus = "sent" | "not_configured" | "failed";

type InvitationEmailCopy = {
  subject: string;
  heading: string;
  body: string;
  cta: string;
  expires: string;
  fallback: string;
};

type SendInvitationEmailInput = {
  to: string;
  token: string;
  invitationUrl: string;
  copy: InvitationEmailCopy;
};

export function invitationUrl(token: string): string {
  const configured = process.env.APP_URL?.trim();
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const candidate = configured || (vercelHost ? `https://${vercelHost}` : "");

  try {
    const origin = new URL(candidate || "http://localhost:3000");
    const allowedProtocol =
      origin.protocol === "https:" ||
      (origin.protocol === "http:" &&
        (origin.hostname === "localhost" || origin.hostname === "127.0.0.1"));
    if (!allowedProtocol || origin.username || origin.password) {
      throw new Error("Invalid application origin");
    }
    return new URL(`/invite/${encodeURIComponent(token)}`, origin.origin).toString();
  } catch {
    return `http://localhost:3000/invite/${encodeURIComponent(token)}`;
  }
}

export async function sendInvitationEmail(
  input: SendInvitationEmailInput,
): Promise<InvitationEmailStatus> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) return "not_configured";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `installer-invitation-${input.token}`,
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.copy.subject,
        html: invitationHtml(input.invitationUrl, input.copy),
        text: invitationText(input.invitationUrl, input.copy),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`[resend] Invitation delivery failed with status ${response.status}`);
      return "failed";
    }
    return "sent";
  } catch {
    console.error("[resend] Invitation delivery failed before receiving a response");
    return "failed";
  }
}

function invitationHtml(url: string, copy: InvitationEmailCopy): string {
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#fafafa;color:#070709;font-family:Inter,Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px">
      <div style="background:#fff;border:1px solid #eceff1;border-radius:14px;padding:32px">
        <p style="margin:0 0 24px;color:#2597d0;font-weight:700">Instala Pro</p>
        <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2">${escapeHtml(copy.heading)}</h1>
        <p style="margin:0 0 24px;color:#60606c;line-height:1.6">${escapeHtml(copy.body)}</p>
        <a href="${safeUrl}" style="display:inline-block;border-radius:10px;background:#2597d0;color:#fff;padding:12px 18px;text-decoration:none;font-weight:700">${escapeHtml(copy.cta)}</a>
        <p style="margin:24px 0 8px;color:#868c98;font-size:13px">${escapeHtml(copy.expires)}</p>
        <p style="margin:0;color:#868c98;font-size:12px;line-height:1.5">${escapeHtml(copy.fallback)}</p>
        <p style="margin:8px 0 0;word-break:break-all;color:#60606c;font-size:12px">${safeUrl}</p>
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
