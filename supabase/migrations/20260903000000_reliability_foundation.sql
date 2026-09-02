-- Fase 0 de confiabilidad, cancelaciones y reprogramaciones (bloque R6).
--
-- Este archivo NO cambia ningún comportamiento todavía: crea las tres tablas
-- sobre las que se apoyan las fases siguientes y el calendario de días no
-- laborables que hasta ahora `lib/domain/business-days.ts` aceptaba pero nadie
-- llenaba.
--
-- La decisión que ordena todo el diseño (ADR-009): **el plazo no corre hasta
-- que la notificación quedó persistida.** Por eso `notified_at` es nullable y
-- separado de `created_at`, y por eso no existe ninguna columna "vencido": el
-- vencimiento se deriva al leer, desde `notified_at` + calendario. Si el job de
-- recordatorios no corre, corre tarde o corre dos veces, el estado sigue siendo
-- correcto. Nadie queda penalizado por una falla de infraestructura, que es
-- justamente lo que el requisito prohíbe.

-- ---------------------------------------------------------------------------
-- Calendario de días no laborables
--
-- `company_id` nulo = feriado nacional, compartido por todas las empresas del
-- país. Con valor = un día que ESA empresa no trabaja (puente por decreto,
-- feriado provincial, cierre propio). Un feriado nacional duplicado por
-- empresa sería el modelo equivocado: son el mismo hecho.
-- ---------------------------------------------------------------------------

create table if not exists public.non_working_days (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  country text not null check (country in ('AR', 'BR')),
  day date not null,
  name text not null default '',
  created_at timestamptz not null default now()
);

-- Un feriado nacional por país y fecha; un día propio por empresa y fecha.
create unique index if not exists non_working_days_national_key
  on public.non_working_days (country, day)
  where company_id is null;

create unique index if not exists non_working_days_company_key
  on public.non_working_days (company_id, day)
  where company_id is not null;

create index if not exists non_working_days_lookup_idx
  on public.non_working_days (country, day);

alter table public.non_working_days enable row level security;

-- Todo el mundo autenticado lee los nacionales; los propios, sólo su empresa.
-- El calendario tiene que ser legible por el instalador: es lo que explica por
-- qué su plazo vence cuando vence.
drop policy if exists non_working_days_read on public.non_working_days;
create policy non_working_days_read on public.non_working_days
  for select
  to authenticated
  using (
    company_id is null
    or company_id in (select public.auth_companies())
  );

