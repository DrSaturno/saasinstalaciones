-- Fase 2 del plan de coordinador/instalador multi-empresa: las 22 policies (+
-- la función que 8 de ellas comparten) que hoy asumen que coordinar es
-- `profiles.role = 'coordinator'` y una única empresa en `profiles.company_id`.
--
-- FORMA DUAL, a propósito: cada policy queda como (rama vieja) OR (rama
-- nueva). La rama nueva sólo es cierta para quien ya es coordinador hoy, en
-- exactamente su empresa — el backfill de la Fase 1b
-- (20260728000012) le creó esa fila en `company_installers` con
-- `role = 'coordinator'`. Para los datos actuales, la OR no agrega ni una
-- fila: es una red de seguridad mientras las dos fuentes de verdad conviven,
-- no una ampliación de acceso. La rama vieja se retira recién en la Fase 6a,
-- cuando `profiles.role` deje de valer 'coordinator'.
--
-- Regla seguida en cada policy: el `with check` queda IDÉNTICO al `using`.
-- Varias de estas policies traían el `with check` más flojo que el `using`
-- (sin el chequeo de rol) — eso ya no se preserva: iba a colapsar en un
-- silencioso "no puedo guardar" en cuanto `auth_company()` empiece a ser NULL
-- para un coordinador (Fase 6a). Corregirlo ahora, mientras el chequeo viejo
-- sigue siendo cierto para todos, es gratis.
--
-- Idempotente: se puede re-ejecutar sin daño (drop policy if exists + create).

-- ---------------------------------------------------------------------------
-- 0. can_operate_project: la función que llaman 8 de estas policies.
-- ---------------------------------------------------------------------------
-- La rama del gerente no cambia. La del coordinador dejaba de ser válida en
-- cuanto dejara de ser cierto que TODOS sus proyectos están en su única
-- `auth_company()`: ahora valida la membresía de coordinador en la empresa
-- DUEÑA DEL PROYECTO puntual, sin importar cuántas otras empresas coordine o
-- en cuántas instale. Las dos condiciones (coordinator_id Y membresía) siguen
-- siendo obligatorias: sin la segunda, alguien descendido seguiría operando
-- los proyectos donde `coordinator_id` todavía lo apunta por una carrera o un
-- fix manual.
create or replace function public.can_operate_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        (public.auth_role() = 'company_manager' and p.company_id = public.auth_company())
        or (
          p.coordinator_id = auth.uid()
          and public.auth_has_company_role(p.company_id, 'coordinator')
        )
      )
  );
