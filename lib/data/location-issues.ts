import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  compareVariants,
  parseVariants,
  sortIssues,
  type LocationIssueCode,
  type VariantComparison,
} from "@/lib/domain/location-issues";

export type LocationIssue = {
  id: string;
  code: LocationIssueCode;
  status: "pending" | "resolved" | "ignored";
  externalRef: string | null;
  projectId: string | null;
  projectName: string | null;
  clientName: string | null;
  siteCount: number;
  createdAt: string;
  resolutionNote: string;
  resolvedAt: string | null;
  /** Sólo tiene sentido en `conflicting_source_data`. */
  comparison: VariantComparison;
  /** Contexto plano de los otros dos motivos, donde no hay variantes. */
  context: {
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    reason: string | null;
  };
};

function readText(source: unknown, key: string): string | null {
  if (typeof source !== "object" || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Cola de revisión del backfill canónico.
 *
 * RLS ya acota por empresa (`location_backfill_issues_manager_read`), así que
 * acá no se vuelve a filtrar por `company_id`: hacerlo daría una falsa sensación
 * de defensa en un lugar donde la garantía real está en la base.
 */
export async function fetchLocationIssues(
  supabase: SupabaseClient<Database>,
  options: { status?: "pending" | "resolved" | "ignored" } = {},
): Promise<LocationIssue[]> {
  let query = supabase
    .from("location_backfill_issues")
    .select(
      "id, issue_code, status, normalized_external_ref, project_id, client_id, source_site_ids, details, created_at, resolution_note, resolved_at, projects(name), clients(name)",
    );
  if (options.status) query = query.eq("status", options.status);

  const { data, error } = await query;
  if (error || !data) return [];

  const issues = data.map((row) => {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
    return {
      id: row.id,
      code: row.issue_code as LocationIssueCode,
      status: row.status as LocationIssue["status"],
      externalRef: row.normalized_external_ref,
      projectId: row.project_id,
      projectName: project?.name ?? null,
      clientName: client?.name ?? null,
      siteCount: row.source_site_ids?.length ?? 0,
      createdAt: row.created_at,
      resolutionNote: row.resolution_note ?? "",
      resolvedAt: row.resolved_at,
      comparison: compareVariants(parseVariants(row.details)),
      context: {
        name: readText(row.details, "name"),
        address: readText(row.details, "address"),
        city: readText(row.details, "city"),
        state: readText(row.details, "state"),
        reason: readText(row.details, "reason"),
      },
    };
  });

  return sortIssues(issues);
}

export async function countPendingLocationIssues(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { count } = await supabase
    .from("location_backfill_issues")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}