-- Sólo el gerente edita los días de su empresa. Los nacionales no se tocan
-- desde la aplicación: no hay política de escritura que los alcance.
--
-- El gerente NO se resuelve con `auth_companies`/`auth_has_company_role`:
-- `company_membership_roles.role` sólo admite 'installer' y 'coordinator', así
-- que preguntar ahí por 'company_manager' no matchea nunca y la política
-- quedaría muerta. La pertenencia del gerente vive en su perfil, que es lo que
-- leen `auth_role()` y `auth_company()` — el mismo par que usa
-- `work_orders_company_all`.
drop policy if exists non_working_days_manager_write on public.non_working_days;
create policy non_working_days_manager_write on public.non_working_days
  for all
  to authenticated
  using (
    company_id is not null
    and public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  )
  with check (
    company_id is not null
    and public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

-- ---------------------------------------------------------------------------
-- Reprogramaciones
--
-- Una fila por reprogramación, no un contador. `work_orders.reschedule_count`
-- ya existía y sigue sirviendo para el tablero, pero un número no puede decir
-- cuándo se avisó ni qué contestó el instalador.
-- ---------------------------------------------------------------------------

create table if not exists public.order_reschedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  order_id uuid not null references public.work_orders (id) on delete cascade,
  -- Puede ser nulo: se puede reprogramar una orden todavía sin asignar, y ahí
  -- no hay a quién preguntarle nada.
  installer_id uuid references public.installers (id) on delete set null,

  previous_date date,
  previous_end_date date,
  new_date date not null,
  new_end_date date,
  reason text not null default '',

  rescheduled_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  -- La compuerta. Nulo = se cambió la fecha pero el instalador todavía no fue
  -- notificado, así que su plazo ni siquiera empezó.
  notified_at timestamptz,

  -- Calendario con el que se calcula el vencimiento, congelado al notificar
  -- (ADR-009: "calendario, zona horaria y feriados usados quedan versionados
  -- junto al deadline"). Si mañana se corrige un feriado, un plazo ya
  -- comunicado no se recalcula por atrás.
  calendar_country text not null check (calendar_country in ('AR', 'BR')),
  calendar_timezone text not null default 'America/Argentina/Buenos_Aires',
  response_window_days smallint not null default 2
    check (response_window_days between 1 and 30),

  response text check (response in ('accepted', 'declined')),
  responded_at timestamptz,
  reminder_sent_at timestamptz,

  -- Si la empresa vuelve a mover la fecha antes de que el instalador conteste,
  -- la pregunta anterior deja de tener sentido. No se borra: se marca, para
  -- que el historial muestre que hubo dos movimientos.
  superseded_at timestamptz,

  constraint order_reschedules_response_pair check (
    (response is null) = (responded_at is null)
  ),
  -- No se puede haber respondido algo que nunca se notificó.
  constraint order_reschedules_response_needs_notice check (
    responded_at is null or notified_at is not null
  ),
  constraint order_reschedules_end_after_start check (
    new_end_date is null or new_end_date >= new_date
  )
);

-- Una sola pregunta abierta por orden.
create unique index if not exists order_reschedules_one_open
  on public.order_reschedules (order_id)
  where response is null and superseded_at is null;

create index if not exists order_reschedules_order_idx
  on public.order_reschedules (order_id, created_at desc);

-- Para el job de recordatorios: los que ya se notificaron y siguen sin
-- respuesta son los únicos que hay que mirar.
create index if not exists order_reschedules_awaiting_idx
  on public.order_reschedules (notified_at)
  where response is null and superseded_at is null and notified_at is not null;

alter table public.order_reschedules enable row level security;

drop policy if exists order_reschedules_company_all on public.order_reschedules;
create policy order_reschedules_company_all on public.order_reschedules
  for all
  to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

drop policy if exists order_reschedules_coordinator_all on public.order_reschedules;
create policy order_reschedules_coordinator_all on public.order_reschedules
  for all
  to authenticated
  using (
    company_id in (select public.auth_companies('coordinator'))
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  )
  with check (
    company_id in (select public.auth_companies('coordinator'))
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  );

-- El instalador lee las suyas: es la notificación misma, y el plazo que corre.
drop policy if exists order_reschedules_installer_read on public.order_reschedules;
create policy order_reschedules_installer_read on public.order_reschedules
  for select
  to authenticated
  using (installer_id = auth.uid() and public.company_is_active(company_id));

-- Y contesta. La escritura queda acotada en la Fase 2 por una función que
-- valida el plazo; la política sólo garantiza que nadie conteste por otro.
drop policy if exists order_reschedules_installer_respond on public.order_reschedules;
create policy order_reschedules_installer_respond on public.order_reschedules
  for update
  to authenticated
  using (
    installer_id = auth.uid()
    and public.company_is_active(company_id)
    and notified_at is not null
    and superseded_at is null
  )
  with check (
    installer_id = auth.uid()
    and public.company_is_active(company_id)
    and notified_at is not null
    and superseded_at is null
  );

-- ---------------------------------------------------------------------------
-- Pedidos de baja del instalador
--
-- Hoy el instalador no puede cancelar: `cancelada` sólo la alcanzan gerente y
-- coordinador. Esta tabla es el pedido, no la cancelación — la orden se
-- cancela recién cuando el pedido se aprueba (Fase 3).
-- ---------------------------------------------------------------------------

create table if not exists public.order_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  order_id uuid not null references public.work_orders (id) on delete cascade,
  installer_id uuid not null references public.installers (id) on delete cascade,

  reason_code text not null check (reason_code in (
    'personal_emergency',
    'health',
    'work_conditions',
    'schedule_conflict',
    'other'
  )),
  reason_note text not null default '',

  -- Foto del momento del pedido. Si la empresa reprograma después, no puede
  -- reescribir hacia atrás si esta baja se pidió en plazo o fuera de plazo.
  scheduled_date_at_request date,
  requested_at timestamptz not null default now(),
  -- Calculado al insertar con el calendario vigente y guardado. Derivarlo
  -- después daría otro resultado en cuanto cambie un feriado.
  within_notice boolean not null,
  calendar_country text not null check (calendar_country in ('AR', 'BR')),

  -- `auto_approved`: pedida dentro del plazo. El requisito es explícito en que
  -- estas no afectan la confiabilidad, así que no van a revisión humana.
  -- La revisión existe para las de fuera de plazo que alegan una excepción.
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'rejected', 'auto_approved'
  )),
  -- Nulo mientras está pendiente. La decisión de si la excepción era válida es
  -- lo que después determina si el evento penaliza o no.
  justified boolean,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '',

  constraint order_cancellation_review_pair check (
    status in ('pending', 'auto_approved') or reviewed_at is not null
  )
);

