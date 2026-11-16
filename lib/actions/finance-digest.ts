"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { INTL_LOCALE } from "@/i18n/config";
import { applicationOrigin } from "@/lib/app-origin";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { buildWeeklyDigest, type DigestPayload } from "@/lib/domain/finance-approval";
import { sendFinanceEmail } from "@/lib/email/finance";
import { weeklyDigestEmail } from "@/lib/email/finance-templates";
import { createClient } from "@/lib/supabase/server";

type Result = { error: string | null };

const settingsSchema = z.object({
  enabled: z.boolean(),
  weekday: z.number().int().min(1).max(7),
  hour: z.number().int().min(0).max(23),
  // Vacío = la casilla de la cuenta del dueño.
  email: z.string().trim().max(254).refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
});

/**
 * Configura el aviso semanal: si se manda, qué día, a qué hora (hora local del
 * país de la empresa) y a qué casilla. Sólo el dueño: el aviso es suyo.
 */
export async function saveFinanceDigestSettings(input: unknown): Promise<Result> {
  const t = await getTranslations("FinanceDigest.errors");
  const user = await getAuthorizedUser();
  if (user?.role !== "company_manager" || !user.companyId || !user.isOwner) return { error: t("ownerOnly") };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalid") };
  const supabase = await createClient();
  // Un cambio de día u hora vuelve a habilitar el envío de esta semana.
  const { error } = await supabase.from("finance_payment_rules").upsert({
    company_id: user.companyId,
    digest_enabled: parsed.data.enabled,
    digest_weekday: parsed.data.weekday,
    digest_hour: parsed.data.hour,
    digest_email: parsed.data.email || null,
    digest_last_sent_at: null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: t("save") };
  revalidatePath("/finance/approvals");
  return { error: null };
}

/**
 * Manda el aviso de HOY, ahora, a la casilla de la cuenta del dueño, para ver
 * cómo le llega. Lleva el asunto marcado como prueba y no cuenta como el aviso
 * de la semana.
 */
export async function sendFinanceDigestTest(): Promise<Result & { status?: "sent" | "not_configured" | "skipped" | "failed" }> {
  const t = await getTranslations("FinanceDigest.errors");
  const user = await getAuthorizedUser();
  if (user?.role !== "company_manager" || !user.companyId || !user.isOwner) return { error: t("ownerOnly") };
  let origin: string;
  try { origin = applicationOrigin(); } catch { return { error: t("noOrigin") }; }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_digest_preview");
  if (error || !data) return { error: t("save") };
  const preview = data as unknown as { company_name: string; payload: DigestPayload };
  const locale = user.locale === "pt" ? "pt" : "es";
  const digest = buildWeeklyDigest(preview.payload);
  const copy = await getTranslations({ locale: INTL_LOCALE[locale], namespace: "FinanceEmails.weeklyDigest" });
  const email = weeklyDigestEmail({
    digest, locale, companyName: preview.company_name, url: `${origin}/finance/approvals`,
    copy: {
      subject: `[${await getTranslations({ locale: INTL_LOCALE[locale], namespace: "FinanceDigest" }).then((x) => x("testPrefix"))}] ${copy("subject", { count: digest.toApproveCount })}`,
      eyebrow: copy("eyebrow"), heading: copy("heading"),
      introPending: copy("introPending", { count: digest.toApproveCount }), introNothing: copy("introNothing"),
      toApprove: copy("toApprove"), amba: copy("amba"), interior: copy("interior"), general: copy("general"),
      subtotal: copy("subtotal"), none: copy("none"), notFinished: copy("notFinished", { count: digest.notFinishedCount }),
      whatIsPaid: copy("whatIsPaid"), ready: copy("ready"), awaitingInvoice: copy("awaitingInvoice"),
      generalReady: copy("generalReady"), cta: copy("cta"), footnote: copy("footnote"),
    },
  });
  const status = await sendFinanceEmail({
    to: user.email, event: "weekly_digest_test", email,
    idempotencyKey: `finance-weekly-test-${user.id}-${Date.now()}`,
  });
  if (status === "not_configured") return { error: t("emailNotConfigured"), status };
  if (status === "skipped") return { error: t("noAddress"), status };
  if (status === "failed") return { error: t("sendFailed"), status };
  return { error: null, status };
}
