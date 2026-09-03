-- Gap real destapado al construir la Fase 4 (agenda): `projects` sólo tiene
-- policies de lectura para el gerente y el coordinador. Un instalador simple,
-- asignado a una orden de ese proyecto, no tenía ninguna vía para leer su
-- nombre — el embed `projects(name)` de PostgREST volvía `null` en su propia
-- agenda, aunque ya podía leer la orden, el punto y la actividad de ese
-- mismo trabajo.
--
-- **Por qué una función y no una policy sobre toda la fila.** Primer intento:
-- agregar una policy de SELECT amplia sobre `projects`. Rota en CI: el
-- endpoint de exportación de locaciones (`app/api/projects/[id]/sites/export`)
-- confía en RLS de `projects` como ÚNICO control de acceso — "si puede leer
-- el proyecto, puede exportar sus locaciones" (comentario explícito en ese
-- archivo). Una policy amplia le habría dado a un instalador con UNA orden
-- en un proyecto de miles de puntos acceso a exportar el proyecto entero:
-- exactamente la elevación de privilegio que ese endpoint asume que RLS
-- nunca permite. Acá el alcance es mínimo a propósito: sólo el `id`/`name`
-- de los proyectos donde el propio llamador tiene una asignación, nada más.
create or replace function public.project_names_for_installer(p_installer_id uuid)
returns table (id uuid, name text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct p.id, p.name
  from public.projects p
  join public.work_orders w on w.project_id = p.id
  where w.assigned_installer_id = p_installer_id
    and p_installer_id = auth.uid();
$$;

revoke all on function public.project_names_for_installer(uuid) from public;
grant execute on function public.project_names_for_installer(uuid) to authenticated;
