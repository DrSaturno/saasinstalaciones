-- La bolsa no le muestra a nadie las búsquedas de la empresa para la que ya
-- trabaja.
--
-- La exclusión existente mira `company_installers` con estado activo. Para un
-- coordinador eso alcanza mientras siga en el roster, pero su vínculo
-- autoritativo con la empresa es `profiles.company_id`: si por cualquier motivo
-- su fila del roster quedara inactiva, seguiría viendo las búsquedas de su
-- propia empresa. Se agrega esa segunda condición.
--
-- Idempotente: se puede re-ejecutar sin daño.

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
      -- (d) ni está vinculado a ella por su perfil (caso del coordinador)
      and not exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.company_id = b.company_id
      )
  )
$$;

revoke all on function public.broadcast_matches_installer(uuid) from public;
grant execute on function public.broadcast_matches_installer(uuid) to authenticated;
