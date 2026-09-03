-- Gap real destapado al construir la Fase 4 (agenda): `projects` sólo tiene
-- policies de lectura para el gerente y el coordinador (`projects_company_all`,
-- `projects_coordinator_all`). Un instalador simple, asignado a una orden de
-- ese proyecto, no tenía ninguna vía de RLS para leer la fila — el embed
-- `projects(name)` de PostgREST volvía `null` en su propia agenda, aunque ya
-- podía leer la orden, el punto y la actividad de ese mismo trabajo.
--
-- Mismo principio que `work_activities_authorized_read` / `auth_can_read_work_activity`:
-- quien tiene una asignación puede leer lo directamente relacionado a ella.
-- Acá el vínculo es aún más simple — no hace falta una función, `work_orders`
-- ya tiene `assigned_installer_id`.
create policy projects_installer_assigned_read
  on public.projects for select to authenticated
  using (
    exists (
      select 1 from public.work_orders w
      where w.project_id = projects.id
        and w.assigned_installer_id = auth.uid()
    )
  );