-- Un solo pedido abierto por orden.
create unique index if not exists order_cancellation_one_open
  on public.order_cancellation_requests (order_id)
  where status = 'pending';

create index if not exists order_cancellation_order_idx
  on public.order_cancellation_requests (order_id, requested_at desc);

create index if not exists order_cancellation_pending_idx
  on public.order_cancellation_requests (company_id, status)
  where status = 'pending';

alter table public.order_cancellation_requests enable row level security;

-- Revisión sólo del gerente: es la decisión que impacta la confiabilidad de
-- una persona. El coordinador ve, no resuelve.
drop policy if exists order_cancellation_manager_all on public.order_cancellation_requests;
create policy order_cancellation_manager_all on public.order_cancellation_requests
  for all
  to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

drop policy if exists order_cancellation_coordinator_read on public.order_cancellation_requests;
create policy order_cancellation_coordinator_read on public.order_cancellation_requests
  for select
  to authenticated
  using (
    company_id in (select public.auth_companies('coordinator'))
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  );

drop policy if exists order_cancellation_installer_read on public.order_cancellation_requests;
create policy order_cancellation_installer_read on public.order_cancellation_requests
  for select
  to authenticated
  using (installer_id = auth.uid() and public.company_is_active(company_id));

-- El instalador crea su propio pedido y nada más: no se asigna el estado ni
-- se autoaprueba. `within_notice` lo calcula la función de la Fase 3; acá la
-- política sólo impide pedir la baja en nombre de otro o de una orden ajena.
drop policy if exists order_cancellation_installer_request on public.order_cancellation_requests;
create policy order_cancellation_installer_request on public.order_cancellation_requests
  for insert
  to authenticated
  with check (
    installer_id = auth.uid()
    and public.company_is_active(company_id)
    and status = 'pending'
    and reviewed_at is null
    and justified is null
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id
        and w.company_id = company_id
        and w.assigned_installer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Feriados nacionales 2026-2027
--
-- Fijos por ley, más los movibles calculados desde la Pascua (Carnaval,
-- Viernes Santo, Corpus Christi) y los trasladables argentinos ya movidos
-- según la Ley 27.399 art. 7 (martes/miércoles al lunes anterior;
-- jueves/viernes al lunes siguiente):
--   * 20/11/2026 cae viernes  -> 23/11/2026
--   * 17/08/2027 cae martes   -> 16/08/2027
--   * 12/10/2027 cae martes   -> 11/10/2027
--
-- NO están los "días no laborables con fines turísticos" (los puentes): los
-- fija un decreto distinto cada año y cambian. Para eso está `company_id`:
-- cada empresa carga los suyos. Un puente faltante alarga el plazo del
-- instalador, nunca lo acorta, así que el error queda del lado indulgente.
--
-- Carnaval en Brasil es punto facultativo, no feriado nacional por ley, pero
-- en la práctica no se trabaja: contarlo como no laborable es lo realista y
-- además el lado seguro.
-- ---------------------------------------------------------------------------

insert into public.non_working_days (company_id, country, day, name) values
  -- Argentina 2026
  (null, 'AR', '2026-01-01', 'Año Nuevo'),
  (null, 'AR', '2026-02-16', 'Carnaval'),
  (null, 'AR', '2026-02-17', 'Carnaval'),
  (null, 'AR', '2026-03-24', 'Día de la Memoria'),
  (null, 'AR', '2026-04-02', 'Día del Veterano y de los Caídos en Malvinas'),
  (null, 'AR', '2026-04-03', 'Viernes Santo'),
  (null, 'AR', '2026-05-01', 'Día del Trabajador'),
  (null, 'AR', '2026-05-25', 'Día de la Revolución de Mayo'),
  (null, 'AR', '2026-06-20', 'Paso a la Inmortalidad del General Belgrano'),
  (null, 'AR', '2026-07-09', 'Día de la Independencia'),
  (null, 'AR', '2026-08-17', 'Paso a la Inmortalidad del General San Martín'),
  (null, 'AR', '2026-10-12', 'Día del Respeto a la Diversidad Cultural'),
  (null, 'AR', '2026-11-23', 'Día de la Soberanía Nacional'),
  (null, 'AR', '2026-12-08', 'Inmaculada Concepción de María'),
  (null, 'AR', '2026-12-25', 'Navidad'),
  -- Argentina 2027
  (null, 'AR', '2027-01-01', 'Año Nuevo'),
  (null, 'AR', '2027-02-08', 'Carnaval'),
  (null, 'AR', '2027-02-09', 'Carnaval'),
  (null, 'AR', '2027-03-24', 'Día de la Memoria'),
  (null, 'AR', '2027-03-26', 'Viernes Santo'),
  (null, 'AR', '2027-04-02', 'Día del Veterano y de los Caídos en Malvinas'),
  (null, 'AR', '2027-05-01', 'Día del Trabajador'),
  (null, 'AR', '2027-05-25', 'Día de la Revolución de Mayo'),
  (null, 'AR', '2027-06-20', 'Paso a la Inmortalidad del General Belgrano'),
  (null, 'AR', '2027-07-09', 'Día de la Independencia'),
  (null, 'AR', '2027-08-16', 'Paso a la Inmortalidad del General San Martín'),
  (null, 'AR', '2027-10-11', 'Día del Respeto a la Diversidad Cultural'),
  (null, 'AR', '2027-11-20', 'Día de la Soberanía Nacional'),
  (null, 'AR', '2027-12-08', 'Inmaculada Concepción de María'),
  (null, 'AR', '2027-12-25', 'Navidad'),
  -- Brasil 2026
  (null, 'BR', '2026-01-01', 'Confraternização Universal'),
  (null, 'BR', '2026-02-16', 'Carnaval'),
  (null, 'BR', '2026-02-17', 'Carnaval'),
  (null, 'BR', '2026-04-03', 'Sexta-feira Santa'),
  (null, 'BR', '2026-04-21', 'Tiradentes'),
  (null, 'BR', '2026-05-01', 'Dia do Trabalho'),
  (null, 'BR', '2026-06-04', 'Corpus Christi'),
  (null, 'BR', '2026-09-07', 'Independência do Brasil'),
  (null, 'BR', '2026-10-12', 'Nossa Senhora Aparecida'),
  (null, 'BR', '2026-11-02', 'Finados'),
  (null, 'BR', '2026-11-15', 'Proclamação da República'),
  (null, 'BR', '2026-11-20', 'Dia da Consciência Negra'),
  (null, 'BR', '2026-12-25', 'Natal'),
  -- Brasil 2027
  (null, 'BR', '2027-01-01', 'Confraternização Universal'),
  (null, 'BR', '2027-02-08', 'Carnaval'),
  (null, 'BR', '2027-02-09', 'Carnaval'),
  (null, 'BR', '2027-03-26', 'Sexta-feira Santa'),
  (null, 'BR', '2027-04-21', 'Tiradentes'),
  (null, 'BR', '2027-05-01', 'Dia do Trabalho'),
  (null, 'BR', '2027-05-27', 'Corpus Christi'),
  (null, 'BR', '2027-09-07', 'Independência do Brasil'),
  (null, 'BR', '2027-10-12', 'Nossa Senhora Aparecida'),
  (null, 'BR', '2027-11-02', 'Finados'),
  (null, 'BR', '2027-11-15', 'Proclamação da República'),
  (null, 'BR', '2027-11-20', 'Dia da Consciência Negra'),
  (null, 'BR', '2027-12-25', 'Natal')
on conflict do nothing;
