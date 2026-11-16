import "server-only";

import { logEvent } from "@/lib/observability";
import { EXTERNAL_TIMEOUT_MS } from "@/lib/http/timeout";
import type { FinanceEmail } from "@/lib/email/finance-templates";

export type FinanceEmailStatus = "sent" | "not_configured" | "skipped" | "failed";

/**
 * Direcciones a las que nunca se escribe: las de prueba. En Staging los correos
 * de los instaladores están enmascarados como `…@staging.invalid`; `.invalid`,
 * `.test` y `.example` son dominios reservados que no existen.
 */
export function isDeliverableAddress(address: string | null | undefined): address is string {
  if (!address) return false;
  const value = address.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return false;
  return !/\.(invalid|test|example|localhost)$/.test(value);
}

/**
 * Envío por Resend, el mismo proveedor de las invitaciones. Mejora progresiva:
 * el aviso dentro de la app ya existe, así que un correo que falla se registra
 * y no rompe la operación que lo disparó.
 */
export async function sendFinanceEmail(input: {
  to: string | null | undefined;
  email: FinanceEmail;
  idempotencyKey: string;
  event: string;
}): Promise<FinanceEmailStatus> {
  if (!isDeliverableAddress(input.to)) return "skipped";
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
        to: [input.to.trim()],
        subject: input.email.subject,
        html: input.email.html,
        text: input.email.text,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
    });
    if (!response.ok) {
      logEvent("error", "email.finance.failed", { provider: "resend", http_status: response.status, kind: input.event });
      return "failed";
    }
    return "sent";
  } catch (error) {
    logEvent("error", "email.finance.failed", {
      provider: "resend", kind: input.event, reason: error instanceof Error ? error.name : "unknown",
    });
    return "failed";
  }
}
