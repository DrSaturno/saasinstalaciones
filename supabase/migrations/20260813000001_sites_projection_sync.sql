-- R2-DB-04 — `sites` pasa a ser una proyección mantenida por la base.
--
-- Contexto: el 13-08-2026 la divergencia entre `sites` y su `locations` llegó a
-- cero, pero era una foto: nada impedía que volviera a abrirse. El write path de
-- la aplicación sincroniza (ver `updateSite` en `lib/actions/sites.ts`), pero eso
-- depende de que todo camino futuro se acuerde de hacerlo — importaciones, SQL
-- directo, backfills y cualquier código nuevo. El plan ya declara que «sites queda
-- como proyección necesaria para OTs/rutas»; esta migración hace que efectivamente
-- lo sea, en vez de ser una copia que hay que mantener a mano.
--
-- Alcance deliberado: sólo se derivan los campos de IDENTIDAD, que pertenecen a la
-- ficha canónica. NO se tocan los campos operativos, que son propios de la relación
-- proyecto–punto y distintos por proyecto:
--   * `archived_at` — archivar es por proyecto; la ficha sigue viva para los demás.
--   * `status`, `is_placeholder`, `project_id` — estado operativo de la proyección.
--
-- Un `site` sin `location_id` conserva su identidad propia: el trigger no lo toca.

create or replace function public.sync_site_identity_from_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical public.locations%rowtype;
begin
  if new.location_id is null then
    return new;
  end if;

  select * into canonical from public.locations where id = new.location_id;
  if not found then
    return new;
  end if;

  new.name             := canonical.name;
  new.external_ref     := canonical.external_ref;
  new.address          := canonical.address;
  new.city             := canonical.city;
  new.state            := canonical.state;
  new.zone             := canonical.zone;
  new.lat              := canonical.lat;
  new.lng              := canonical.lng;
  new.contact_name     := canonical.contact_name;
  new.contact_phone    := canonical.contact_phone;
  new.contact_email    := canonical.contact_email;
  new.opening_hours    := canonical.opening_hours;
  new.access_notes     := canonical.access_notes;
  new.parking_notes    := canonical.parking_notes;
  new.technical_notes  := canonical.technical_notes;
  new.risk_notes       := canonical.risk_notes;
  new.permanent_notes  := canonical.permanent_notes;

  return new;
end;
$$;

revoke all on function public.sync_site_identity_from_location() from public;

create trigger sites_sync_identity_from_location
  before insert or update on public.sites
  for each row execute function public.sync_site_identity_from_location();

-- Editar la ficha canónica se propaga a todas sus proyecciones. Sin esto el
-- trigger de arriba sólo alcanzaría a los sites que alguien vuelva a escribir.
create or replace function public.propagate_location_identity_to_sites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sites s
  set name            = new.name,
      external_ref    = new.external_ref,
      address         = new.address,
      city            = new.city,
      state           = new.state,
      zone            = new.zone,
      lat             = new.lat,
      lng             = new.lng,
      contact_name    = new.contact_name,
      contact_phone   = new.contact_phone,
      contact_email   = new.contact_email,
      opening_hours   = new.opening_hours,
      access_notes    = new.access_notes,
      parking_notes   = new.parking_notes,
      technical_notes = new.technical_notes,
      risk_notes      = new.risk_notes,
      permanent_notes = new.permanent_notes
  where s.location_id = new.id
    and s.company_id = new.company_id;

  return null;
end;
$$;

revoke all on function public.propagate_location_identity_to_sites() from public;

-- El `when` evita reescribir las proyecciones cuando la actualización no tocó la
-- identidad (por ejemplo, sólo `updated_by` o `archived_at` de la ficha).
create trigger locations_propagate_identity_to_sites
  after update on public.locations
  for each row
  when (
    old.name            is distinct from new.name
    or old.external_ref    is distinct from new.external_ref
    or old.address         is distinct from new.address
    or old.city            is distinct from new.city
    or old.state           is distinct from new.state
    or old.zone            is distinct from new.zone
    or old.lat             is distinct from new.lat
    or old.lng             is distinct from new.lng
    or old.contact_name    is distinct from new.contact_name
    or old.contact_phone   is distinct from new.contact_phone
    or old.contact_email   is distinct from new.contact_email
    or old.opening_hours   is distinct from new.opening_hours
    or old.access_notes    is distinct from new.access_notes
    or old.parking_notes   is distinct from new.parking_notes
    or old.technical_notes is distinct from new.technical_notes
    or old.risk_notes      is distinct from new.risk_notes
    or old.permanent_notes is distinct from new.permanent_notes
  )
  execute function public.propagate_location_identity_to_sites();

-- Alinea lo que hubiera quedado divergente antes de que existieran los triggers.
-- En el entorno principal esto no cambia ninguna fila (la divergencia ya estaba
-- en cero); se incluye para que un entorno nuevo o rezagado converja al aplicar.
update public.sites s
set name            = l.name,
    external_ref    = l.external_ref,
    address         = l.address,
    city            = l.city,
    state           = l.state,
    zone            = l.zone,
    lat             = l.lat,
    lng             = l.lng,
    contact_name    = l.contact_name,
    contact_phone   = l.contact_phone,
    contact_email   = l.contact_email,
    opening_hours   = l.opening_hours,
    access_notes    = l.access_notes,
    parking_notes   = l.parking_notes,
    technical_notes = l.technical_notes,
    risk_notes      = l.risk_notes,
    permanent_notes = l.permanent_notes
from public.locations l
where l.id = s.location_id
  and l.company_id = s.company_id;
