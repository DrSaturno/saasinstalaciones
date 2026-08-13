# Matriz actor × recurso × acción (R1-SPEC-02)

Estado: descriptivo — refleja lo implementado al 12-08-2026, no una propuesta.
Fuentes: policies RLS de `supabase/migrations/`, helpers de `lib/auth.ts` y
reglas de dominio de `lib/domain/order-rules.ts`.

Este documento existe porque las reglas estaban repartidas entre RLS, helpers y
dominio, sin ningún lugar donde leerlas juntas. Cuando el código y esta tabla no
coincidan, **manda el código**: la base es la fuente de verdad y esto es su
espejo.

## Los actores no son cuatro roles

`profiles.role` (`platform_admin` | `company_manager` | `installer`) define a qué
**área** entra la cuenta. Dentro del área installer, lo que puede hacer sale de
`company_membership_roles`, que es N:N: una misma persona puede tener
`installer` y `coordinator` **en la misma empresa**, y capacidades distintas en
empresas distintas.

De ahí que «dual» y «multiempresa» no sean roles extra: son combinaciones que el
modelo admite por diseño.

| Actor | Cómo se determina | Alcance |
|---|---|---|
| Admin de plataforma | `profiles.role = 'platform_admin'` | Toda la plataforma, vía `/api/master` con service_role |
| Gerente | `profiles.role = 'company_manager'` + `auth_company()` | Su empresa, si está `active` |
| Coordinador | capacidad `coordinator` en `company_membership_roles` | Los proyectos donde es `projects.coordinator_id` |
| Instalador | capacidad `installer` | Las órdenes donde es `assigned_installer_id` |
| Dual | ambas capacidades en la misma empresa | Unión de las dos, con la excepción de autoaprobación |
| Multiempresa | membresías activas en varias empresas | Unión por empresa; nunca cruza tenants |

**Una empresa suspendida anula todo.** `auth_company()`, `auth_companies()` y
`auth_has_company_role()` exigen `companies.status = 'active'`, así que suspender
una empresa deja sin acceso a sus miembros sin tocar sus membresías
(`20260805000001`).

## Órdenes de trabajo

Las transiciones las valida el trigger `validate_order_transition` y las espeja
`lib/domain/order-rules.ts`. Lo que sigue es la tabla de quién puede mover qué.

| Transición | Gerente | Coordinador del proyecto | Instalador asignado | Regla |
|---|---|---|---|---|
| `pendiente` → `relevamiento`/`planificada` | sí | sí | no | exige instalador asignado |
| cualquiera → `cancelada` | sí | sí | no | exento de exigir instalador |
| `relevamiento` → `planificada` | sí | sí | no | exige relevamiento registrado |
| → `planificada` | sí | sí | no | exige fecha comprometida |
| `planificada` → `en_proceso` | no | no | **sólo el asignado** | exige aceptación previa |
| `en_proceso` → `en_revision` | no | no | **sólo el asignado** | «enviar» es del que ejecuta |
| `en_revision` → `finalizada` | sí | sí | **no** | ADR-001: nadie aprueba lo propio |
| `en_revision` → `en_proceso` (reabrir) | sí | sí | **no** | ídem |

**La celda que importa** es la última fila para el actor dual: alguien que
coordina el proyecto *y* está asignado a la orden **no puede** aprobar ni reabrir
esa entrega, aunque su capacidad de coordinador lo habilitaría en general. Es
la única regla que mira la identidad del actor y no sólo su capacidad.
Implementada en los dos lados (`order-rules.ts` y `20260812000000`), con pgTAP.

## Recursos por actor

`—` significa que la fila no existe para ese actor: RLS no la devuelve.

| Recurso | Gerente | Coordinador | Instalador | Notas |
|---|---|---|---|---|
| `companies` | lee la suya | lee donde es miembro | lee donde es miembro | sólo si `active` |
| `projects` | CRUD en su empresa | lee/opera los que coordina | — | `can_operate_project()` |
| `sites` | CRUD en su empresa | los de sus proyectos | sólo los de sus órdenes | |
| `work_orders` | CRUD en su empresa | los de sus proyectos | sólo las asignadas | update acotado a progreso |
| `order_updates` | lee su empresa | lee sus proyectos | inserta en sus órdenes | |
| `order_incidents` | lee su empresa | lee sus proyectos | inserta en sus órdenes | |
| `company_installers` / `company_membership_roles` | lee su empresa; otorga y revoca | lee su empresa | lee lo propio | grant/revoke sólo por RPC |
| `locations` y asociadas | CRUD en su empresa | lee las de sus proyectos; propone cambios | lee las de sus órdenes | `can_read_location()` |
| `location_backfill_issues` | lee y resuelve | lee las de sus proyectos | — | cola de revisión del backfill |
| `chat_threads` / `chat_messages` | su empresa | su empresa | sólo su hilo | |
| `broadcasts` | CRUD en su empresa | los de sus proyectos | ve los que matchean su zona | excluye la empresa propia |
| `installer_global_*` (agenda personal) | — | — | **sólo su dueño** | privada por diseño; gerencia recibe códigos opacos |
| `feature_flags` | lee | lee | lee | escritura reservada a service_role |
| Storage `evidence` / `chat` | su empresa | sus proyectos | sus órdenes / su hilo | el path lleva el `company_id` |

## Comandos con reglas propias

| Comando | Quién | Qué impide |
|---|---|---|
| `grant_company_member_role` | gerente activo | tocarse los permisos a sí mismo |
| `revoke_company_member_role` | gerente activo | quitar la última capacidad; quitar `installer` con órdenes abiertas; quitar `coordinator` con proyectos activos |
| `accept_invitation` | cuenta del área installer | aceptar con otro email; empresa suspendida |
| `decide_survey_submission` | quien opera la actividad | aprobar el propio relevamiento (`SELF_APPROVAL_FORBIDDEN`) |
| `transitionOrder` | según la tabla de arriba | toda transición no listada |

## Lo que esta matriz no cubre todavía

- **R3 (actividades) está en la base pero no en la app.** `work_activities`,
  `work_assignments` y `survey_submissions` ya tienen policies, pero ninguna
  pantalla las usa: las órdenes se siguen operando por `work_orders`.
- **La cola de revisión del backfill no tiene UI** (R2-UI-03), aunque su RLS
  está definida y hay filas reales esperando en producción.
- **`company_installers.role` sigue existiendo** como proyección legacy de una
  sola función. Ya no la lee nada que autorice —el último uso, los tres triggers
  de aviso, se migró en `20260812000001`—, pero la columna no se eliminó.
