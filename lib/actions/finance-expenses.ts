"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { countryTimezone } from "@/lib/domain/availability";
import { financeBusinessDate } from "@/lib/domain/finance-business-date";
import { createClient } from "@/lib/supabase/server";

type Result = { error: string | null };

const amount = z.coerce.number().positive().max(999999999999.99);
const base = {
  concept: z.string().trim().min(2).max(200),
  amount,
  currency: z.enum(["ARS", "BRL"]),
  payee: z.string().trim().max(160).optional(),
};
/**
 * Un solo formulario, tres tipos de gasto (FLX-40). Cada tipo pide sólo lo suyo:
 * el gasto fijo y el sueldo se repiten todos los meses; el puntual es de una vez.
 */
const expenseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fixed"), ...base, dueDay: z.coerce.number().int().min(1).max(31), startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
  z.object({ type: z.literal("payroll"), ...base, payee: z.string().trim().min(2).max(160), dueDay: z.coerce.number().int().min(1).max(31), startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
  z.object({
    type: z.literal("oneoff"), ...base, payee: z.string().trim().min(2).max(160),
    category: z.enum(["variable", "service", "logistics", "motorcycle", "travel", "daily", "other"]),
    dueOn: z.iso.date(),
  }),
]);

/**
 * Carga un gasto sin pedir «proveedor» donde no corresponde (FLX-41).
 * La base exige un beneficiario en toda obligación: si la persona no lo indica
 * (un alquiler, un abono), se usa el propio concepto como nombre. Si el nombre
 * ya existe, se reutiliza; si no, se crea en el momento.
 */
export async function createFinanceExpense(formData: FormData): Promise<Result> {
  const t = await getTranslations("FinanceExpense.errors");
  const user = await getAuthorizedUser();
  if (user?.role !== "company_manager" || !user.companyId || !user.canManageFinance) return { error: t("denied") };
  const optional = (name: string) => String(formData.get(name) ?? "").trim() || undefined;
  const parsed = expenseSchema.safeParse({
    type: formData.get("type"), concept: formData.get("concept"), amount: formData.get("amount"),
    currency: formData.get("currency"), payee: optional("payee"), dueDay: formData.get("dueDay"),
    startMonth: formData.get("startMonth"), category: formData.get("category"), dueOn: formData.get("dueOn"),
  });
  if (!parsed.success) return { error: t("data") };
  const data = parsed.data;
  const supabase = await createClient();
  const companyId = user.companyId;

  // Beneficiario: el indicado o, en un gasto fijo, el propio concepto.
  const payeeName = data.payee ?? data.concept;
  const kind = data.type === "payroll" ? "employee" : data.type === "oneoff" && data.category === "service" ? "service"
    : data.type === "oneoff" && data.category === "logistics" ? "logistics" : "other";
  const { data: existing, error: lookupError } = await supabase.from("finance_suppliers").select("id,name")
    .eq("company_id", companyId).ilike("name", payeeName.replace(/[%_\\]/g, "\\$&")).limit(1);
  if (lookupError) return { error: t("save") };
  let supplierId = existing?.[0]?.id ?? null;
  if (!supplierId) {
    const { data: created, error: createError } = await supabase.from("finance_suppliers")
      .insert({ company_id: companyId, name: payeeName, kind }).select("id").single();
    if (createError || !created) return { error: t("save") };
    supplierId = created.id;
  }

  const value = Math.round(data.amount * 100) / 100;
  if (data.type === "oneoff") {
    const { error } = await supabase.from("finance_entries").insert({
      company_id: companyId, direction: "payable", supplier_id: supplierId, category: data.category,
      installment: "total", zone: null, description: data.concept, amount: value, currency: data.currency,
      due_on: data.dueOn, created_by: user.id,
    });
    if (error) return { error: t("save") };
  } else {
    const { error } = await supabase.from("finance_expense_templates").insert({
      company_id: companyId, supplier_id: supplierId, category: data.type === "payroll" ? "payroll" : "fixed",
      description: data.concept, amount: value, currency: data.currency, due_day: data.dueDay,
      starts_on: `${data.startMonth}-01`, created_by: user.id,
    });
    if (error) return { error: t("save") };
    // Si ya rige este mes, la obligación del mes aparece enseguida, sin un
    // segundo paso de «generar el mes» que nadie recuerda hacer.
    const { data: company } = await supabase.from("companies").select("country").eq("id", companyId).maybeSingle();
    const month = financeBusinessDate(new Date(), countryTimezone(company?.country ?? "AR")).slice(0, 7);
    if (data.startMonth <= month) {
      await supabase.rpc("finance_generate_expense_month", { p_month: `${month}-01` });
    }
  }
  revalidatePath("/finance", "layout");
  return { error: null };
}
