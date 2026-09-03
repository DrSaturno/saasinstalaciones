# Tareas

Trazan a `REQ-12` de la spec madre. Sin migración de base — todo lee de
columnas y tablas que ya existen.

## Fase 0 — Tasa de incidencias

- [x] **DASH-INC-01** — `incidentRate()` en `lib/domain/manager-dashboard.ts`,
  con test unitario (mismo criterio de conteo que `firstResolutionSummary`:
  por orden, no por evento). → DASH-R1, AC-22-A
- [x] **DASH-INC-02** — `fetchDashboardOverview` expone `quality.incidentRate`.
  Sin query nueva — `incidents` ya está en memoria.
- [x] **DASH-INC-03** — `dashboard-quality.tsx` muestra el número al lado de
  la resolución en una visita.

## Fase 1 — Clima a 48h con narrativa

- [x] **DASH-WEA-01** — `forecast_days: "2"`; `ZoneForecast` agrega
  `eventType` y agrega los peores valores entre ambos días para severidad.
  → DASH-R2, AC-22-C
- [x] **DASH-WEA-02** — Fallback geográfico: centroides de las 23 provincias
  argentinas + CABA en `FALLBACKS`. → DASH-R3, AC-22-B
- [x] **DASH-WEA-03** — `fetchDashboardOverview` calcula `ordersNext48h` por
  zona sin query nueva; `weatherZones` lo expone.
- [x] **DASH-WEA-04** — `DashboardPulse` reescribe el texto de la alerta
  climática con la narrativa pedida (evento + ventana + cantidad de OTs).
  → DASH-R4, AC-22-D

## Fase 2 — Reorganización visual

- [x] **DASH-UI-01** — `DashboardSection` (encabezado de sección reusable).
- [x] **DASH-UI-02** — Reordenar `page.tsx` en las 4 secciones (Indicadores
  generales / Rendimiento / Situación regional / Alertas y factores
  externos). Ningún indicador se pierde. → DASH-R7, AC-22-E
- [x] **DASH-UI-03** — Activar `DashboardFinancePulse` (ya construido, sin
  importar) dentro de "Indicadores generales".
- [x] **DASH-UI-04** — Copy: "Desempeño por zona" → "Desempeño por
  provincia" para Argentina (Brasil sigue diciendo "estado").

**Verificado contra Demo con navegador real** (empresa de prueba, 3 órdenes
finalizadas —una con incidente—, 1 planificada en 2 provincias): tasa de
incidencias dio 33% (1 de 3, tal como se esperaba con el criterio "por
orden"); resolución en primera visita 67%; "Desempeño por provincia" con
Mendoza y Córdoba; `DashboardFinancePulse` visible por primera vez; clima a
48h con datos reales de Open-Meteo para ambas provincias (`forecast_days=2`
confirmado funcionando sin romper nada). No hubo ninguna zona con alerta real
el día de la verificación, así que la rama "⚠️ Posible afectación regional"
del texto no se vio renderizada con datos reales — sí se confirmó que la
rama "sin alertas" funciona, y el resto del pipeline (`ordersNext48h`,
`eventType`, cruce `forecasts`↔`weatherZones`) quedó ejercitado end-to-end.
Datos de prueba borrados después.

## Fuera de alcance, a propósito

- **REQ-12.1/12.3-eventos** (catálogo de KPIs reconciliado contra
  field/performance events, `R9-DASH-01/03`) — rediseño de la fuente de
  datos del dashboard entero, no lo que pidió el punto 22.
- **REQ-12.2** (filtros comunes período/proyecto/provincia/instalador
  aplicados a todos los paneles) — Nicolás lo dejó fuera de esta entrega
  explícitamente; el dashboard sigue mostrando el estado actual (hoy +
  agregados corrientes), sin selector de rango.
- **"Equipo" de instaladores** — no existe esa entidad en el dominio;
  Nicolás confirmó que el desglose individual alcanza.
