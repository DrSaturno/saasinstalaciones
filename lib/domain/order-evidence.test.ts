import { describe, expect, it } from "vitest";
import { filterEvidenceByKind, matchesEvidenceKind, type EvidenceItem } from "@/lib/domain/order-evidence";

function item(over: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: "1",
    kind: "message",
    subtype: "message",
    body: "Material recibido",
    photos: [],
    links: [],
    authorId: "a1",
    createdAt: "2026-08-31T12:00:00Z",
    occurredAt: "2026-08-31T12:00:00Z",
    fromStatus: null,
    toStatus: null,
    storagePath: null,
    ...over,
  };
}

describe("matchesEvidenceKind", () => {
  it("un mensaje sin enlaces no cuenta como enlace", () => {
    expect(matchesEvidenceKind(item({ links: [] }), "link")).toBe(false);
  });

  it("un mensaje con enlaces cuenta como mensaje Y como enlace a la vez", () => {
    const withLink = item({ links: ["https://ejemplo.com"] });
    expect(matchesEvidenceKind(withLink, "message")).toBe(true);
    expect(matchesEvidenceKind(withLink, "link")).toBe(true);
  });

  it("un documento no cuenta como imagen", () => {
    expect(matchesEvidenceKind(item({ kind: "document" }), "image")).toBe(false);
  });
});

describe("filterEvidenceByKind", () => {
  it("sin filtro devuelve todo", () => {
    const items = [item({ id: "1" }), item({ id: "2", kind: "document" })];
    expect(filterEvidenceByKind(items, null)).toHaveLength(2);
  });

  it("filtra enlaces entre mensajes con y sin link", () => {
    const items = [
      item({ id: "1", links: ["https://ejemplo.com"] }),
      item({ id: "2", links: [] }),
    ];
    const result = filterEvidenceByKind(items, "link");
    expect(result.map((i) => i.id)).toEqual(["1"]);
  });
});
