import { describe, expect, it } from "vitest";
import {
  firstResolutionSummary,
  plannedProjectProgress,
  projectHealth,
  weeklyRequirement,
  workload,
} from "@/lib/domain/manager-dashboard";

describe("manager dashboard", () => {
  it("marca como atrasado un proyecto vencido e incompleto", () => {
    expect(projectHealth({ status: "active", endDate: "2026-07-20", today: "2026-07-24", progress: 80, plannedProgress: 100 })).toBe("delayed");
  });

  it("calcula avance planificado y ritmo semanal requerido", () => {
    expect(plannedProjectProgress("2026-07-01", "2026-07-31", "2026-07-16")).toBe(50);
    expect(weeklyRequirement(20, "2026-08-07", "2026-07-24")).toBe(10);
  });

  it("detecta sobrecarga sin dividir por cero", () => {
    expect(workload(6, 4)).toBe(150);
    expect(workload(2, 0)).toBe(100);
  });

  it("excluye revisitas de la resolución en primera visita", () => {
    expect(firstResolutionSummary([{ id: "a", visitCount: 1 }, { id: "b", visitCount: 2 }, { id: "c", visitCount: 1 }], new Set(["c"]))).toEqual({ rate: 33, repeats: 2 });
  });
});

