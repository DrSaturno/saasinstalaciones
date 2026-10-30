# Bloque 6 — Resultado económico del proyecto + torta de avance

Pedido original (24-09-2026): ingreso del cliente − costo de instaladores −
otros costos = ganancia/pérdida por proyecto; porcentaje de avance como
torta. Ver `../2026-09-24-hoja-de-ruta-v2/README.md` para el paquete
completo.

## Lo que ya existía (auditado 25-09-2026)

A diferencia del bloque 5, acá la mayor parte de la cuenta ya estaba hecha:

- `lib/domain/project-performance.ts` (`buildProjectPerformance`) ya calcula
  `revenue` (ingreso de lo terminado), `installerCost` (costo de
  instaladores de lo terminado) y `profit = revenue - installerCost`, más
  `orders.total`/`orders.done` — que YA ES el numerador y denominador exactos
  de la decisión 2 (`finalizadas ÷ (total − canceladas)`, `live` ya excluye
  canceladas).
- `lib/domain/finance.ts` (`buildFinancialOverview`) ya calcula lo mismo por
  proyecto para la pantalla `/finance` de toda la empresa (`margin`).
- `app/(company)/projects/[id]/page.tsx` ya muestra un avance lineal
  (`overallProgress`, barra) con los mismos números.

Lo que falta, y es todo el alcance real de este bloque:

1. **Otros costos.** No existe ningún lugar en el schema donde cargar un
   gasto de proyecto (materiales, viáticos, transporte). `profit`/`margin`
   hoy sólo restan el costo de instaladores.
2. **La torta.** El avance existe como número y como barra lineal, pero
   Nicolás pidió específicamente una torta (pie/donut) — no hay ningún
   componente de ese tipo en el proyecto todavía.

## Decisión ya tomada (24-09-2026, hoja de ruta)

- **Avance:** `finalizadas ÷ (total − canceladas)`, sin ponderar. Ya sale de
  datos existentes (`orders.done`/`orders.total`).
- **Otros costos:** tabla de gastos por proyecto con concepto, monto, fecha y
  quién lo cargó.

## Diseño

- Tabla nueva `project_expenses`, gateada por `auth_can_see_commercials`
  (el mismo permiso que ya decide quién ve `/finance` y los importes
  comerciales — bloques 4 y 8, sin inventar un permiso nuevo).
- `buildProjectPerformance` y `buildFinancialOverview` ganan un parámetro de
  "otros costos" (suma por proyecto) y lo restan de `profit`/`margin`. Firma
  aditiva: nada dentro de esas funciones cambia si `otherCosts` es 0 (todo
  proyecto sin gastos cargados, que es el caso de arranque).
- Componente nuevo `OrderCompletionPie` (SVG, sin librería nueva): dona con
  terminadas vs. abiertas, mismos números que ya calcula
  `buildProjectPerformance`.
- Componente nuevo `ProjectExpensesPanel`: lista + alta + borrado de gastos,
  visible sólo si `canManageFinance || isOwner` (mismo criterio que
  `/finance` y el panel de personal administrativo del bloque 4).

## Documentos

- `requirements.md` — requisitos trazables (`RESULT-*`).
- `tasks.md` — fases de implementación.

Sin `design.md` aparte: el diseño completo entra en este README porque el
bloque reutiliza casi todo lo que ya existe; no hay una arquitectura nueva
que documentar por separado, a diferencia del bloque 5.
