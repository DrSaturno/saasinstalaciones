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
    scheduledDate: "2026-08-01",
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

describe("regla: no se planifica sin fecha programada", () => {
  it("bloquea planificar sin fecha", () => {
    expect(
      orderTransitionBlock(orden({ scheduledDate: null }), "planificada", GERENTE),
    ).toBe("needsScheduledDate");
  });

  it("deja planificar con fecha", () => {
    expect(orderTransitionBlock(orden(), "planificada", GERENTE)).toBeNull();
  });

  it("sin fecha tampoco se puede iniciar, porque no se pudo planificar", () => {
    // La orden nunca llega a 'planificada', así que 'en_proceso' es inválida.
    expect(
      orderTransitionBlock(orden({ scheduledDate: null }), "en_proceso", INSTALADOR),
    ).toBe("invalidTransition");
  });
});

describe("regla: sólo el instalador asignado inicia el trabajo", () => {
  const lista = orden({
    status: "planificada",
    acceptedAt: "2026-07-28T10:00:00Z",
  });

  it("deja al instalador asignado", () => {
    expect(orderTransitionBlock(lista, "en_proceso", INSTALADOR)).toBeNull();
  });

  it("bloquea al coordinador", () => {
    expect(orderTransitionBlock(lista, "en_proceso", COORDINADOR)).toBe(
      "onlyInstallerStarts",
    );
  });

  it("bloquea a la empresa", () => {
    expect(orderTransitionBlock(lista, "en_proceso", GERENTE)).toBe(
      "onlyInstallerStarts",
    );
  });

  it("la falta de aceptación manda sobre quién es", () => {
    expect(
      orderTransitionBlock(orden({ status: "planificada" }), "en_proceso", INSTALADOR),
    ).toBe("needsAcceptance");
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

describe("regla: nadie aprueba ni reabre su propia entrega (ADR-001)", () => {
  // El mismo id que assignedInstallerId, pero actuando con capacidad de
  // coordinador: es el caso de rol dual que R1 habilita.
  const INSTALADOR_COORDINADOR = { id: "inst-1", role: "coordinator" as const };
  const enRevision = orden({ status: "en_revision" });

  it("bloquea al instalador asignado que también coordina", () => {
    expect(
      orderTransitionBlock(enRevision, "finalizada", INSTALADOR_COORDINADOR),
    ).toBe("noSelfApproval");
  });

  it("también bloquea reabrir su propia entrega", () => {
    expect(
      orderTransitionBlock(enRevision, "en_proceso", INSTALADOR_COORDINADOR),
    ).toBe("noSelfApproval");
  });

  it("un coordinador distinto del instalador asignado sí puede aprobar", () => {
    expect(orderTransitionBlock(enRevision, "finalizada", COORDINADOR)).toBeNull();
  });

  it("la empresa, que nunca es la asignada, también puede aprobar", () => {
    expect(orderTransitionBlock(enRevision, "finalizada", GERENTE)).toBeNull();
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
