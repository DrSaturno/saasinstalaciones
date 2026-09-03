# Requisitos

Traza a `REQ-12` de `docs/specs/2026-08-04-evolucion-producto/requirements.md`.
De ese requisito madre, esta entrega cubre 12.4/12.5/12.6 (clima) completos y
la parte de 12.3 que pide mostrar tasa de incidencias y desempeño por
provincia/instalador (ya construido para provincia/instalador; se completa
la tasa de incidencias). 12.1/12.2/12.3-eventos (catálogo de KPIs
reconciliado contra eventos, filtros comunes por período) quedan fuera de
alcance — ver README.

## Reglas

- **DASH-R1** — La tasa de incidencias se calcula sobre el mismo universo
  que la resolución en una visita (órdenes finalizadas), para que ambos
  números sean comparables en la misma tarjeta: `% de órdenes finalizadas
  que registraron al menos un incidente en algún momento de su ciclo`. No es
  "incidentes por orden" — una orden con 3 incidentes no pesa 3 veces.
- **DASH-R2** — El clima cubre al menos 48 horas, tomando el peor caso entre
  los dos días para la severidad mostrada (mismo criterio que el gate de
  agenda: errar hacia la alerta cuesta menos que no avisar).
- **DASH-R3** — Ninguna provincia argentina real cae en el fallback
  brasileño. Las 23 provincias + CABA tienen coordenadas de fallback
  propias; Brasil sigue con su tabla de estados existente.
- **DASH-R4** — La alerta climática indica: zona, ventana (48h), severidad,
  tipo de evento (lluvia/tormenta/temperatura extrema/viento) y cantidad de
  órdenes programadas en esa zona dentro de la ventana. Nunca lista las
  órdenes por nombre en la alerta misma (evita ruido); el link a la zona/
  provincia ya permite profundizar.
- **DASH-R5** — El clima es dato de apoyo, nunca bloquea ni reprograma nada
  automáticamente (REQ-12.6, ya respetado por el diseño actual — no se
  toca este principio).
- **DASH-R6** — Si Open-Meteo falla, el resto del dashboard carga igual
  (ya respetado hoy vía `Promise.allSettled`; no se rompe al ampliar a 2
  días).
- **DASH-R7** — La reorganización visual no elimina ni oculta ningún
  indicador que ya se muestra hoy — sólo cambia su agrupación y jerarquía.

## Criterios de aceptación

- **AC-22-A** — Dada una empresa con 10 órdenes finalizadas y 3 de ellas con
  al menos un incidente (una con 2 incidentes), la tasa de incidencias
  muestra 30%, no 40%.
- **AC-22-B** — Dada una provincia argentina sin `lat`/`lng` cargados en
  ninguno de sus sitios, el pronóstico usa el fallback de esa provincia, no
  el de Brasil.
- **AC-22-C** — Dada una zona con lluvia intensa pronosticada para mañana
  (día 2 de la ventana) pero no para hoy, la alerta la muestra igual —
  "próximas 48 horas" cubre ambos días, no sólo el actual.
- **AC-22-D** — Dada una alerta climática con severidad, el texto menciona
  la cantidad de órdenes programadas en esa zona dentro de las 48h, no sólo
  el dato meteorológico crudo.
- **AC-22-E** — Todos los indicadores visibles hoy en `/dashboard` siguen
  visibles después de la reorganización (ninguno se pierde en el reordene).
