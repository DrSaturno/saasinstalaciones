-- Matching geográfico de la bolsa de trabajo.
--
-- Reglas: una búsqueda se le muestra al instalador que (a) cubre la provincia
-- del trabajo, (b) está dentro de su radio declarado si hay coordenadas de
-- ambos lados, y (c) NO forma ya parte del equipo activo de esa empresa —la
-- bolsa existe para conseguir gente nueva, a los propios se les asigna directo.
-- Quien ya se postuló conserva el acceso aunque la búsqueda se cierre.
-- Idempotente.

alter table public.broadcasts add column if not exists lat numeric;
alter table public.broadcasts add column if not exists lng numeric;

/** Distancia en km entre dos puntos (haversine). Espeja lib/domain/geography.ts. */
create or replace function public.distance_km(
  p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then null
    else 2 * 6371 * asin(least(1, sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2)
      + cos(radians(p_lat1)) * cos(radians(p_lat2))
        * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
    )))
  end
$$;

/**
 * ¿La búsqueda le corresponde geográficamente al instalador que consulta?
 *
 * Se usa tanto para ver la búsqueda como para poder postularse, así que la regla
 * vive en un solo lugar.
 */
create or replace function public.broadcast_matches_installer(p_broadcast_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.broadcasts b
    join public.installers i on i.id = auth.uid()
    where b.id = p_broadcast_id
      and b.status = 'open'
      -- (a) cubre la provincia
      and b.zone = any(i.zones)
      -- (b) dentro del radio, si hay datos de ambos lados
      and (
        i.service_radius_km is null
        or public.distance_km(i.base_lat, i.base_lng, b.lat, b.lng) is null
        or public.distance_km(i.base_lat, i.base_lng, b.lat, b.lng) <= i.service_radius_km
      )
      -- (c) todavía no es del equipo de esa empresa
      and not exists (
        select 1 from public.company_installers ci
        where ci.company_id = b.company_id
          and ci.installer_id = auth.uid()
          and ci.status = 'active'
      )
  )
$$;
revoke all on function public.broadcast_matches_installer(uuid) from public;
grant execute on function public.broadcast_matches_installer(uuid) to authenticated;

-- Ver la búsqueda: por matching, o porque ya se postuló (histórico).
create or replace function public.installer_can_read_broadcast(p_broadcast_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.broadcast_matches_installer(p_broadcast_id)
    or exists (
      select 1 from public.broadcast_applications ba
      where ba.broadcast_id = p_broadcast_id and ba.installer_id = auth.uid()
    )
$$;

-- Postularse: exige el matching completo (no alcanza conocer el UUID).
drop policy if exists broadcast_apps_installer_insert on public.broadcast_applications;
create policy broadcast_apps_installer_insert on public.broadcast_applications
  for insert with check (
    installer_id = auth.uid()
    and public.broadcast_matches_installer(broadcast_id)
  );

-- Las notificaciones de nueva búsqueda siguen la misma regla: no avisarle a
-- quien ya es del equipo ni a quien queda fuera de su radio.
create or replace function public.notify_new_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, data)
  select
    i.id,
    'broadcast_new',
    case when p.locale = 'pt' then 'Novo trabalho na sua região' else 'Nuevo trabajo en tu zona' end,
    new.title,
    jsonb_build_object(
      'url', '/jobs',
      'broadcast_id', new.id,
      'company_id', new.company_id,
      'zone', new.zone,
      'locale', p.locale
    )
  from public.installers i
  join public.profiles p on p.id = i.id
  where i.available
    and new.zone = any(i.zones)
    and (
      i.service_radius_km is null
      or public.distance_km(i.base_lat, i.base_lng, new.lat, new.lng) is null
      or public.distance_km(i.base_lat, i.base_lng, new.lat, new.lng) <= i.service_radius_km
    )
    and not exists (
      select 1 from public.company_installers ci
      where ci.company_id = new.company_id
        and ci.installer_id = i.id
        and ci.status = 'active'
    );
  return new;
end;
$$;
