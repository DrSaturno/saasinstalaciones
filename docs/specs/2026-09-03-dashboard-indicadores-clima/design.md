# Diseño

## Fase 0 — Tasa de incidencias

Nueva función pura en `lib/domain/manager-dashboard.ts`, al lado de
`firstResolutionSummary` (mismo archivo, mismo estilo, misma idea de
"cuenta por orden, no por evento"):

```ts
export function incidentRate(
  finalizedOrderIds: string[],
  incidentOrderIds: Set<string>,
) {
  if (finalizedOrderIds.length === 0) return 0;
  const withIncident = finalizedOrderIds.filter((id) => incidentOrderIds.has(id)).length;
  return percentage(withIncident, finalizedOrderIds.length);
}
```

En `fetchDashboardOverview`, `incidentOrderIds` sale de `incidents` (ya en
memoria, sin query nueva): `new Set(incidents.map((i) => i.order_id))`.
`quality` gana el campo `incidentRate`. En `dashboard-quality.tsx`, se
muestra al lado de `firstResolutionRate` en la misma tarjeta — son las dos
caras de la misma pregunta ("¿cómo salió el trabajo?"), no ameritan
tarjetas separadas.

## Fase 1 — Clima a 48h con narrativa

**Ventana**: `forecast_days` pasa de `"1"` a `"2"`. `severity()` se evalúa
sobre el peor caso entre ambos días (mismo criterio que el gate de agenda:
errar hacia la alerta cuesta menos que no avisar a tiempo). `ZoneForecast`
gana `eventType` derivado del código WMO dominante:

```ts
function eventType(code: number): "storm" | "rain" | "heat" | "cold" | "wind" | "none" {
  if ([95, 96, 99].includes(code)) return "storm";
  if ([65, 82, 61, 63, 51, 53, 55, 80, 81].includes(code)) return "rain";
  if (code === 0 && /* temp check hecho aparte con max/min */ false) return "heat"; // ver nota
  return "none";
}
```

Temperatura extrema no sale del código WMO (que sólo describe precipitación/
cielo): se evalúa aparte comparando `max`/`min` contra umbrales fijos (>35°C
calor extremo, <0°C frío extremo) y se combina con el evento de precipitación
si ambos aplican — se prioriza el que tenga mayor severidad.

**Fallback geográfico** (`DASH-R3`, AC-22-B): la tabla `FALLBACKS` de
`lib/weather/forecast.ts` gana un centroide por cada una de las 23
provincias argentinas + CABA (coordenadas de la ciudad capital de cada
una, suficiente para una estimación regional — no hace falta precisión
geodésica para saber si va a llover en la provincia). Las claves usan el
mismo string que `sites.zone` guarda para Argentina (nombre completo de la
provincia, confirmado contra `lib/domain/geography.ts` `AR_PROVINCES`) y el
diccionario de estados de Brasil existente no se toca.

**Narrativa** (`DASH-R4`, AC-22-D): `fetchDashboardOverview` ya recorre
`liveOrders` para armar `weatherZones`; se agrega ahí mismo (sin query
nueva) un conteo de órdenes con `scheduled_date` dentro de la ventana de
48h por zona:

```ts
const next48h = [today, addDays(today, 1), addDays(today, 2)];
const ordersNext48hByZone = new Map<string, number>();
for (const order of liveOrders) {
  if (!order.scheduled_date) continue;
  const end = order.scheduled_end_date ?? order.scheduled_date;
  if (!next48h.some((d) => d >= order.scheduled_date! && d <= end)) continue;
  const zone = siteById.get(order.site_id)?.zone;
  if (!zone) continue;
  ordersNext48hByZone.set(zone, (ordersNext48hByZone.get(zone) ?? 0) + 1);
}
```

`weatherZones` pasa de `{name, lat, lng}` a `{name, lat, lng, ordersNext48h}`.
`DashboardPulse` arma el texto de la alerta con la narrativa pedida:

> ⚠️ Posible afectación regional
> Se pronostican {evento} en {zona} durante las próximas 48 horas.
> Hay {N} trabajos programados en la zona.

Sin listar órdenes por nombre (ruido) — el link a la zona ya deja
profundizar. Si `ordersNext48h` es 0, la alerta climática igual se muestra
(la ausencia de trabajos en la zona no hace desaparecer el riesgo
meteorológico) pero con "sin trabajos programados en la zona" en vez del
conteo, para no insinuar un impacto operativo que no existe.

## Fase 2 — Reorganización visual

Un componente chico nuevo, `DashboardSection` (`components/company/dashboard-section.tsx`),
sólo un encabezado de sección + `children` — no reemplaza ningún `Card`
existente, sólo los agrupa visualmente bajo un título con jerarquía propia
(mismo patrón tipográfico que ya usa `CardTitle`, un nivel arriba). Se
reordena el JSX de `page.tsx` bajo 4 secciones:

1. **Indicadores generales** — `DashboardMetrics`, `DashboardQuality`
   (ahora con tasa de incidencias), `DashboardFinancePulse` (ya construido,
   nunca importado en `page.tsx` — se activa acá).
2. **Rendimiento** — `DashboardProjects` (avance por proyecto),
   `DashboardInsights` (avance por provincia + por instalador — el título
   de la tarjeta de regiones pasa de "Desempeño por zona" a "Desempeño por
   provincia" donde el país es Argentina; para Brasil sigue diciendo
   "estado", ya que `zone` ahí guarda la sigla del estado, no el nombre).
3. **Situación regional** — `DashboardMap`, `DashboardAgenda` +
   `DashboardTodayOrders`, `DashboardCapacity`.
4. **Alertas y factores externos** — `DashboardPulse` (alertas operativas +
   clima con la narrativa nueva), `DashboardOperations` (clima detallado por
   zona + estado de Google Calendar).

Las acciones rápidas (`DashboardQuickActions`) y el compositor de anuncios
quedan **antes** de las 4 secciones, sin encabezado propio — son
herramientas de acción, no indicadores, y ya funcionan bien donde están.

Nada de esto toca `lib/data/dashboard.ts` más allá de las Fases 0 y 1 —
es puro reordenamiento de JSX ya existente.
