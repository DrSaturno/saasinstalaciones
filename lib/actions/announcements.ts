"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sendAnnouncementEmail } from "@/lib/email/announcements";
import { createClient } from "@/lib/supabase/server";
import { INTL_LOCALE } from "@/i18n/config";

const schema = z
  .object({
    title: z.string().trim().min(2).max(120),
    body: z.string().trim().min(2).max(2000),
    severity: z.enum(["info", "warning", "critical"]),
    audienceType: z.enum(["all", "zone", "project"]),
    audienceRef: z.string().trim().max(120),
  })
  .refine((value) => value.audienceType === "all" || value.audienceRef.length > 0, {
    path: ["audienceRef"],
  });

export type AnnouncementState = {
  error: string | null;
  ok?: boolean;
  recipients?: number;
  emailed?: boolean;
};

/**
 * Publica un anuncio para los instaladores de la empresa.
 *
 * El reparto a la bandeja (y con ella el Web Push) lo hace la RPC
 * `publish_announcement`, que valida permisos y arma el público. Acá encima se
 * manda el email a esos mismos destinatarios, best effort: si Resend no está
 * configurado o falla, el anuncio ya llegó igual in-app.
 */
export async function publishAnnouncement(
  _prev: AnnouncementState,
  formData: FormData,
): Promise<AnnouncementState> {
  const t = await getTranslations("Errors");
  const parsed = schema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    severity: formData.get("severity") ?? "info",
    audienceType: formData.get("audienceType") ?? "all",
    audienceRef: formData.get("audienceRef") ?? "",
  });
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const user = await getCurrentUser();
    if (
      !user ||
      // Sólo el gerente: los anuncios son comunicación de empresa.
      user.role !== "company_manager" ||
      !user.companyId
    ) {
      return { error: t("accessDenied") };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("publish_announcement", {
      p_title: parsed.data.title,
      p_body: parsed.data.body,
      p_severity: parsed.data.severity,
      p_audience_type: parsed.data.audienceType,
      p_audience_ref: parsed.data.audienceRef,
    });
    if (error) return { error: error.message };

    const result = Array.isArray(data) ? data[0] : null;
    const recipients = result?.recipients ?? 0;

    let emailed = false;
    if (result && recipients > 0) {
      emailed = (await deliverEmails(supabase, user, result.announcement_id, parsed.data)) === "sent";
    }

    revalidatePath("/dashboard");
    return { error: null, ok: true, recipients, emailed };
  } catch {
    return { error: t("unexpected") };
  }
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function deliverEmails(
  supabase: SupabaseServerClient,
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  announcementId: string,
  input: z.infer<typeof schema>,
) {
  // Los emails viven en auth.users: los trae la función vetada, que revalida
  // que quien llama sea operador de la empresa dueña del anuncio.
  const [{ data: rows }, { data: company }, emailT] = await Promise.all([
    supabase.rpc("announcement_recipient_emails", { p_announcement_id: announcementId }),
    supabase.from("companies").select("name").eq("id", user.companyId!).single(),
    getTranslations({
      locale: INTL_LOCALE[user.locale],
      namespace: "AnnouncementEmail",
    }),
  ]);
  const emails = [...new Set((rows ?? []).map((row) => row.email))].filter(
    (value): value is string => Boolean(value && value.includes("@")),
  );
  if (!emails.length) return "not_configured";

  return sendAnnouncementEmail({
    to: emails,
    announcementId,
    companyName: company?.name ?? "Instala Pro",
    title: input.title,
    body: input.body,
    copy: {
      subject: emailT("subject", { company: company?.name ?? "Instala Pro" }),
      intro: emailT("intro"),
      footer: emailT("footer"),
    },
  });
}
