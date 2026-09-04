import { describe, expect, it } from "vitest";
import {
  completionReadiness,
  minCompletionPhotos,
  nextFieldAction,
  DEFAULT_MIN_COMPLETION_PHOTOS,
} from "@/lib/domain/field-flow";

describe("minCompletionPhotos", () => {
  it("usa el de la empresa cuando el proyecto no fijó ninguno", () => {
    expect(minCompletionPhotos(5, null)).toBe(5);
    expect(minCompletionPhotos(5, undefined)).toBe(5);
  });

  it("el proyecto manda sobre la empresa", () => {
    expect(minCompletionPhotos(3, 6)).toBe(6);
    expect(minCompletionPhotos(3, 1)).toBe(1);
  });

  // El bug que este test existe para prevenir: con `projectMinimum || company`
  // un proyecto que fijó CERO —fotos deshabilitadas a propósito, por ejemplo
  // un trabajo administrativo— heredaría el mínimo de la empresa y volvería
  // obligatorias las fotos justo donde alguien las apagó.
  it("distingue un cero explícito de la ausencia de valor", () => {
    expect(minCompletionPhotos(3, 0)).toBe(0);
    expect(minCompletionPhotos(0, null)).toBe(0);
  });

  it("cae en el baseline del pedido cuando no hay nada configurado", () => {
    expect(minCompletionPhotos(null, null)).toBe(DEFAULT_MIN_COMPLETION_PHOTOS);
    expect(DEFAULT_MIN_COMPLETION_PHOTOS).toBe(3);
  });
});

describe("completionReadiness", () => {
  it("dice cuántas faltan, no sólo que no se puede", () => {
    expect(completionReadiness(2, 3)).toEqual({
      photos: 2,
      required: 3,
      missing: 1,
      ready: false,
    });
  });

  it("cuenta las fotos que están por subirse en este mismo cierre", () => {
    // El instalador ya sacó dos durante la ejecución y adjunta una tercera al
    // cerrar: alcanza, y el botón tiene que habilitarse antes de apretar.
    expect(completionReadiness(2, 3, 1).ready).toBe(true);
  });

  it("no reporta faltantes negativos cuando sobran fotos", () => {
    expect(completionReadiness(9, 3)).toMatchObject({ missing: 0, ready: true });
  });

  it("con mínimo cero está lista sin ninguna foto", () => {
    expect(completionReadiness(0, 0).ready).toBe(true);
  });
});

describe("nextFieldAction", () => {
  it("guía una sola acción por etapa", () => {
    expect(nextFieldAction("planificada")).toBe("depart");
    expect(nextFieldAction("en_camino")).toBe("arrive");
    expect(nextFieldAction("en_sitio")).toBe("start");
    expect(nextFieldAction("en_proceso")).toBe("finish");
  });

  it("no ofrece nada donde el instalador no tiene que actuar", () => {
    expect(nextFieldAction("en_revision")).toBeNull();
    expect(nextFieldAction("finalizada")).toBeNull();
    expect(nextFieldAction("cancelada")).toBeNull();
    expect(nextFieldAction("pendiente")).toBeNull();
  });
});
