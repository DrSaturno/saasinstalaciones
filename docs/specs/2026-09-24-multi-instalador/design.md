# Diseño — bloque 5 (multi-instalador)

## La decisión que reduce el riesgo real: aditivo, no reemplazo

El responsable (lead) de una orden **sigue siendo exactamente lo que es hoy**:
`work_orders.assigned_installer_id` / `installer_amount` / `payment_status`,
escrito por el mismo `assign_installer_gate` de siempre, sin tocar su firma
ni su comportamiento. Para el ~95% de las órdenes de hoy, que tienen un solo
instalador, **nada cambia**: cero riesgo de regresión en las 43 migraciones y
los ~30 archivos de aplicación que ya funcionan sobre esa columna.

Lo nuevo es aditivo: una tabla `work_order_team_members` que guarda de 0 a 14
**ayudantes** además del responsable. Las políticas RLS que hoy deciden acceso
comparando `assigned_installer_id = auth.uid()` se **extienden con un OR**
(`... OR auth_is_order_helper(order_id)`), nunca se reemplazan. Si no hay
ayudantes, el OR es siempre falso y el comportamiento es idéntico al de hoy.

Se evaluó la alternativa de mover TODO (incluido el responsable) a una tabla
de plantel única, con el responsable como una fila más. Se descartó: exige
reescribir las 43 políticas de una sola vez, sin poder aislar el cambio
detrás de una condición que empieza en `false`, y el radio de una migración
mal escrita sería toda orden del sistema, no sólo las que tienen equipo.

## Esquema nuevo

```sql
create table public.work_order_team_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  order_id uuid not null,
  installer_id uuid not null references public.installers (id) on delete restrict,
  installer_amount numeric(14, 2)
    check (installer_amount is null or installer_amount >= 0),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid')),
  payment_status_changed_at timestamptz,
  payment_status_changed_by uuid references public.profiles (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'removed')),
  added_by uuid references public.profiles (id) on delete set null,
  removed_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_order_team_members_order_company_fk
    foreign key (order_id, company_id)
    references public.work_orders (id, company_id) on delete cascade,
  constraint work_order_team_members_id_company_key unique (id, company_id)
);

create unique index work_order_team_members_active_idx
  on public.work_order_team_members (order_id, installer_id)
  where status = 'active';
```

Un ayudante también reserva una fila en `work_assignments` para la MISMA
actividad de ejecución, con su propio `installer_id` — la restricción de
exclusión GiST (`work_assignments_no_overlap`) ya está indexada por
`installer_id`, así que agregar una segunda persona a la misma actividad no
choca contra ella: cada quien se choca sólo consigo mismo. El único cambio de
esquema que necesita `work_assignments` es relajar el índice único que hoy
fuerza una sola fila vigente **por actividad**:

```sql
drop index public.work_assignments_one_current_idx;
create unique index work_assignments_one_current_idx
  on public.work_assignments (activity_id, installer_id)
  where status in ('offered', 'active', 'accepted');
```

(el nombre se conserva a propósito: todo el código que lo referencia por
nombre en mensajes de error de Postgres sigue siendo válido).

## El gate para ayudantes

`assign_installer_gate` **no cambia**: sigue siendo la única puerta para
`assigned_installer_id` (el responsable), reemplaza a quien esté antes tal
como hoy. Si el responsable anterior tenía además una fila de ayudante (caso
raro, alguien que pasa de responsable a ayudante), esa fila se conserva —
nunca se lo saca del plantel por dejar de ser responsable, sólo se le puede
sacar con `remove_order_team_member`.

Nueva función `add_order_team_member`, calco de `assign_installer_gate` en
los chequeos (misma elegibilidad, mismo bloqueo duro de ausencia y
solapamiento, mismo override de traslado con motivo, mismo
`pg_advisory_xact_lock(hashtext(installer_id::text))` para que dos empresas
asignando a la misma persona no ganen las dos) pero que **agrega** en vez de
reemplazar:

```
add_order_team_member(p_order_id, p_installer_id, p_operation_id, p_override_reason default null)
  → misma resolución de actividad de ejecución que assign_installer_gate
  → si p_installer_id ya es el responsable: error TEAM_ALREADY_LEAD
  → si el plantel activo (responsable + ayudantes) ya tiene 15: error TEAM_FULL
  → mismos chequeos de elegibilidad/ausencia/solapamiento/traslado, sólo sobre
    p_installer_id (cada quien se valida contra su propia agenda)
  → si available: inserta en work_assignments (activity_id, installer_id nuevo,
    status 'active', mismo horario de la actividad) e inserta en
    work_order_team_members (status 'active')
  → mismo asiento en assignment_command_receipts para idempotencia por operation_id
```

`remove_order_team_member(p_order_id, p_installer_id)` — sin gate, igual que
desasignar hoy: marca `work_order_team_members.status = 'removed'` y la fila
de `work_assignments` correspondiente `status = 'cancelled'`. No permite
quitar al responsable (usar `assignInstaller(orderId, null)` o reasignar).

Tope de 15 y "no sos vos mismo dos veces" se verifican dentro de la función
bajo el mismo advisory lock (por orden, `hashtext(p_order_id::text)`, además
del lock por instalador) para que dos altas concurrentes no pasen las dos el
cheque de cupo.

