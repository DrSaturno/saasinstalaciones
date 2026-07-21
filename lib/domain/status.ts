import type { OrderStatus, SiteStatus, ProjectStatus } from "@/types/database";

/** Etiquetas y colores por estado de orden (§7 del blueprint). */
export const ORDER_STATUS: Record<
  OrderStatus,
  { key: `order.${OrderStatus}`; bg: string; fg: string }
> = {
  pendiente: { key: "order.pendiente", bg: "#868c9820", fg: "#5b6069" },
  relevamiento: { key: "order.relevamiento", bg: "#2196f320", fg: "#1565a8" },
  planificada: { key: "order.planificada", bg: "#c0d5ff", fg: "#371866" },
  en_proceso: { key: "order.en_proceso", bg: "#2597d020", fg: "#166a95" },
  en_revision: { key: "order.en_revision", bg: "#ffecc0", fg: "#8a6d1f" },
  finalizada: { key: "order.finalizada", bg: "#43a04720", fg: "#2c6e2f" },
  cancelada: { key: "order.cancelada", bg: "#d32f2f18", fg: "#a52323" },
};

/** El estado del punto es un cache derivado de sus órdenes. */
export const SITE_STATUS: Record<
  SiteStatus,
  { key: `site.${SiteStatus}`; bg: string; fg: string }
> = {
  sin_ordenes: { key: "site.sin_ordenes", bg: "#868c9815", fg: "#868c98" },
  pendiente: { ...ORDER_STATUS.pendiente, key: "site.pendiente" },
  planificada: { ...ORDER_STATUS.planificada, key: "site.planificada" },
  en_proceso: { ...ORDER_STATUS.en_proceso, key: "site.en_proceso" },
  finalizada: { ...ORDER_STATUS.finalizada, key: "site.finalizada" },
};

export const PROJECT_STATUS: Record<ProjectStatus, { key: `project.${ProjectStatus}` }> = {
  draft: { key: "project.draft" },
  active: { key: "project.active" },
  paused: { key: "project.paused" },
  done: { key: "project.done" },
};

/** Orden en que se muestran los estados en resúmenes y filtros. */
export const SITE_STATUS_ORDER: SiteStatus[] = [
  "sin_ordenes",
  "pendiente",
  "planificada",
  "en_proceso",
  "finalizada",
];
