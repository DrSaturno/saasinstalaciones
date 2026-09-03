import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * La disponibilidad personal del instalador: cuándo trabaja y cuándo no, valga
 * para la empresa que valga.
 *
 * **Nadie más que su dueño la ve.** Las políticas de estas dos tablas exigen
 * `installer_id = auth.uid()` y no tienen ninguna excepción para gerentes ni
 * coordinadores. Es lo que permite que la plataforma use esta información para
 * decidir si alguien está disponible sin que una empresa se entere de que la
 * otra le ocupó el martes (REQ-11.4).
 *
 * El `company_id` que llevan las filas es procedencia, no alcance: la tabla lo
 * pide por la convención de inquilino, pero el intervalo vale para la persona
 * en todas partes.
 */

export type GlobalWeeklyWindow = {
  id: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  timezone: string;
};

export type GlobalAbsence = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string;
};

export type GlobalAvailability = {
  weekly: GlobalWeeklyWindow[];
  absences: GlobalAbsence[];
};

export async function fetchGlobalAvailability(
  supabase: SupabaseClient<Database>,
  installerId: string,
): Promise<GlobalAvailability> {
  const [{ data: weekly }, { data: absences }] = await Promise.all([
    supabase
      .from("installer_global_weekly_availability")
      .select("id, weekday, starts_at, ends_at, timezone")
      .eq("installer_id", installerId)
      .order("weekday"),
    supabase
      .from("installer_global_unavailability")
      .select("id, starts_at, ends_at, reason")
      .eq("installer_id", installerId)
      .eq("status", "active")
      // Las que ya pasaron no se muestran: la pantalla sirve para decidir de
      // acá en adelante, y el historial completo es otra cosa.
      .gte("ends_at", new Date().toISOString())
      .order("starts_at"),
  ]);

  return {
    weekly: (weekly ?? []).map((item) => ({
      id: item.id,
      weekday: item.weekday,
      startsAt: item.starts_at.slice(0, 5),
      endsAt: item.ends_at.slice(0, 5),
      timezone: item.timezone,
    })),
    absences: (absences ?? []).map((item) => ({
      id: item.id,
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      reason: item.reason,
    })),
  };
}
