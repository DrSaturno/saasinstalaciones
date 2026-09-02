import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ExplicitWorkCondition } from "@/types/database";

/**
 * Deja las condiciones de una orden exactamente como las mandó el formulario.
 *
 * **Diferencia, no borrar y reescribir.** Vaciar la tabla e insertar todo de
 * nuevo sería más corto, pero le pondría `created_at` de hoy a una condición
 * declarada hace un mes. Y esa fecha importa: el reconocimiento del instalador
 * es por haber aceptado un trabajo *sabiendo* que era complejo, así que la
 * Fase 1 necesita poder comparar cuándo se declaró la condición contra cuándo
 * se aceptó la orden. Una reescritura ciega borraría justamente esa prueba.
 *
 * No corta el alta si falla: una orden creada sin condiciones se corrige
 * editándola, mientras que un error después de haberla escrito deja al usuario
 * sin saber si la orden existe. Mismo criterio que `create_order_activities`.
 */
export async function syncOrderConditions(
  supabase: SupabaseClient<Database>,
  orderId: string,
  companyId: string,
  userId: string,
  wanted: readonly ExplicitWorkCondition[],
): Promise<void> {
  const { data: current } = await supabase
    .from("work_order_conditions")
    .select("condition")
    .eq("order_id", orderId);

  const existing = new Set((current ?? []).map((row) => row.condition));
  const target = new Set(wanted);

  const toRemove = [...existing].filter((condition) => !target.has(condition));
  const toAdd = wanted.filter((condition) => !existing.has(condition));

  if (toRemove.length > 0) {
    await supabase
      .from("work_order_conditions")
      .delete()
      .eq("order_id", orderId)
      .in("condition", toRemove);
  }

  if (toAdd.length > 0) {
    await supabase.from("work_order_conditions").insert(
      toAdd.map((condition) => ({
        order_id: orderId,
        company_id: companyId,
        condition,
        created_by: userId,
      })),
    );
  }
}
