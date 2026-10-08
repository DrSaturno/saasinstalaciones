# Bloque 5 — Varios instaladores por trabajo (hasta 15)

Pedido original (24-09-2026): GF Instalaciones a veces necesita más de un
instalador en el mismo trabajo, hasta 15. Ver
`../2026-09-24-hoja-de-ruta-v2/README.md` para el paquete completo.

## Por qué esta spec es más grande de lo que sugería la hoja de ruta

La hoja de ruta original estimaba el impacto contando referencias a
`assigned_installer_id` en código de aplicación (69, luego 112 con
migraciones/tests). La auditoría de esta spec (24-09-2026, agente de
exploración + lectura directa de `supabase/migrations/`) encontró algo más
específico y más grave: **43 migraciones distintas autorizan acceso
comparando esa columna directo contra `auth.uid()`**, sin pasar por el
sistema de agenda (`work_activities`/`work_assignments`) que ya existe desde
el punto 21. Ese sistema de agenda SÍ generaliza bien a varias personas (fue
diseñado por instalador, no por orden), pero **no es lo que hoy decide quién
puede ver o tocar una orden** — eso lo decide, en once lugares distintos,
`work_orders.assigned_installer_id = auth.uid()` o su equivalente.

Además, dos capacidades que el pedido implica **no existen hoy en absoluto**:

1. **Chat grupal.** `chat_threads` es un hilo por `(empresa, instalador)`, no
   por orden. No hay ningún concepto de conversación con varias personas a la
   vez.
2. **Plata por persona.** `work_orders.installer_amount`/`payment_status` son
   una columna por orden, no por instalador — mismo problema estructural que
   resolvió el bloque 8 con `work_order_pricing`, pero partiendo por
   instalador en vez de por rol.

## Decisiones tomadas con Nicolás (24-09-2026, además de las 8 de la hoja de ruta)

1. **Chat de equipo:** un hilo **grupal por orden**, no hilos 1:1 por
   integrante. Todos los del equipo activo + gerente/coordinador que opera el
   proyecto están en la misma conversación.
2. **Calificación post-obra:** sigue acreditándose **sólo al responsable**
   (el "lead") en esta primera versión. El resto del equipo no acumula
   reputación por esa orden todavía — evita inventar un criterio de reparto
   sin datos reales para calibrarlo.
3. **"Sin asignar" / incompleta:** cada orden declara un **mínimo de
   instaladores requeridos** (`required_installers`, 1 a 15, configurable por
   la empresa al crear/editar la orden). Aparece como incompleta en la bolsa
   de trabajo y en los KPIs hasta alcanzar ese mínimo, no apenas tiene un
   responsable.
4. **Alcance:** la versión completa. Cada uno de los hasta 15 con su propio
   monto, el mismo acceso operativo a la orden que hoy tiene el único
   asignado, y notificado de los eventos de la orden.

## Documentos

- `requirements.md` — requisitos trazables (`MULTIINST-*`), con la matriz de
  archivos afectados por categoría (control de acceso / dinero / escritura /
  sólo visualización) que dejó la auditoría.
- `design.md` — el diseño de dos capas (agenda vs. plantel), las tablas
  nuevas, los helpers de RLS que reemplazan la comparación directa, y el
  patrón de proyección que mantiene viva la columna legacy para todo lo que
  sólo necesita mostrar al responsable.
- `tasks.md` — fases de implementación, en el mismo orden que los bloques
  anteriores (pgTAP primero, migración a Demo, código, verificación,
  producción con autorización explícita).

## Fuera de alcance de esta spec (a propósito)

- Reputación/calificación individual por integrante (decisión 2 de arriba):
  queda para una iteración futura si el negocio lo pide con datos reales.
- Reparto automático de un monto total entre el equipo: cada integrante
  carga su propio monto: no hay una función que lo calcule solo.
- Convocatoria (bolsa de trabajo) pidiendo directamente un equipo completo:
  esta spec cubre completar el equipo de una orden ya creada; una convocatoria
  que reclute a los 15 de una sola vez es un pedido nuevo, no éste.
