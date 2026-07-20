import { NextResponse, type NextRequest } from "next/server";
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
  const guard = await requirePlatformAdmin();
  if (guard.error) return guard.error;
  const { admin } = guard;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("companies")
    .update({ status: parsed.data.status })
    .eq("id", id)
    .select("id, name, status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ company: data });
}
