/**
 * La agenda muestra desde al menos un mes antes hasta el futuro (AG-R8).
 * Esta es la fecha por defecto del filtro "desde": el usuario puede
 * angostarla o ampliarla, pero al abrir la pantalla ya cumple el requisito
 * sin que haga falta tocar nada.
 */
export function defaultAgendaDateFrom(today: Date): string {
  const monthAgo = new Date(today);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  return monthAgo.toISOString().slice(0, 10);
}
