import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { BusinessCalendar } from "@/lib/domain/business-days";
import { throwIfDataError } from "@/lib/data/errors";

/**
 * Días no laborables aplicables a una empresa: los feriados nacionales de su
 * país más los que ella misma haya cargado (puentes por decreto, feriados
 * provinciales, cierres propios).
 *
 * El filtro por empresa se hace acá y no con un `.or()` armado por
 * concatenación: quien pertenece a dos empresas no debe arrastrar los días no
 * laborables de una al calendario de la otra, y la tabla es lo bastante chica
 * como para que no valga la pena construir SQL a mano para eso.
 */
export async function fetchBusinessCalendar(
  supabase: SupabaseClient<Database>,
  country: string,
  companyId: string | null = null,
): Promise<BusinessCalendar> {
  const { data, error } = await supabase
    .from("non_working_days")
    .select("day, company_id")
    .eq("country", country);
  throwIfDataError("business_calendar.days", error);

  const holidays = new Set<string>();
  for (const row of data ?? []) {
    if (row.company_id === null || row.company_id === companyId) {
      holidays.add(row.day);
    }
  }
  return { holidays };
}
