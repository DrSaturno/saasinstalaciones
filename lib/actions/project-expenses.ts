"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { createClient } from "@/lib/supabase/server";

/**
 * Otros costos de un proyecto (bloque 6, docs/specs/2026-09-24-resultado-economico).
 *
 * Mismo permiso que ya decide quién ve `/finance` y los importes comerciales
 * (bloques 4 y 8): dueño de la empresa, o una subcuenta con permiso de
 * finanzas. El chequeo de acá es para devolver un error legible; la RLS de
 * `project_expenses` (`auth_can_see_commercials`) es la que de verdad decide.
 */
async function requireFinanceAccess() {
  const user = await getAuthorizedUser();
  if (
    !user ||
    user.role !== "company_manager" ||
    !user.companyId ||
    !(user.isOwner || user.canManageFinance)
  ) {
    throw new Error("Acceso denegado");
  }
  return { user, supabase: await createClient(), companyId: user.companyId };
}

export type ProjectExpenseActionState = { error: string | null; ok?: boolean };

const expenseSchema = z.object({
  projectId: z.string().uuid(),
  concept: z.string().trim().min(2).max(200),
  amount: z.number().positive(),
  expenseDate: z.iso.date(),
});

export async function addProjectExpense(
  input: z.infer<typeof expenseSchema>,
): Promise<ProjectExpenseActionState> {
  const t = await getTranslations("Errors");
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const { user, supabase, companyId } = await requireFinanceAccess();
    const { error } = await supabase.from("project_expenses").insert({
      company_id: companyId,
      project_id: parsed.data.projectId,
      concept: parsed.data.concept,
      amount: parsed.data.amount,
      expense_date: parsed.data.expenseDate,
      created_by: user.id,
    });
    if (error) return { error: t("operation") };

    revalidatePath(`/projects/${parsed.data.projectId}`);
    revalidatePath("/finance");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

export async function deleteProjectExpense(
  expenseId: string,
  projectId: string,
): Promise<ProjectExpenseActionState> {
  const t = await getTranslations("Errors");
  if (!z.string().uuid().safeParse(expenseId).success) {
    return { error: t("invalidData") };
  }

  try {
    const { supabase, companyId } = await requireFinanceAccess();
    const { error } = await supabase
      .from("project_expenses")
      .delete()
      .eq("id", expenseId)
      .eq("company_id", companyId);
    if (error) return { error: t("operation") };

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/finance");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}
