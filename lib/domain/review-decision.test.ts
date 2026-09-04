import { describe, expect, it } from "vitest";
import {
  availableDecisions,
  reviewDecisionBlock,
  reviewNeedsReason,
  reviewTargetStatus,
} from "@/lib/domain/review-decision";

describe("reviewNeedsReason", () => {
  it("aprobar es lo único que no pide explicación", () => {
    expect(reviewNeedsReason("approve")).toBe(false);
    expect(reviewNeedsReason("request_evidence")).toBe(true);
    expect(reviewNeedsReason("request_changes")).toBe(true);
    expect(reviewNeedsReason("reopen")).toBe(true);
  });
});

describe("reviewDecisionBlock", () => {
  it("acepta aprobar una entrega en revisión, sin motivo", () => {
    expect(reviewDecisionBlock("approve", "en_revision", null)).toBeNull();
  });

  it("exige motivo en las tres que devuelven trabajo", () => {
    expect(reviewDecisionBlock("request_changes", "en_revision", "")).toBe(
      "reasonRequired",
    );
    expect(reviewDecisionBlock("request_evidence", "en_revision", "   ")).toBe(
      "reasonRequired",
    );
    expect(reviewDecisionBlock("reopen", "finalizada", null)).toBe(
      "reasonRequired",
    );
  });

  // Un "mal" o un "no" no le dicen al instalador qué corregir, y es lo que
  // sale cuando el campo es obligatorio pero acepta cualquier cosa.
  it("rechaza un motivo demasiado corto para ser útil", () => {
    expect(reviewDecisionBlock("request_changes", "en_revision", "mal")).toBe(
      "reasonTooShort",
    );
    expect(
      reviewDecisionBlock("request_changes", "en_revision", "Falta la foto del frente"),
    ).toBeNull();
  });

  it("no deja aprobar algo que no está en revisión", () => {
    expect(reviewDecisionBlock("approve", "en_proceso", null)).toBe(
      "invalidDecisionForStatus",
    );
    expect(reviewDecisionBlock("approve", "finalizada", null)).toBe(
      "invalidDecisionForStatus",
    );
  });

  it("reabrir parte de finalizada y sólo de ahí", () => {
    expect(
      reviewDecisionBlock("reopen", "finalizada", "El cliente reportó una falla"),
    ).toBeNull();
    expect(
      reviewDecisionBlock("reopen", "en_revision", "El cliente reportó una falla"),
    ).toBe("invalidDecisionForStatus");
  });
});

describe("reviewTargetStatus", () => {
  it("sólo aprobar cierra el trabajo", () => {
    expect(reviewTargetStatus("approve")).toBe("finalizada");
    expect(reviewTargetStatus("request_evidence")).toBe("en_proceso");
    expect(reviewTargetStatus("request_changes")).toBe("en_proceso");
    expect(reviewTargetStatus("reopen")).toBe("en_proceso");
  });
});

describe("availableDecisions", () => {
  it("en revisión se ofrecen las tres de la entrega, no reabrir", () => {
    expect(availableDecisions("en_revision")).toEqual([
      "approve",
      "request_evidence",
      "request_changes",
    ]);
  });

  it("sobre un trabajo aprobado, sólo reabrir", () => {
    expect(availableDecisions("finalizada")).toEqual(["reopen"]);
  });

  it("no ofrece nada mientras el trabajo está en curso", () => {
    expect(availableDecisions("en_proceso")).toEqual([]);
    expect(availableDecisions("en_camino")).toEqual([]);
  });
});
