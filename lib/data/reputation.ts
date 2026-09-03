import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

/**
 * Lectura de la reputación, que vive en SQL.
 *
 * A diferencia de confiabilidad —que se calcula acá, en una función pura— la
 * reputación se computa en la base. El motivo está en la migración: su valor
 * viene de cruzar empresas, y ningún usuario puede leer ese conjunto completo,
 * así que el cálculo tiene que ocurrir donde está el privilegio. Del lado de
 * TypeScript esto es sólo lectura y presentación.
 *
 * Todo lo que llega es `jsonb`, o sea `Json` sin forma conocida. Se parsea
 * defensivamente y campo por campo: dar por sentada la forma haría que un
 * cambio en la función SQL rompiera la pantalla del perfil en producción, en
 * vez de mostrar el número que sí se pudo leer.
 */

export const REPUTATION_BADGES = [
  "disponibilidad_inmediata",
  "alta_dificultad",
  "racha",
  "compromiso_sostenido",
] as const;
export type ReputationBadge = (typeof REPUTATION_BADGES)[number];

export const REPUTATION_CONTRIBUTION_KINDS = [
  "job_completed",
  "job_accepted",
  "incident_resolved",
  "fault",
] as const;
export type ReputationContributionKind =
  (typeof REPUTATION_CONTRIBUTION_KINDS)[number];

export type ReputationSummary = {
  ruleVersion: string;
  /** `null` cuando todavía no hay historia suficiente para afirmar un número. */
  score: number | null;
  hasEnoughHistory: boolean;
  sampleSize: number;
  streak: number;
  completed: number;
  complexCompleted: number;
  shortNoticeAccepted: number;
  incidentsResolved: number;
  faults: number;
  badges: ReputationBadge[];
};

export type ReputationContribution = {
  kind: ReputationContributionKind;
  occurredAt: string;
  /** Lo que este hecho aportó al total. Negativo en las faltas. */
  effect: number;
  complex: boolean;
  shortNotice: boolean;
  conditions: string[];
  leadTimeBusinessDays: number | null;
};

function asRecord(value: Json | undefined): Record<string, Json | undefined> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function asNumber(value: Json | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function asCount(value: Json | undefined): number {
  return typeof value === "number" ? value : 0;
}

function asText(value: Json | undefined): string {
  return typeof value === "string" ? value : "";
}

function asBadges(value: Json | undefined): ReputationBadge[] {
  if (!Array.isArray(value)) return [];
  return REPUTATION_BADGES.filter((badge) => value.includes(badge));
}

function asConditions(value: Json | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asKind(value: Json | undefined): ReputationContributionKind | null {
  return REPUTATION_CONTRIBUTION_KINDS.find((kind) => kind === value) ?? null;
}

/**
 * Totales y reconocimientos. Cruza empresas a propósito: es lo que hace que la
 * reputación sirva para conseguir trabajo nuevo. Nunca trae de quién ni dónde
 * fue cada trabajo — eso no está en lo que la función devuelve.
 */
export async function fetchReputationSummary(
  supabase: SupabaseClient<Database>,
  installerId: string,
  asOf: string,
): Promise<ReputationSummary | null> {
  const { data, error } = await supabase.rpc("reputation_summary", {
    p_installer_id: installerId,
    p_as_of: asOf,
  });
  if (error) return null;

  const row = asRecord(data);
  if (!row) return null;

  return {
    ruleVersion: asText(row.rule_version),
    score: asNumber(row.score),
    hasEnoughHistory: row.has_enough_history === true,
    sampleSize: asCount(row.sample_size),
    streak: asCount(row.streak),
    completed: asCount(row.completed),
    complexCompleted: asCount(row.complex_completed),
    shortNoticeAccepted: asCount(row.short_notice_accepted),
    incidentsResolved: asCount(row.incidents_resolved),
    faults: asCount(row.faults),
    badges: asBadges(row.badges),
  };
}

/**
 * El aporte de cada hecho. La persona ve todo lo suyo; una empresa, sólo lo
 * ocurrido en su propia operación (REQ-10.5). Ese filtro lo aplica la función
 * SQL, no esta lectura.
 */
export async function fetchReputationDetail(
  supabase: SupabaseClient<Database>,
  installerId: string,
  asOf: string,
): Promise<ReputationContribution[]> {
  const { data, error } = await supabase.rpc("reputation_detail", {
    p_installer_id: installerId,
    p_as_of: asOf,
  });
  if (error || !Array.isArray(data)) return [];

  const items: ReputationContribution[] = [];
  for (const entry of data) {
    const row = asRecord(entry);
    if (!row) continue;
    const kind = asKind(row.kind);
    if (!kind) continue;

    const detail = asRecord(row.detail) ?? {};
    items.push({
      kind,
      occurredAt: asText(row.occurred_at),
      effect: asNumber(row.effect) ?? 0,
      complex: detail.complex === true,
      shortNotice: detail.short_notice === true,
      conditions: asConditions(detail.conditions),
      leadTimeBusinessDays: asNumber(detail.lead_time_business_days),
    });
  }
  return items;
}
