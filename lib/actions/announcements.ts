"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sendAnnouncementEmail } from "@/lib/email/announcements";
import { requestPushDelivery } from "@/lib/push/events";
import { createClient } from "@/lib/supabase/server";
import { INTL_LOCALE } from "@/i18n/config";

/**
 * El público ya no es un tipo + una referencia, sino criterios que se
 * combinan (AND). "Buenos Aires + disponibles" es un público válido; con el
 * modelo anterior había que elegir uno de los dos.
 */
const audienceSchema = z.object({
  zones: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  projectIds: z.array(z.string().uuid()).max(30).default([]),
  availableOnly: z.boolean().default(false),
});

export type AnnouncementAudience = z.infer<typeof audienceSchema>;

const schema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(2000),
  severity: z.enum(["info", "warning", "critical"]),
  audience: audienceSchema,
});

function readAudience(formData: FormData): unknown {
  return {
    zones: formData.getAll("zones").filter((value): value is string => typeof value === "string"),
    projectIds: formData
      .getAll("projectIds")
      .filter((value): value is string => typeof value === "string"),
    availableOnly: formData.get("availableOnly") === "on",
  };
}

export type AnnouncementState = {
  error: string | null;
  ok?: boolean;
  recipients?: number;
  /**
   * Id del anuncio recién creado. El formulario lo usa como `key` de React para
   * remontarse y volver a su estado inicial: al ser distinto en cada
   * publicación, dos envíos seguidos también lo limpian (un booleano `ok` no,
   * porque se queda en `true`).
   */
  announcementId?: string;
};

/**
 * Publica un anuncio para los instaladores de la empresa.
 *
 * El reparto a la bandeja (y con ella el Web Push) lo hace la RPC
 * `publish_announcement`, que valida permisos y arma el público. Acá encima se
 * manda el email a esos mismos destinatarios, best effort: si Resend no está
 * configurado o falla, el anuncio ya llegó igual in-app.
 *
 * Los emails salen DESPUÉS de responder (`after`). Antes se esperaban acá
 * adentro y, sin dominio verificado en Resend, cada intento fallaba lento: la
 * acción no volvía nunca y el botón quedaba clavado en "Publicando…".
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
    audience: readAudience(formData),
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
      p_audience: parsed.data.audience,
    });
    if (error) return { error: error.message };

    const result = Array.isArray(data) ? data[0] : null;
    const recipients = result?.recipients ?? 0;

    if (result && recipients > 0) {
      const announcementId = result.announcement_id;
      after(async () => {
        try {
          // Push y email, los dos best-effort y después de responder: el
          // aviso ya está en la bandeja de todos, y que un canal externo
          // falle no puede tumbar la publicación.
          //
          // El push faltaba: la UI ya prometía que el aviso llega "al
          // celular" y no era cierto. Para un corte de calle o una alerta
          // climática, que suene el teléfono es justamente el punto.
          await Promise.allSettled([
            requestPushDelivery(supabase, "announcement", announcementId),
            deliverEmails(supabase, user, announcementId, parsed.data),
          ]);
        } catch {
          // Ídem: la publicación ya ocurrió.
        }
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/home");
    return { error: null, ok: true, recipients, announcementId: result?.announcement_id };
  } catch {
    return { error: t("unexpected") };
  }
}

/**
 * Cuántas personas recibirían el aviso con estos criterios.
 *
 * Sale de la MISMA función SQL que arma el público al publicar
 * (`announcement_audience`), no de una consulta parecida: un preview que se
 * calcula distinto que el envío es una promesa que se rompe sola en cuanto
 * alguien toca uno de los dos lados (REQ-13.4).
 */
export async function previewAnnouncementAudience(
  audience: unknown,
): Promise<{ count: number | null }> {
  const parsed = audienceSchema.safeParse(audience);
  if (!parsed.success) return { count: null };

  const user = await getCurrentUser();
  if (!user || user.role !== "company_manager") return { count: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("announcement_audience_count", {
    p_audience: parsed.data,
  });
  return { count: error ? null : (data ?? 0) };
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
    companyName: company?.name ?? "Se Instala",
    title: input.title,
    body: input.body,
    copy: {
      subject: emailT("subject", { company: company?.name ?? "Se Instala" }),
      intro: emailT("intro"),
      footer: emailT("footer"),
    },
  });
}
