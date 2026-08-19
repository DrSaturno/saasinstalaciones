import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requirePlatformAdmin } from "../../_guard";

const patchSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

/**
 * PATCH /api/master/companies/[id] — suspender o reactivar una empresa.
 * En Next 16 los params de rutas dinámicas son async.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("Errors");
  const guard = await requirePlatformAdmin();
  if (guard.error) return guard.error;
  const { admin } = guard;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: t("invalidData") }, { status: 400 });
  }

  const { data, error } = await admin
    .from("companies")
    .update({ status: parsed.data.status })
    .eq("id", id)
    .select("id, name, status")
    .single();

  if (error) {
    return NextResponse.json({ error: t("updateCompany") }, { status: 500 });
  }

  return NextResponse.json({ company: data });
}

/**
 * DELETE /api/master/companies/[id] — elimina una empresa y su gerente.
 *
 * El gerente se borra primero y por su cuenta (`deleteUser`), no dejando que la
 * baja de la empresa lo arrastre: `profiles.company_id` de un gerente no admite
 * null (constraint `manager_has_company`), así que si la FK de `companies`
 * intentara anularlo en cascada, la operación fallaría a mitad de camino.
 * Borrando al gerente primero, su perfil se va entero con él.
 *
 * Coordinadores e instaladores no se tocan: su vínculo con la empresa es una
 * membresía (`company_installers`), no su perfil, así que cae solo con la
 * empresa sin afectar la cuenta de la persona, que puede seguir en otras.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations("Errors");
  const guard = await requirePlatformAdmin();
  if (guard.error) return guard.error;
  const { admin } = guard;

  const { id } = await params;

  const { data: managers, error: managersError } = await admin
    .from("profiles")
    .select("id")
    .eq("company_id", id)
    .eq("role", "company_manager");

  if (managersError) {
    return NextResponse.json({ error: t("deleteCompany") }, { status: 500 });
  }

  for (const manager of managers ?? []) {
    const { error } = await admin.auth.admin.deleteUser(manager.id);
    if (error) {
      return NextResponse.json({ error: t("deleteCompany") }, { status: 500 });
    }
  }

  const { error: companyError } = await admin
    .from("companies")
    .delete()
    .eq("id", id);

  if (companyError) {
    return NextResponse.json({ error: t("deleteCompany") }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
