# Requisitos — RESULT-*

## Otros costos

- **RESULT-R1.1** — Una empresa puede cargar gastos de un proyecto: concepto
  (texto), monto (positivo), fecha, y queda registrado quién lo cargó.
- **RESULT-R1.2** — Sólo quien puede ver lo comercial de la empresa
  (`auth_can_see_commercials`: el dueño, o una subcuenta con permiso de
  finanzas) puede ver, cargar o borrar gastos. Un coordinador o instalador no
  ve esta pantalla ni estos datos, mismo criterio que `/finance`.
- **RESULT-R1.3** — Un gasto es de UNA empresa y UN proyecto de esa empresa;
  no cruza tenants (RLS + FK compuesta, mismo patrón que el resto del schema).

## Resultado económico

- **RESULT-R2.1** — La ganancia/pérdida de un proyecto es: ingreso de lo
  terminado − costo de instaladores de lo terminado − otros costos cargados
  para ese proyecto.
- **RESULT-R2.2** — Un proyecto sin ningún gasto cargado se comporta
  exactamente como hoy (no resta nada): el bloque es aditivo, no cambia el
  número de ningún proyecto existente sin gastos.
- **RESULT-R2.3** — La misma resta de otros costos aplica tanto en la ficha
  de un proyecto (`ProjectPerformancePanel`) como en la pantalla `/finance`
  de toda la empresa (`FinanceProjects`) — un mismo proyecto no puede mostrar
  dos ganancias distintas según dónde se lo mire.

## Torta de avance

- **RESULT-R3.1** — Cada proyecto muestra su avance como gráfico de torta
  (terminadas vs. abiertas), además de —no en reemplazo de— la barra lineal
  que ya existe.
- **RESULT-R3.2** — El número que alimenta la torta es
  `finalizadas ÷ (total − canceladas)`, el mismo que ya calcula
  `buildProjectPerformance` (`orders.done`/`orders.total`) — no se inventa un
  cálculo nuevo.

## Trazabilidad

Cada requisito traza a `supabase/tests/project_expenses.test.sql` (RLS) y a
tests de dominio en `lib/domain/project-performance.test.ts` /
`lib/domain/finance.test.ts` (si existen; si no, se agregan).