## Acceso: extender, no reemplazar

Cada política que hoy compara `assigned_installer_id = auth.uid()` para
ACCESO (no para mostrar un nombre) se reescribe como
`(assigned_installer_id = auth.uid() or public.auth_is_order_helper(id)) and …`.
Lista a tocar en la migración (confirmar contra el código vigente al
implementar, por si algo cambió):

- `work_orders_installer_read`, `work_orders_installer_progress`
  (`20260805000001_company_suspension_enforcement.sql`).
- La policy de lectura de instalador sobre `order_incidents` (mismo patrón,
  ubicar por nombre al implementar).
- `order_payment_events_installer_read` — además de agregar el OR, gana
  alcance por persona (ver "Dinero" abajo).

`auth_is_order_helper(p_order_id)`:

```sql
create or replace function public.auth_is_order_helper(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.work_order_team_members m
    where m.order_id = p_order_id
      and m.installer_id = auth.uid()
      and m.status = 'active'
  )
$$;
```

## Reglas de transición (mirror TS/DB)

`validate_order_transition` (trigger DB) y `orderTransitionBlock` (TS, mismo
archivo) cambian el criterio "actor es el responsable" por "actor es el
responsable O un ayudante activo". En TS, `OrderRuleContext` gana
`helperInstallerIds: string[]` (vacío en el caso común), y las tres
comparaciones (`onlyInstallerStarts`, `onlyInstallerReviews`,
`noSelfApproval`) revisan las dos listas. `needsInstaller` no cambia: sigue
exigiendo un responsable, tener sólo ayudantes no alcanza (MULTIINST-R1.3/R6.2).

## Dinero

`work_order_team_members.installer_amount`/`payment_status` son del
ayudante, independientes de `work_orders.installer_amount` (el del
responsable). Nuevas funciones, mismo patrón que
`set_order_payment_status`:

- `set_team_member_amount(p_order_id, p_installer_id, p_amount)`.
- `set_team_member_payment_status(p_order_id, p_installer_id, p_status, p_note)`.

`order_payment_events` gana `installer_id uuid references installers(id)`
nullable: `null` sigue significando "evento del responsable" (flujo actual,
sin tocar `set_order_payment_status`); no nulo es un evento de ese ayudante.
Backfill: filas existentes quedan en `null` (representan al único instalador
que había, que era el responsable). RLS de lectura del instalador pasa a
`(installer_id is null and assigned_installer_id = auth.uid()) or installer_id = auth.uid()`.

`installer_earnings` (vista) gana una segunda mitad con `union all`: la
consulta actual sobre `work_orders` (responsable, sin tocar) más una nueva
sobre `work_order_team_members` con el monto/estado del ayudante. Sigue
`security_invoker`; cada mitad se filtra sola por la RLS de su tabla base.

`/finance` (`lib/data/finance.ts`) y el tablero (`lib/data/dashboard.ts`)
suman `work_order_team_members.installer_amount` de los ayudantes activos al
costo de instalador por orden, además de `work_orders.installer_amount`.

## Chat grupal (sólo cuando hay equipo)

Una orden sin ayudantes sigue usando el hilo 1:1 (`chat_threads`) que ya
existe con el responsable — no se toca. Cuando una orden tiene al menos un
ayudante activo, gana un hilo grupal propio (tablas nuevas, a definir en
detalle en la migración de Fase 1 siguiendo el mismo patrón de RLS que
`chat_threads`/sus mensajes: participan el responsable, los ayudantes activos,
y el gerente/coordinador que opera la orden). No reemplaza los hilos 1:1
existentes, que siguen sirviendo para hablar con una persona a través de
todas sus órdenes.

## Notificaciones y push

`requestPushDelivery`/las Server Actions que hoy notifican sólo al
responsable pasan a iterar también sobre los ayudantes activos. La Edge
Function `send-event-push` extiende su chequeo de autorización con el mismo
criterio que las policies: responsable O ayudante activo de esa orden.

## Completitud ("sin asignar")

`work_orders` gana `required_installers smallint not null default 1
check (required_installers between 1 and 15)`. Una orden es "incompleta" si
no tiene responsable, o si `1 + ayudantes activos < required_installers`. Los
lugares que hoy usan `.is("assigned_installer_id", null)` para "sin asignar"
(`lib/data/broadcasts.ts`, `lib/data/coordination-home.ts`) pasan a este
criterio.

## Calificación — sin cambios (decisión explícita)

`lib/actions/ratings.ts` sigue acreditando sólo a `assigned_installer_id`.
No se toca.

## Lo que NO cambia y por qué importa decirlo

`work_assignments_no_overlap` (exclusión GiST), `installer_overlapping_assignments`,
`installer_absence_blocks`, `installer_travel_feasibility` — las cuatro ya
estaban escritas por instalador, no por actividad ni por orden. Se reutilizan
tal cual, sin ninguna modificación, para cada ayudante que se agrega. Es la
razón de fondo por la que este bloque es más chico de lo que el radio de
archivos tocados sugiere: el motor de conflictos de agenda (punto 21) ya
estaba diseñado para esto.