$$;
revoke all on function public.can_operate_project(uuid) from public;
grant execute on function public.can_operate_project(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Patrón B — coordinador simple (4): auth_role()='coordinator' and
-- company_id=auth_company()  →  se suma "o tiene membresía de coordinador ahí".
-- ---------------------------------------------------------------------------

drop policy if exists company_installers_coordinator_read on public.company_installers;
create policy company_installers_coordinator_read on public.company_installers
  for select using (
    (public.auth_role() = 'coordinator' and company_id = public.auth_company())
    or company_id in (select public.auth_companies('coordinator'))
  );

drop policy if exists invitations_coordinator_read on public.invitations;
create policy invitations_coordinator_read on public.invitations
  for select using (
    (public.auth_role() = 'coordinator' and company_id = public.auth_company())
    or company_id in (select public.auth_companies('coordinator'))
  );

drop policy if exists installer_weekly_coordinator_read on public.installer_weekly_availability;
create policy installer_weekly_coordinator_read on public.installer_weekly_availability
  for select using (
    (public.auth_role() = 'coordinator' and company_id = public.auth_company())
    or company_id in (select public.auth_companies('coordinator'))
  );

drop policy if exists installer_unavailability_coordinator_read on public.installer_unavailability;
create policy installer_unavailability_coordinator_read on public.installer_unavailability
  for select using (
    (public.auth_role() = 'coordinator' and company_id = public.auth_company())
    or company_id in (select public.auth_companies('coordinator'))
  );

-- ---------------------------------------------------------------------------
-- projects_coordinator_all — mismo patrón que B, pero define coordinator_id en
-- vez de depender de can_operate_project (sería circular: esta policy es una
-- de las fuentes que can_operate_project consulta).
-- ---------------------------------------------------------------------------
drop policy if exists projects_coordinator_all on public.projects;
create policy projects_coordinator_all on public.projects
  for all using (
    coordinator_id = auth.uid()
    and (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
  )
  with check (
    coordinator_id = auth.uid()
    and (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
  );

-- ---------------------------------------------------------------------------
-- Patrón C — coordinador + proyecto (8): mismo agregado que B, y además el
-- `with check` pasa a ser IDÉNTICO al `using` (antes venía sin el chequeo de
-- rol/empresa, sólo con can_operate_project).
-- ---------------------------------------------------------------------------

drop policy if exists sites_coordinator_all on public.sites;
create policy sites_coordinator_all on public.sites
  for all using (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and public.can_operate_project(project_id)
  )
  with check (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and public.can_operate_project(project_id)
  );

drop policy if exists work_orders_coordinator_all on public.work_orders;
create policy work_orders_coordinator_all on public.work_orders
  for all using (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and public.can_operate_project(project_id)
  )
  with check (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and public.can_operate_project(project_id)
  );

drop policy if exists order_updates_coordinator_all on public.order_updates;
create policy order_updates_coordinator_all on public.order_updates
  for all using (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  )
  with check (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  );

drop policy if exists broadcasts_coordinator_all on public.broadcasts;
create policy broadcasts_coordinator_all on public.broadcasts
  for all using (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and project_id is not null
    and public.can_operate_project(project_id)
  )
  with check (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and project_id is not null
    and public.can_operate_project(project_id)
  );

drop policy if exists site_attachments_coordinator_all on public.site_attachments;
create policy site_attachments_coordinator_all on public.site_attachments
  for all using (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and exists (
      select 1 from public.sites s
      where s.id = site_id and public.can_operate_project(s.project_id)
    )
  )
  with check (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and exists (
      select 1 from public.sites s
      where s.id = site_id and public.can_operate_project(s.project_id)
    )
  );

drop policy if exists order_attachments_coordinator_all on public.order_attachments;
create policy order_attachments_coordinator_all on public.order_attachments
  for all using (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  )
  with check (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  );

drop policy if exists order_incidents_coordinator_all on public.order_incidents;
create policy order_incidents_coordinator_all on public.order_incidents
  for all using (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  )
  with check (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  );

drop policy if exists ratings_coordinator_insert on public.ratings;
create policy ratings_coordinator_insert on public.ratings
  for insert with check (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id
        and w.status = 'finalizada'
        and public.can_operate_project(w.project_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Patrón D — gerente + coordinador (7): auth_role() in ('company_manager',
-- 'coordinator') and company_id=auth_company()  →  la rama del gerente no
-- cambia (sigue mono-empresa); se suma la del coordinador por membresía.
-- ---------------------------------------------------------------------------

drop policy if exists clients_company_operators_all on public.clients;
create policy clients_company_operators_all on public.clients
  for all using (
    (public.auth_role() = 'company_manager' and company_id = public.auth_company())
    or company_id in (select public.auth_companies('coordinator'))
  )
  with check (
    (public.auth_role() = 'company_manager' and company_id = public.auth_company())
    or company_id in (select public.auth_companies('coordinator'))
  );

drop policy if exists chat_threads_company_read on public.chat_threads;
create policy chat_threads_company_read on public.chat_threads
  for select using (
    (public.auth_role() = 'company_manager' and company_id = public.auth_company())
    or company_id in (select public.auth_companies('coordinator'))
  );

drop policy if exists chat_threads_company_insert on public.chat_threads;
create policy chat_threads_company_insert on public.chat_threads
  for insert with check (
    (public.auth_role() = 'company_manager' and company_id = public.auth_company())
    or company_id in (select public.auth_companies('coordinator'))
  );

drop policy if exists chat_messages_company_read on public.chat_messages;
create policy chat_messages_company_read on public.chat_messages
  for select using (
    (public.auth_role() = 'company_manager' and company_id = public.auth_company())
    or company_id in (select public.auth_companies('coordinator'))
  );

drop policy if exists chat_messages_company_insert on public.chat_messages;
create policy chat_messages_company_insert on public.chat_messages
  for insert with check (
    (
      (public.auth_role() = 'company_manager' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and sender_id = auth.uid()
  );

drop policy if exists announcements_company_all on public.announcements;
create policy announcements_company_all on public.announcements
  for all using (
    (public.auth_role() = 'company_manager' and company_id = public.auth_company())
    or company_id in (select public.auth_companies('coordinator'))
  )
  with check (
    (public.auth_role() = 'company_manager' and company_id = public.auth_company())
    or company_id in (select public.auth_companies('coordinator'))
  );

drop policy if exists installer_unavailability_manager_review on public.installer_unavailability;
create policy installer_unavailability_manager_review
  on public.installer_unavailability for update
  using (
    (public.auth_role() = 'company_manager' and company_id = public.auth_company())
    or company_id in (select public.auth_companies('coordinator'))
  )
  with check (
    (public.auth_role() = 'company_manager' and company_id = public.auth_company())
    or company_id in (select public.auth_companies('coordinator'))
  );

-- ---------------------------------------------------------------------------
-- Patrón E — casos especiales, no mecánicos (2; los otros dos del plan
-- —companies_member_read y broadcasts_installer_read— ya se resolvieron en la
-- Fase 1a, migración 20260728000011).
-- ---------------------------------------------------------------------------

-- profiles_company_operators_read: la traducción mecánica cambiaría el
-- conjunto de filas (post-cutover `company_id = auth_company()` sólo
-- devolvería gerentes). Se reemplaza por scope de roster, gemela de
-- `profiles_roster_read` (que ya existe, sin tocar). No lleva rama vieja como
-- OR: el uso del gerente (ver coordinadores de su empresa, ej. selector de
-- coordinador de un proyecto) ya quedó cubierto por `profiles_roster_read`
-- desde que la Fase 1b le creó al coordinador su fila en `company_installers`
-- — agregar la rama vieja acá sería redundante, no más segura.
drop policy if exists profiles_company_operators_read on public.profiles;
create policy profiles_company_operators_read on public.profiles
  for select using (
    id in (
      select ci.installer_id
      from public.company_installers ci
      where ci.company_id in (select public.auth_companies('coordinator'))
        and ci.status = 'active'
    )
  );

-- chat_reads_own_all: a diferencia del resto, acá SÍ hace falta preservar la
-- rama del gerente explícitamente (`auth_company()`) porque el gerente no
-- tiene fila en `company_installers` — no hay membresía que generalizar para
-- él. Se agrega la rama de membresía general (sin filtrar rol: cualquier
-- empresa donde la persona esté activa) al lado de las dos que ya había.
drop policy if exists chat_reads_own_all on public.chat_message_reads;
create policy chat_reads_own_all on public.chat_message_reads
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      company_id = public.auth_company()
      or company_id in (select public.auth_companies())
      or exists (
        select 1 from public.chat_messages m
        join public.chat_threads t on t.id = m.thread_id
        where m.id = message_id
          and t.company_id = chat_message_reads.company_id
          and t.installer_id = auth.uid()
      )
    )
  );
