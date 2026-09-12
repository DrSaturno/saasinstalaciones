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

/**
 * Qué órdenes del lote todavía necesitan el post-proceso.
 *
 * Después de insertar, el alta masiva le da a cada orden su actividad, su
 * horario y —si corresponde— su instalador. Ese bucle puede cortarse: es
 * trabajo O(n) con viajes secuenciales a la base y hay un límite de tiempo.
 *
 * Lo que dejaba un corte era permanente. Las órdenes insertadas quedaban SIN
 * actividad de ejecución —invisibles para la agenda y la proyección— y el
 * reintento no las reparaba: el índice único por lote hace que el insert falle
 * con 23505, y el filtro de «puntos que ya tienen orden» las saltea igual.
 *
 * Por eso el post-proceso no se calcula sobre «lo que acabo de insertar» sino
 * sobre «lo de este lote que todavía no está terminado». Como la RPC de
 * actividades es idempotente, repetirla sobre una orden completa no hace nada,
 * y el alta masiva se vuelve reanudable: reintentar avanza.
 *
 * Se acota al lote a propósito. Reparar cualquier orden sin actividad tocaría
 * también las anteriores a que las actividades existieran, y les pondría el
 * tipo de actividad de ESTE pedido, que no tiene por qué ser el suyo.
 */
export function ordersToFinish({
  insertedIds,
  batchOrders,
}: {
  /** Las que insertó esta corrida. */
  insertedIds: string[];
  /** Todas las del `batch_id`, con sus actividades (vacío = quedó a medias). */
  batchOrders: { id: string; activityCount: number }[];
}): string[] {
  const finish = [...new Set(insertedIds)];
  const known = new Set(finish);

  for (const order of batchOrders) {
    if (order.activityCount === 0 && !known.has(order.id)) {
      finish.push(order.id);
      known.add(order.id);
    }
  }

  return finish;
}
