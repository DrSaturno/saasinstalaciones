-- La conexión de Google Calendar pasa a ser de la EMPRESA, no de la persona.
--
-- Antes: `unique (user_id)` y una RLS que exigía `user_id = auth.uid()`. Con
-- dos gerentes en la misma empresa, cada uno podía conectar su Google y
-- quedaban dos calendarios con las mismas órdenes duplicadas — y ninguno veía
-- el del otro, porque la RLS se lo ocultaba. Nadie hacía nada mal y el
-- resultado era incoherente igual.
--
-- Si el calendario es de la empresa (DEC-GCAL-01), la conexión también.
-- Ver docs/specs/2026-09-09-google-calendar/ (DEC-GCAL-06, GCAL-R1.7).

-- Si ya hubiera más de una conexión por empresa, sobrevive la más reciente.
-- Hoy no hay ninguna (la integración nunca estuvo configurada), pero borrar a
-- ciegas sería peor que ordenar de forma explícita.
delete from public.calendar_connections c
where exists (
  select 1
  from public.calendar_connections otra
  where otra.company_id = c.company_id
    and (otra.connected_at, otra.id) > (c.connected_at, c.id)
);

alter table public.calendar_connections
  drop constraint if exists calendar_connections_user_key;

alter table public.calendar_connections
  add constraint calendar_connections_company_key unique (company_id);

-- `user_id` se conserva: dice QUIÉN conectó, que es información útil para
-- mostrar en el tablero. Lo que deja de hacer es controlar el acceso.
comment on column public.calendar_connections.user_id is
  'Quién conectó la cuenta. Informativo: el acceso se resuelve por company_id.';

drop policy if exists calendar_connections_own_all on public.calendar_connections;

create policy calendar_connections_company_all on public.calendar_connections
  for all
  using (
    company_id = public.auth_company()
    and public.auth_role() = 'company_manager'
  )
  with check (
    company_id = public.auth_company()
    and public.auth_role() = 'company_manager'
  );

drop policy if exists calendar_order_events_own_all on public.calendar_order_events;

create policy calendar_order_events_company_all on public.calendar_order_events
  for all
  using (
    company_id = public.auth_company()
    and public.auth_role() = 'company_manager'
  )
  with check (
    company_id = public.auth_company()
    and public.auth_role() = 'company_manager'
  );
