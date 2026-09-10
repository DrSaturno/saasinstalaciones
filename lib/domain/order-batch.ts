/**
 * Sobre qué locaciones se generan las órdenes de un lote.
 *
 * El alcance puede venir **explícito** —la pantalla manda la lista— o
 * **deducirse** como «las que todavía no tienen orden».
 *
 * Deducirlo es lo correcto la primera vez: nadie quiere tildar 200 casilleros
 * para decir «todas las que faltan». Pero vuelve inexpresable la segunda
 * vuelta: cuando hay que volver a intervenir en 200 locales ya trabajados, ese
 * conjunto está vacío justo cuando más se lo necesita. Por eso el alcance
 * explícito existe y gana cuando viene.
 *
 * Ver docs/specs/2026-09-10-ordenes-en-lote-segunda-vuelta/ (DEC-LOTE-01).
 */
export function resolveBatchScope({
  projectSiteIds,
  sitesWithOrders,
  requestedSiteIds,
}: {
  /** Locaciones activas del proyecto. Define qué es elegible. */
  projectSiteIds: string[];
  /** Las que ya tienen una orden viva. */
  sitesWithOrders: ReadonlySet<string>;
  /** Elegidas a mano. Vacío = deducir. */
  requestedSiteIds: string[];
}): { toCreate: string[]; skipped: number; revisits: number } {
  // Los ids llegan en el cuerpo del pedido, así que no se puede confiar en
  // ellos: uno de otro proyecto —o de otra empresa— no entra por venir escrito.
  const eligible = new Set(projectSiteIds);
  const toCreate = requestedSiteIds.length
    ? [...new Set(requestedSiteIds)].filter((id) => eligible.has(id))
    : projectSiteIds.filter((id) => !sitesWithOrders.has(id));

  return {
    toCreate,
    skipped: projectSiteIds.length - toCreate.length,
    // Cuántas caen sobre locaciones ya trabajadas: el número que distingue
    // «termino de cargar el proyecto» de «mando a rehacer 200 locales».
    revisits: toCreate.filter((id) => sitesWithOrders.has(id)).length,
  };
}
