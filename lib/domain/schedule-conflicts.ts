/**
 * Choques de agenda del instalador.
 *
 * El requisito pide que antes de confirmar una reprogramación pueda "evaluar
 * nuevamente su disponibilidad", porque la fecha nueva puede pisarle otra orden
 * que ya aceptó. Sin esto la pregunta es injusta: se le pide un compromiso a
 * ciegas.
 *
 * Las fechas son claves `YYYY-MM-DD`, así que se comparan como texto — ese
 * formato ordena igual que cronológicamente. No se convierte a `Date` a
 * propósito: `new Date("2026-09-08")` interpreta UTC y correría un día en
 * cualquier huso al oeste de Greenwich, que es donde vive todo el producto.
 */

export type ScheduledOrder = {
  id: string;
  orderNumber: string;
  title: string;
  scheduledDate: string | null;
  scheduledEndDate: string | null;
};

export type DateRange = { start: string; end: string | null };

/** Un día suelto es un rango que empieza y termina el mismo día. */
function span(range: DateRange): [string, string] {
  return [range.start, range.end && range.end >= range.start ? range.end : range.start];
}

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  const [aStart, aEnd] = span(a);
  const [bStart, bEnd] = span(b);
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Las órdenes del instalador que se pisan con el rango propuesto.
 *
 * Quien llama decide qué órdenes entran: acá no se filtra por estado, porque
 * una orden cancelada o finalizada no debería ni llegar a esta lista y
 * silenciarla acá escondería un error de la consulta.
 */
export function findScheduleConflicts(
  orders: readonly ScheduledOrder[],
  proposed: DateRange,
  excludeOrderId: string,
): ScheduledOrder[] {
  return orders.filter((order) => {
    if (order.id === excludeOrderId) return false;
    // Sin fecha comprometida no hay con qué chocar todavía.
    if (!order.scheduledDate) return false;
    return rangesOverlap(
      { start: order.scheduledDate, end: order.scheduledEndDate },
      proposed,
    );
  });
}
