import { describe, expect, it } from "vitest";

import { overallProgress, projectHealth } from "@/lib/domain/project-health";

const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

describe("projectHealth", () => {
  it("el archivado manda sobre cualquier otro estado", () => {
    const archivado = "2026-07-28T10:00:00.000Z";
    expect(
      projectHealth({ status: "active", endsAt: ayer, total: 10, done: 3, archivedAt: archivado }),
    ).toBe("archived");
    expect(
      projectHealth({ status: "done", endsAt: null, total: 5, done: 5, archivedAt: archivado }),
    ).toBe("archived");
  });

  it("respeta los estados guardados en la base", () => {
    expect(projectHealth({ status: "done", endsAt: ayer, total: 5, done: 1 })).toBe("done");
    expect(projectHealth({ status: "paused", endsAt: ayer, total: 5, done: 1 })).toBe("paused");
    expect(projectHealth({ status: "draft", endsAt: ayer, total: 0, done: 0 })).toBe("draft");
  });

  it("marca demorado al proyecto activo cuya fecha de fin ya pasó", () => {
    expect(projectHealth({ status: "active", endsAt: ayer, total: 10, done: 3 })).toBe("delayed");
  });

  it("no marca demorado si la fecha de fin todavía no llegó", () => {
    expect(projectHealth({ status: "active", endsAt: manana, total: 10, done: 3 })).toBe("active");
  });

  it("no marca demorado si ya se terminaron todos los puntos", () => {
    expect(projectHealth({ status: "active", endsAt: ayer, total: 10, done: 10 })).toBe("active");
  });

  it("no marca demorado si el proyecto no tiene fecha de fin", () => {
    expect(projectHealth({ status: "active", endsAt: null, total: 10, done: 3 })).toBe("active");
  });
});

describe("overallProgress", () => {
  it("promedia por puntos y no por proyecto", () => {
    // 1 de 1 en uno y 0 de 99 en el otro: 1 sobre 100, no 50%.
    expect(overallProgress([{ total: 1, done: 1 }, { total: 99, done: 0 }])).toBe(1);
  });

  it("devuelve 0 cuando todavía no hay puntos cargados", () => {
    expect(overallProgress([{ total: 0, done: 0 }])).toBe(0);
    expect(overallProgress([])).toBe(0);
  });
});
