import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { INTL_LOCALE } from "@/i18n/config";
import { applicationOrigin } from "@/lib/app-origin";
import { countCompanyUsers } from "@/lib/domain/company-user-counts";
import { createCorrelationId, logEvent } from "@/lib/observability";
import {
  managerActivationUrl,
  sendManagerActivationEmail,
} from "@/lib/email/invitations";
import { requirePlatformAdmin } from "../_guard";

const createCompanySchema = z.object({
  name: z.string().min(2, "Nombre muy corto").max(150),
  country: z.enum(["AR", "BR"]),
  orderPrefix: z
    .string()
    .min(2)
    .max(5)
    .regex(/^[A-Z]+$/, "Solo letras mayúsculas")
    .default("ORD"),
  managerEmail: z.string().email("Email inválido"),
  managerName: z.string().min(2, "Nombre muy corto").max(150),
});

/** GET /api/master/companies — lista de empresas con conteos. */
export async function GET() {
  const guard = await requirePlatformAdmin();
  if (guard.error) return guard.error;
  const { admin } = guard;

  const { data: companies, error } = await admin
    .from("companies")
    .select("id, name, country, status, order_prefix, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Conteos por empresa (proyectos, órdenes, usuarios).
  const [
    { data: projects },
    { data: orders },
    { data: memberships },
    { data: managers },
  ] =
    await Promise.all([
      admin.from("projects").select("company_id"),
      admin.from("work_orders").select("company_id"),
      admin
        .from("company_installers")
        .select("company_id, installer_id")
        .eq("status", "active"),
      admin
        .from("profiles")
        .select("id, company_id")
        .eq("role", "company_manager"),
    ]);

  const countBy = (rows: { company_id: string | null }[] | null) =>
    (rows ?? []).reduce<Record<string, number>>((acc, r) => {
      if (r.company_id) acc[r.company_id] = (acc[r.company_id] ?? 0) + 1;
      return acc;
    }, {});

  const projectCounts = countBy(projects);
  const orderCounts = countBy(orders);
  const userCounts = countCompanyUsers(memberships, managers);

  return NextResponse.json({
    companies: (companies ?? []).map((c) => ({
      ...c,
      projects: projectCounts[c.id] ?? 0,
      orders: orderCounts[c.id] ?? 0,
      users: userCounts[c.id] ?? 0,
    })),
  });
}

/** POST /api/master/companies — alta de empresa + su primer gerente. */
export async function POST(request: NextRequest) {
  const t = await getTranslations("Errors");
  const guard = await requirePlatformAdmin();
  if (guard.error) return guard.error;
  const { admin } = guard;

  // El alta encadena empresa + cuenta + email con compensación: sin un hilo
  // común no se puede reconstruir qué pasó cuando falla el paso del medio.
  const correlationId = createCorrelationId(
    request.headers.get("x-correlation-id"),
  );

  const parsed = createCompanySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: t("invalidData") },
      { status: 400 },
    );
  }
  const { name, country, orderPrefix, managerEmail, managerName } = parsed.data;
  const locale = country === "BR" ? "pt" : "es";

  let origin: string;
  try {
    origin = applicationOrigin();
  } catch {
    return NextResponse.json({ error: t("createCompany") }, { status: 500 });
  }

  const emailT = await getTranslations({
    locale: INTL_LOCALE[locale],
    namespace: "ManagerActivationEmail",
  });

  const { data: company, error: companyError } = await admin
    .from("companies")
    .insert({ name, country, order_prefix: orderPrefix })
    .select("id, name")
    .single();

  if (companyError || !company) {
    logEvent("error", "master.company_onboarding.failed", {
      correlation_id: correlationId,
      step: "company_insert",
      database_code: companyError?.code ?? null,
    });
    return NextResponse.json(
      { error: t("createCompany") },
      { status: 500 },
    );
  }

  const rollbackOnboarding = async (userId?: string) => {
    const { error: authRollbackError } = userId
      ? await admin.auth.admin.deleteUser(userId)
      : { error: null };
    const { error: companyRollbackError } = await admin
      .from("companies")
      .delete()
      .eq("id", company.id);

    if (authRollbackError || companyRollbackError) {
      // Una compensación fallida deja datos huérfanos: es lo que hay que poder
      // encontrar después, no el error original.
      logEvent("error", "master.company_onboarding.rollback_failed", {
        correlation_id: correlationId,
        company_id: company.id,
        auth_code: authRollbackError?.code ?? null,
        database_code: companyRollbackError?.code ?? null,
      });
      return;
    }

    logEvent("warn", "master.company_onboarding.rolled_back", {
      correlation_id: correlationId,
      company_id: company.id,
    });
  };

  const { data: invitation, error: userError } =
    await admin.auth.admin.generateLink({
      type: "invite",
      email: managerEmail,
      options: {
        data: {
          role: "company_manager",
          company_id: company.id,
          full_name: managerName,
          locale,
        },
        redirectTo: new URL("/api/auth/callback", origin).toString(),
      },
    });

  if (userError || !invitation?.user || !invitation.properties.hashed_token) {
    logEvent("error", "master.company_onboarding.failed", {
      correlation_id: correlationId,
      company_id: company.id,
      step: "generate_invitation",
      auth_code: userError?.code ?? null,
    });
    // Rollback: sin gerente la empresa queda huérfana.
    await rollbackOnboarding(invitation?.user?.id);
    return NextResponse.json(
      { error: t("createCompany") },
      { status: 500 },
    );
  }

  const activationUrl = managerActivationUrl(
    invitation.properties.hashed_token,
    origin,
  );
  const emailStatus = await sendManagerActivationEmail({
    to: managerEmail,
    userId: invitation.user.id,
    activationUrl,
    copy: {
      subject: emailT("subject", { company: name }),
      heading: emailT("heading"),
      body: emailT("body", { company: name }),
      cta: emailT("cta"),
      expires: emailT("expires"),
      fallback: emailT("fallback"),
    },
  });

  if (emailStatus === "failed") {
    logEvent("error", "master.company_onboarding.failed", {
      correlation_id: correlationId,
      company_id: company.id,
      step: "send_activation_email",
    });
    // Si había proveedor configurado pero no entregó, no dejamos una empresa
    // ni una cuenta huérfanas. El orden importa: borrar auth elimina el perfil
    // que referencia a la empresa; recién entonces se elimina la empresa.
    await rollbackOnboarding(invitation.user.id);
    return NextResponse.json(
      { error: t("createCompanyInvitation") },
      { status: 502 },
    );
  }

  logEvent("info", "master.company_onboarding.completed", {
    correlation_id: correlationId,
    company_id: company.id,
    country,
    // `manual` significa que el operador todavía tiene que pasar el link a mano:
    // es un alta a medio terminar, no un éxito silencioso.
    email_status: emailStatus,
  });

  return NextResponse.json(
    {
      company,
      managerEmail,
      invitation:
        emailStatus === "sent"
          ? { status: "sent" as const }
          : { status: "manual" as const, activationUrl },
    },
    { status: 201 },
  );
}
