/**
 * Qué contiene una orden: sólo el relevamiento, sólo la ejecución, o las dos.
 *
 * El requisito lo dice explícitamente: un relevamiento puede ser un trabajo en
 * sí mismo o una etapa dentro de otro, y el sistema no puede obligar a que
 * todo entre en una sola estructura. Esto es esa elección, y es lo que después
 * decide qué actividades se crean.
 *
 * `execution` es el default porque es lo que hacían todas las órdenes hasta
 * ahora: quien no elija nada sigue obteniendo el comportamiento de siempre.
 */
export const ORDER_ACTIVITY_KINDS = ["execution", "survey", "both"] as const;

export type OrderActivityKind = (typeof ORDER_ACTIVITY_KINDS)[number];

export function activitiesFor(kind: OrderActivityKind): {
  includeSurvey: boolean;
  includeExecution: boolean;
} {
  return {
    includeSurvey: kind === "survey" || kind === "both",
    includeExecution: kind === "execution" || kind === "both",
  };
}

/**
 * Una orden de sólo relevamiento no se "planifica" en el sentido viejo: se
 * releva, se revisa y se cierra. Por eso no se le pide fecha de inicio como a
 * un trabajo a ejecutar — el requisito dice que la fecha del relevamiento es
 * opcional hasta que se pueda definir.
 */
export function requiresStartDate(kind: OrderActivityKind): boolean {
  return kind !== "survey";
}
