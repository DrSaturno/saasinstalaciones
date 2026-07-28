import { describe, expect, it } from "vitest";

import {
  allowedTransitions,
  orderTransitionBlock,
  type OrderRuleContext,
} from "@/lib/domain/order-rules";
import { ORDER_TRANSITIONS } from "@/lib/domain/transitions";

const INSTALADOR = { id: "inst-1", role: "installer" as const };
const COORDINADOR = { id: "coord-1", role: "coordinator" as const };
const GERENTE = { id: "ger-1", role: "company_manager" as const };

function orden(overrides: Partial<OrderRuleContext> = {}): OrderRuleContext {
  return {
    status: "pendiente",
    assignedInstallerId: "inst-1",
    acceptedAt: null,
    hasSurvey: false,
    ...overrides,
  };
}

describe("regla: no se sale de pendiente sin instalador", () => {
  it("bloquea planificar una orden sin asignar", () => {
    expect(
      orderTransitionBlock(orden({ assignedInstallerId: null }), "planificada", GERENTE),
    ).toBe("needsInstaller");
  });

  it("bloquea también mandarla a relevamiento", () => {
    expect(
      orderTransitionBlock(orden({ assignedInstallerId: null }), "relevamiento", GERENTE),
    ).toBe("needsInstaller");
  });

  it("deja cancelar aunque no haya instalador", () => {
    expect(
      orderTransitionBlock(orden({ assignedInstallerId: null }), "cancelada", GERENTE),
    ).toBeNull();
  });

  it("permite avanzar cuando hay instalador", () => {
    expect(orderTransitionBlock(orden(), "planificada", GERENTE)).toBeNull();
  });
});

describe("regla: el relevamiento tiene que quedar asentado", () => {
  it("bloquea planificar si pasó por relevamiento y no hay acta", () => {
    expect(
      orderTransitionBlock(orden({ status: "relevamiento" }), "planificada", GERENTE),
    ).toBe("needsSurvey");
  });

  it("deja planificar con el acta cargada", () => {
    expect(
      orderTransitionBlock(
        orden({ status: "relevamiento", hasSurvey: true }),
        "planificada",
        GERENTE,
      ),
    ).toBeNull();
  });

  it("no pide acta si va de pendiente derecho a planificada", () => {
    expect(orderTransitionBlock(orden({ status: "pendiente" }), "planificada", GERENTE)).toBeNull();
  });
});

describe("regla: aceptar antes de iniciar", () => {
  it("bloquea iniciar sin aceptación", () => {
    expect(
      orderTransitionBlock(orden({ status: "planificada" }), "en_proceso", INSTALADOR),
    ).toBe("needsAcceptance");
  });

  it("deja iniciar una vez aceptada", () => {
    expect(
      orderTransitionBlock(
        orden({ status: "planificada", acceptedAt: "2026-07-28T10:00:00Z" }),
        "en_proceso",
        INSTALADOR,
      ),
    ).toBeNull();
  });
});

describe("regla: a revisión sólo la manda el instalador asignado", () => {
  const enProceso = orden({ status: "en_proceso" });

  it("deja al instalador asignado", () => {
    expect(orderTransitionBlock(enProceso, "en_revision", INSTALADOR)).toBeNull();
  });

  it("bloquea al coordinador", () => {
    expect(orderTransitionBlock(enProceso, "en_revision", COORDINADOR)).toBe(
      "onlyInstallerReviews",
    );
  });

  it("bloquea a la empresa", () => {
    expect(orderTransitionBlock(enProceso, "en_revision", GERENTE)).toBe(
      "onlyInstallerReviews",
    );
  });

  it("el coordinador sí puede aprobar desde revisión", () => {
    expect(
      orderTransitionBlock(orden({ status: "en_revision" }), "finalizada", COORDINADOR),
    ).toBeNull();
  });
});

describe("allowedTransitions", () => {
  it("al coordinador no le ofrece 'en revisión' sobre una orden en proceso", () => {
    const enProceso = orden({ status: "en_proceso" });
    expect(
      allowedTransitions(enProceso, COORDINADOR, ORDER_TRANSITIONS.en_proceso),
    ).toEqual([]);
  });

  it("sobre una orden en revisión le ofrece aprobar y reabrir", () => {
    const enRevision = orden({ status: "en_revision" });
    expect(
      allowedTransitions(enRevision, COORDINADOR, ORDER_TRANSITIONS.en_revision),
    ).toEqual(["finalizada", "en_proceso"]);
  });

  it("rechaza transiciones que la máquina de estados no contempla", () => {
    expect(orderTransitionBlock(orden(), "finalizada", GERENTE)).toBe("invalidTransition");
  });
});
