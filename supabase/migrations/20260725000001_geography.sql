-- Geografía: provincia (lista fija) + ciudad (libre) + radio opcional.
-- Reemplaza el esquema AMBA/Interior por provincias argentinas reales.
-- La provincia vive en `sites.state`; `sites.zone` la espeja para no romper el
-- código que agrupa "por zona". Idempotente: se puede re-ejecutar sin daño.

-- ---------------------------------------------------------------------------
-- 1. Base e radio de cobertura del instalador (para el matching por cercanía)
-- ---------------------------------------------------------------------------
alter table public.installers add column if not exists base_lat numeric;
alter table public.installers add column if not exists base_lng numeric;
alter table public.installers add column if not exists service_radius_km integer;

-- ---------------------------------------------------------------------------
-- 2. Backfill de provincias en sites (AMBA/Interior -> provincia real)
--    Ambas asignaciones leen los valores previos de la fila, así que es seguro.
-- ---------------------------------------------------------------------------
update public.sites
set
  state = case
    when upper(coalesce(zone, '')) like '%AMBA%' then 'Buenos Aires'
    when coalesce(zone, '') = 'Interior' then coalesce(nullif(trim(state), ''), 'Córdoba')
    else coalesce(nullif(trim(state), ''), nullif(trim(zone), ''), 'Buenos Aires')
  end,
  zone = case
    when upper(coalesce(zone, '')) like '%AMBA%' then 'Buenos Aires'
    when coalesce(zone, '') = 'Interior' then coalesce(nullif(trim(state), ''), 'Córdoba')
    else coalesce(nullif(trim(state), ''), nullif(trim(zone), ''), 'Buenos Aires')
  end;

-- ---------------------------------------------------------------------------
-- 3. Backfill de zonas de instalador (códigos legacy -> provincia)
-- ---------------------------------------------------------------------------
update public.installers i
set zones = mapped.zones
from (
  select
    i2.id,
    array_agg(distinct case
      when upper(z) like '%AMBA%' then 'Buenos Aires'
      when upper(z) like '%CBA%' or upper(z) like '%CORDOB%' then 'Córdoba'
      when z = 'Interior' then 'Córdoba'
      else z
    end) as zones
  from public.installers i2, unnest(
    case when cardinality(i2.zones) = 0 then array[null::text] else i2.zones end
  ) as z
  where z is not null
  group by i2.id
) mapped
where mapped.id = i.id and cardinality(i.zones) > 0;

-- ---------------------------------------------------------------------------
-- 4. Backfill de zona de búsquedas de bolsa
-- ---------------------------------------------------------------------------
update public.broadcasts
set zone = case
  when upper(coalesce(zone, '')) like '%AMBA%' then 'Buenos Aires'
  when coalesce(zone, '') = 'Interior' then 'Córdoba'
  else zone
end;

-- ---------------------------------------------------------------------------
-- 5. Recalcular projects.zones a partir de los sites ya normalizados
-- ---------------------------------------------------------------------------
update public.projects p
set zones = normalized.zones
from (
  select s.project_id, array_agg(distinct s.zone order by s.zone)::text[] as zones
  from public.sites s
  where nullif(trim(s.zone), '') is not null
  group by s.project_id
) normalized
where normalized.project_id = p.id;
