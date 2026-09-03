# 22. Dashboard — indicadores y planificación

## Contexto

El pedido de Nicolás (03-09-2026) pide reacomodar el dashboard existente —
sin reemplazarlo— para jerarquizar la información y sumar clima como dato de
apoyo para la planificación regional. Traza a `REQ-12` de
`docs/specs/2026-08-04-evolucion-producto/`, que ya documentaba casi el mismo
pedido bajo otro nombre (`R9-DASH-*`, `R9-WEA-*`), sin ninguna tarea marcada.

**Auditando el dashboard real antes de escribir una sola línea** (mismo
método que en todos los puntos anteriores), la mayor parte de lo pedido
**ya existe**:

| Indicador pedido | Estado |
|---|---|
| % resuelto en una visita | Existe — `firstResolutionSummary`, `dashboard-quality.tsx` |
| Avance por proyecto | Existe, con más detalle del pedido (variance vs. plan, fecha proyectada) — `dashboard-projects.tsx` |
| Avance por provincia | Existe, pero la UI lo llama "zona" — el dato subyacente **es** la provincia (`sites.zone` espeja `sites.state` desde `20260725000001_geography.sql`) |
| Rendimiento por instalador | Existe, con bastante detalle — `dashboard-insights.tsx` |
| Tasa de incidencias | **No existe.** Hay lista de incidentes y contador de abiertos, ningún porcentaje |
| Clima | **Existe una integración real** (Open-Meteo, sin API key), pero sólo mira 1 día y el texto de alerta no menciona las órdenes afectadas |

Lo que falta no es "construir el dashboard de nuevo": son dos huecos de
cálculo puntuales (tasa de incidencias, clima a 48h con narrativa) y una
reorganización visual sobre componentes que ya funcionan.

## Decisiones tomadas con Nicolás antes de empezar

- **"Instalador o equipo" → sólo instalador.** No existe la noción de
  "equipo" en el dominio (`company_installers` es individual). Inventar esa
  entidad sólo para esta pantalla sería construir una fundación nueva sin
  necesidad de negocio confirmada. El desglose individual ya existente,
  mejorado visualmente, cubre el pedido.
- **Clima: mejorar lo existente, sin filtros de comparación por período
  todavía.** REQ-12.2/12.3 (filtros comunes período/proyecto/provincia/
  instalador aplicados a todos los paneles) y REQ-12.1/12.3 tal como piden
  "eventos" reconciliados (`R9-DASH-01/03`) quedan **fuera de alcance de
  esta entrega**: son un rediseño de la fuente de datos del dashboard
  entero, no algo que el pedido de negocio del punto 22 exige explícitamente
  — el pedido habla de reordenar y sumar clima, no de reconciliar KPIs
  contra un ledger de eventos. Se documentan como trabajo futuro, no se
  descartan.

## Qué NO se toca

- La lógica de negocio de los indicadores que ya existen (`firstResolutionSummary`,
  `projectHealth`, cálculo de regiones/instaladores) no cambia — sólo se
  reordena visualmente y se le suma la tasa de incidencias al lado.
- No se agrega ningún proveedor climático nuevo: Open-Meteo ya cubre lo que
  hace falta (pronóstico multi-día, sin costo, sin API key).
- No se toca el schema de `sites`/`work_orders`/`order_incidents` — todos
  los cálculos nuevos se hacen sobre columnas que ya existen.

## Fases

1. **Fase 0** — Tasa de incidencias: cálculo en `lib/domain/manager-dashboard.ts`
   + `lib/data/dashboard.ts`, mostrado junto a la resolución en una visita.
2. **Fase 1** — Clima a 48h con narrativa: `forecast_days: 2`, fallback
   geográfico corregido para las 23 provincias argentinas reales, texto de
   alerta que cuenta las órdenes programadas en la zona afectada.
3. **Fase 2** — Reorganización visual: las 4 secciones sugeridas
   (Indicadores generales / Rendimiento / Situación regional / Alertas y
   factores externos), activar `DashboardFinancePulse` (ya construido, sin
   usar), y renombrar "zona" → "provincia" en el copy donde corresponde.

## Archivos clave

- `lib/data/dashboard.ts` (`fetchDashboardOverview`) — única fuente de datos
  del dashboard, ya trae en memoria todo lo que hace falta para la tasa de
  incidencias y el conteo de OTs por zona a 48h.
- `lib/domain/manager-dashboard.ts` — funciones puras de cálculo, mismo
  lugar donde ya vive `firstResolutionSummary`.
- `lib/weather/forecast.ts` (`fetchZoneForecasts`) — integración Open-Meteo.
- `app/(company)/dashboard/page.tsx` — layout, hoy una lista vertical plana.
- `docs/specs/2026-08-04-evolucion-producto/requirements.md` REQ-12 —
  requisito madre al que traza este punto.
