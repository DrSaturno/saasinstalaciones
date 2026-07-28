import type { ProjectStatus } from "@/types/database";

/**
 * Estado operativo de un proyecto, tal como se muestra en filtros y métricas.
 *
 * `delayed` no existe en la base: se deriva de la fecha de fin comprometida.
 * Un proyecto activo cuya fecha estimada de cierre ya pasó, y que todavía tiene
 * puntos sin terminar, está demorado.
 */
export type ProjectHealth =
  | "draft"
  | "active"
  | "delayed"
  | "paused"
  | "done"
  | "archived";

/** Estados que se muestran en el listado corriente, sin los archivados. */
export const PROJECT_HEALTH_ORDER: readonly ProjectHealth[] = [
  "active",
  "delayed",
  "done",
  "paused",
  "draft",
];

export function projectHealth(project: {
  status: ProjectStatus;
  endsAt: string | null;
  total: number;
  done: number;
  archivedAt?: string | null;
}): ProjectHealth {
  // Archivar es ortogonal al estado y manda sobre todo lo demás: el proyecto
  // sale del listado corriente sin perder si estaba activo, pausado o terminado.
  if (project.archivedAt) return "archived";
  if (project.status === "done") return "done";
  if (project.status === "paused") return "paused";
  if (project.status === "draft") return "draft";

  const complete = project.total > 0 && project.done >= project.total;
  if (complete) return "active";

  if (project.endsAt) {
    const today = new Date().toISOString().slice(0, 10);
    if (project.endsAt < today) return "delayed";
  }

  return "active";
}

/** Porcentaje de avance general: puntos terminados sobre puntos totales. */
export function overallProgress(
  projects: readonly { total: number; done: number }[],
): number {
  const total = projects.reduce((sum, p) => sum + p.total, 0);
  if (total === 0) return 0;
  const done = projects.reduce((sum, p) => sum + p.done, 0);
  return Math.round((done / total) * 100);
}
