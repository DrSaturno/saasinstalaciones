-- Archivar proyectos en lugar de borrarlos o cancelarlos.
--
-- `archived_at` es ortogonal al estado: un proyecto archivado conserva si estaba
-- activo, pausado o terminado, así que no se pierde por qué dejó de trabajarse.
-- Nada se borra: el proyecto, sus locaciones y sus órdenes siguen existiendo y
-- se pueden consultar; simplemente salen del listado corriente.
--
-- No hace falta tocar RLS: las políticas de `projects` ya filtran por empresa y
-- esta columna no cambia quién puede ver la fila.
--
-- Idempotente: se puede re-ejecutar sin daño.

alter table public.projects
  add column if not exists archived_at timestamptz;

-- El listado por defecto pide los NO archivados, ordenados por fecha de alta.
create index if not exists projects_active_idx
  on public.projects (company_id, created_at desc)
  where archived_at is null;

comment on column public.projects.archived_at is
  'Fecha de archivado. NULL = proyecto corriente. Archivar reemplaza al borrado: no elimina locaciones ni órdenes.';
