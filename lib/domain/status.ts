import type { OrderStatus, SiteStatus, ProjectStatus } from "@/types/database";

/** Etiquetas y colores por estado de orden (§7 del blueprint). */
export const ORDER_STATUS: Record<
  OrderStatus,
  { label: string; bg: string; fg: string }
> = {
  pendiente: { label: "Pendiente", bg: "#868c9820", fg: "#5b6069" },
  relevamiento: { label: "Relevamiento", bg: "#2196f320", fg: "#1565a8" },
  planificada: { label: "Planificada", bg: "#c0d5ff", fg: "#371866" },
  en_proceso: { label: "En proceso", bg: "#2597d020", fg: "#166a95" },
  en_revision: { label: "En revisión", bg: "#ffecc0", fg: "#8a6d1f" },
  finalizada: { label: "Finalizada", bg: "#43a04720", fg: "#2c6e2f" },
  cancelada: { label: "Cancelada", bg: "#d32f2f18", fg: "#a52323" },
};

/** El estado del punto es un cache derivado de sus órdenes. */
export const SITE_STATUS: Record<
  SiteStatus,
  { label: string; bg: string; fg: string }
> = {
  sin_ordenes: { label: "Sin órdenes", bg: "#868c9815", fg: "#868c98" },
  pendiente: ORDER_STATUS.pendiente,
  planificada: ORDER_STATUS.planificada,
  en_proceso: ORDER_STATUS.en_proceso,
  finalizada: ORDER_STATUS.finalizada,
};

export const PROJECT_STATUS: Record<ProjectStatus, { label: string }> = {
  draft: { label: "Borrador" },
  active: { label: "Activo" },
  paused: { label: "Pausado" },
  done: { label: "Terminado" },
};

/** Orden en que se muestran los estados en resúmenes y filtros. */
export const SITE_STATUS_ORDER: SiteStatus[] = [
  "sin_ordenes",
  "pendiente",
  "planificada",
  "en_proceso",
  "finalizada",
];
