import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requirePlatformAdmin, generateTempPassword } from "../_guard";

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
  const [{ data: projects }, { data: orders }, { data: profiles }] =
    await Promise.all([
      admin.from("projects").select("company_id"),
      admin.from("work_orders").select("company_id"),
      admin.from("profiles").select("company_id"),
    ]);

  const countBy = (rows: { company_id: string | null }[] | null) =>
    (rows ?? []).reduce<Record<string, number>>((acc, r) => {
      if (r.company_id) acc[r.company_id] = (acc[r.company_id] ?? 0) + 1;
      return acc;
    }, {});

  const projectCounts = countBy(projects);
  const orderCounts = countBy(orders);
  const userCounts = countBy(profiles);

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

  const parsed = createCompanySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: t("invalidData") },
      { status: 400 },
    );
  }
  const { name, country, orderPrefix, managerEmail, managerName } = parsed.data;

  const { data: company, error: companyError } = await admin
    .from("companies")
    .insert({ name, country, order_prefix: orderPrefix })
    .select("id, name")
    .single();

  if (companyError || !company) {
    return NextResponse.json(
      { error: t("createCompany") },
      { status: 500 },
    );
  }

  const tempPassword = generateTempPassword();
  const { error: userError } = await admin.auth.admin.createUser({
    email: managerEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      role: "company_manager",
      company_id: company.id,
      full_name: managerName,
      locale: country === "BR" ? "pt" : "es",
    },
  });

  if (userError) {
    // Rollback: sin gerente la empresa queda huérfana.
    await admin.from("companies").delete().eq("id", company.id);
    return NextResponse.json(
      { error: t("createCompany") },
      { status: 500 },
    );
  }

  // La contraseña temporal se devuelve UNA sola vez, para compartirla.
  return NextResponse.json({ company, tempPassword }, { status: 201 });
}
