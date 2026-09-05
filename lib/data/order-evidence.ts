import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvidenceItem, EvidenceKind } from "@/lib/domain/order-evidence";
import type { Database } from "@/types/database";
import { throwIfDataError } from "@/lib/data/errors";

export type EvidenceFilters = {
  query?: string;
  /** "link" no existe del lado de la búsqueda SQL: se pide "message" y se filtra acá. */
  kind?: EvidenceKind | null;
};

export type OrderEvidenceResult = {
  items: EvidenceItem[];
  /** ruta de storage (adjunto o foto de mensaje) → URL firmada, 30 min. */
  photoUrlByPath: Map<string, string>;
  authorNameById: Map<string, string>;
};

/**
 * Busca y filtra la evidencia de una orden — mensajes, imágenes, documentos
 * y enlaces en un solo resultado, vía `search_order_evidence`. La RLS de
 * `order_updates`/`order_attachments` sigue decidiendo qué fila puede leer
 * cada quien: esta función no amplía ningún acceso, sólo lo une y lo firma.
 */
export async function fetchOrderEvidence(
  supabase: SupabaseClient<Database>,
  orderId: string,
  filters: EvidenceFilters = {},
): Promise<OrderEvidenceResult> {
  const sqlKinds =
    filters.kind === "link" ? ["message"] : filters.kind ? [filters.kind] : undefined;

  const { data, error } = await supabase.rpc("search_order_evidence", {
    p_order_id: orderId,
    p_query: filters.query?.trim() || undefined,
    p_kinds: sqlKinds,
  });

  throwIfDataError("order.evidence", error);

  let items: EvidenceItem[] = (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind as EvidenceItem["kind"],
    subtype: (row.subtype as EvidenceItem["subtype"]) ?? null,
    body: row.body,
    photos: Array.isArray(row.photos)
      ? row.photos.filter((photo): photo is string => typeof photo === "string")
      : [],
    links: row.links ?? [],
    authorId: row.author_id,
    createdAt: row.created_at,
    storagePath: row.storage_path,
    fromStatus: (row.from_status as EvidenceItem["fromStatus"]) ?? null,
    toStatus: (row.to_status as EvidenceItem["toStatus"]) ?? null,
    // Cuándo pasó, no cuándo llegó. Para lo escrito desde el escritorio son
    // el mismo instante; para lo que viene del campo pueden diferir en horas.
    occurredAt: row.occurred_at ?? row.created_at,
  }));

  // "Enlaces" no lo sabe la búsqueda SQL: se pidió "message" arriba y se
  // recorta acá a los que efectivamente traen un link.
  if (filters.kind === "link") items = items.filter((item) => item.links.length > 0);

  const [photoUrlByPath, authorNameById] = await Promise.all([
    signEvidencePaths(supabase, items),
    fetchAuthorNames(supabase, items),
  ]);

  return { items, photoUrlByPath, authorNameById };
}

async function signEvidencePaths(
  supabase: SupabaseClient<Database>,
  items: EvidenceItem[],
): Promise<Map<string, string>> {
  const paths = [
    ...new Set(
      items.flatMap((item) => (item.storagePath ? [item.storagePath] : item.photos)),
    ),
  ];
  if (paths.length === 0) return new Map();

  const { data: signed, error } = await supabase.storage
    .from("evidence")
    .createSignedUrls(paths, 60 * 30);
  throwIfDataError("order.evidence_signed_urls", error);

  return new Map(
    (signed ?? []).flatMap((entry) =>
      entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl] as const] : [],
    ),
  );
}

async function fetchAuthorNames(
  supabase: SupabaseClient<Database>,
  items: EvidenceItem[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(items.map((item) => item.authorId).filter((id): id is string => Boolean(id))),
  ];
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  throwIfDataError("order.evidence_authors", error);
  return new Map((data ?? []).map((profile) => [profile.id, profile.full_name]));
}
