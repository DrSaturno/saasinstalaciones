import type { OrderStatus } from "@/types/database";

/**
 * Reglas del flujo de trabajo en campo (punto 24).
 *
 * Espejo de lo que valida `validate_order_transition` en la base. Existe para
 * no ofrecer en pantalla un botón que la base va a rechazar, y para poder
 * decir QUÉ falta en vez de "no se puede".
 *
 * ⚠️ La DB es la fuente de verdad. Si cambia el mínimo o la secuencia, hay
 * que cambiarlo en los dos lados.
 */

/** Baseline del pedido: tres fotos, salvo que la empresa o el proyecto digan otra cosa. */
export const DEFAULT_MIN_COMPLETION_PHOTOS = 3;

/**
 * El mínimo efectivo de una orden: manda el proyecto, y si no fijó nada,
 * la empresa.
 *
 * `null` en el proyecto significa "usá el de la empresa", nunca "cero" — por
 * eso la comparación es contra null y no un `||`, que trataría el 0 como
 * ausencia y volvería obligatorias las fotos justo donde alguien las
 * deshabilitó a propósito.
 */
export function minCompletionPhotos(
  companyMinimum: number | null | undefined,
  projectMinimum: number | null | undefined,
): number {
  if (projectMinimum !== null && projectMinimum !== undefined) return projectMinimum;
  if (companyMinimum !== null && companyMinimum !== undefined) return companyMinimum;
  return DEFAULT_MIN_COMPLETION_PHOTOS;
}

export type CompletionReadiness = {
  /** Fotos que ya tiene la orden, contando todo su historial. */
  photos: number;
  /** Cuántas hacen falta en total. */
  required: number;
  /** Cuántas faltan todavía. Cero cuando ya alcanza. */
  missing: number;
  ready: boolean;
};

/**
 * Si la orden puede cerrarse, y cuánto le falta si no.
 *
 * Cuenta las fotos de TODA la orden y no las del evento de cierre
 * (FLD-R4.3): quien documentó bien mientras trabajaba no tiene que volver a
 * fotografiar lo mismo para poder terminar.
 */
export function completionReadiness(
  photosInOrder: number,
  required: number,
  photosAboutToUpload = 0,
): CompletionReadiness {
  const photos = photosInOrder + photosAboutToUpload;
  const missing = Math.max(0, required - photos);
  return { photos, required, missing, ready: missing === 0 };
}

/** Etapas que el instalador recorre en el punto, en orden. */
export const FIELD_STAGES = [
  "planificada",
  "en_camino",
  "en_sitio",
  "en_proceso",
  "en_revision",
] as const satisfies readonly OrderStatus[];

export type FieldAction = "depart" | "arrive" | "start" | "report" | "finish";

/**
 * La acción que corresponde ofrecer según en qué etapa está la orden.
 *
 * Devuelve una sola: la pantalla del instalador es un teléfono al sol y con
 * guantes puestos. Ofrecer las tres salidas posibles de `planificada`
 * —salir, llegar, empezar— sería técnicamente correcto y prácticamente un
 * estorbo. La base acepta los atajos; la UI guía el camino.
 */
export function nextFieldAction(status: OrderStatus): FieldAction | null {
  switch (status) {
    case "planificada":
      return "depart";
    case "en_camino":
      return "arrive";
    case "en_sitio":
      return "start";
    case "en_proceso":
      return "finish";
    default:
      return null;
  }
}

/** Un evento del historial que movió el estado de la orden. */
export function isStatusChange(update: {
  from_status?: string | null;
  to_status?: string | null;
}): boolean {
  return Boolean(update.to_status);
}
