import { z } from "zod";
import type { OrderUpdateType } from "@/types/database";

export const ORDER_EVIDENCE_KINDS = ["message", "image", "document", "link"] as const;
export type EvidenceKind = (typeof ORDER_EVIDENCE_KINDS)[number];

export type EvidenceItem = {
  id: string;
  /** El que devuelve la búsqueda SQL — "link" no es uno de estos, ver `matchesEvidenceKind`. */
  kind: "message" | "image" | "document";
  /**
   * Para los mensajes, el `type` original del update. Los hitos operativos
   * (checkin/progress/blocker/done/survey/system) se muestran etiquetados;
   * "message" es un mensaje libre y no lleva etiqueta. Null en los adjuntos.
   */
  subtype: OrderUpdateType | null;
  body: string;
  photos: string[];
  links: string[];
  authorId: string | null;
  createdAt: string;
  storagePath: string | null;
};

/**
 * "Enlaces" no es un tipo que devuelva la búsqueda SQL: es cualquier mensaje
 * cuyo `links` no esté vacío. Un mensaje puede aparecer bajo dos filtros a la
 * vez (Mensajes y Enlaces) — es lo mismo que pasa en cualquier chat.
 */
export function matchesEvidenceKind(item: EvidenceItem, kind: EvidenceKind): boolean {
  if (kind === "link") return item.links.length > 0;
  return item.kind === kind;
}

export function filterEvidenceByKind(
  items: EvidenceItem[],
  kind: EvidenceKind | null,
): EvidenceItem[] {
  if (!kind) return items;
  return items.filter((item) => matchesEvidenceKind(item, kind));
}

export const postOrderMessageSchema = z.object({
  body: z.string().trim().min(1).max(4_000),
});
