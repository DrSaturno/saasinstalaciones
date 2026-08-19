-- R2-DB-04: `sites` es una proyección mantenida por la base, no una copia que
-- haya que sincronizar a mano. La identidad se deriva de `locations`; los campos
-- operativos (archived_at, status) siguen siendo de la relación proyecto–punto.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_function(
  'public',
  'sync_site_identity_from_location',
  'existe el trigger que deriva la identidad del site desde su ficha canónica'
);

select has_function(
  'public',
  'propagate_location_identity_to_sites',
  'existe el trigger que propaga la ficha canónica a sus proyecciones'
);

insert into public.companies (id, name, country, order_prefix)
values ('f6000000-0000-0000-0000-000000000001', 'Empresa proyección', 'AR', 'PRY');

insert into public.clients (id, company_id, name)
values (
  'f6000000-0000-0000-0000-000000000002',
  'f6000000-0000-0000-0000-000000000001',
  'Cliente proyección'
);

insert into public.projects (id, company_id, client_id, name, country, zones)
values (
  'f6000000-0000-0000-0000-000000000003',
  'f6000000-0000-0000-0000-000000000001',
  'f6000000-0000-0000-0000-000000000002',
  'Proyecto proyección',
  'AR',
  array['Buenos Aires']
);

insert into public.locations (
  id, company_id, client_id, external_ref, name, address, city, state, zone, country
) values (
  'f6000000-0000-0000-0000-000000000004',
  'f6000000-0000-0000-0000-000000000001',
  'f6000000-0000-0000-0000-000000000002',
  'PRY-001',
  'Nombre canónico',
  'Dirección canónica',
  'Ciudad canónica',
  'Buenos Aires',
  'Buenos Aires',
  'AR'
);

-- Al insertar la proyección con datos distintos, la identidad se deriva igual.
insert into public.sites (
  id, company_id, project_id, location_id, name, address, city, state, zone, status
) values (
  'f6000000-0000-0000-0000-000000000005',
  'f6000000-0000-0000-0000-000000000001',
  'f6000000-0000-0000-0000-000000000003',
  'f6000000-0000-0000-0000-000000000004',
  'Nombre inventado',
  'Dirección inventada',
  'Ciudad inventada',
  'Buenos Aires',
  'Buenos Aires',
  'pendiente'
);

select is(
  (select name from public.sites where id = 'f6000000-0000-0000-0000-000000000005'),
  'Nombre canónico',
  'insertar la proyección con otro nombre no crea divergencia'
);

select is(
  (select city from public.sites where id = 'f6000000-0000-0000-0000-000000000005'),
  'Ciudad canónica',
  'insertar la proyección con otra ciudad no crea divergencia'
);

-- Escribir identidad divergente directo sobre la proyección no prospera.
update public.sites
set name = 'Nombre a mano', address = 'Dirección a mano'
where id = 'f6000000-0000-0000-0000-000000000005';

select is(
  (select name from public.sites where id = 'f6000000-0000-0000-0000-000000000005'),
  'Nombre canónico',
  'escribir identidad a mano sobre la proyección se corrige solo'
);

-- Editar la ficha canónica sí se propaga.
update public.locations
set name = 'Nombre canónico editado', zone = 'Buenos Aires'
where id = 'f6000000-0000-0000-0000-000000000004';

select is(
  (select name from public.sites where id = 'f6000000-0000-0000-0000-000000000005'),
  'Nombre canónico editado',
  'editar la ficha canónica se propaga a la proyección'
);

-- Los campos operativos son del proyecto, no de la ficha: el trigger no los toca.
update public.sites
set archived_at = now(), status = 'finalizada'
where id = 'f6000000-0000-0000-0000-000000000005';

select isnt(
  (select archived_at from public.sites where id = 'f6000000-0000-0000-0000-000000000005'),
  null,
  'archivar la proyección es por proyecto y el trigger no lo revierte'
);

-- Una proyección sin ficha canónica conserva su identidad propia.
insert into public.sites (
  id, company_id, project_id, name, address, city, state, zone, status
) values (
  'f6000000-0000-0000-0000-000000000006',
  'f6000000-0000-0000-0000-000000000001',
  'f6000000-0000-0000-0000-000000000003',
  'Sin ficha canónica',
  'Dirección propia',
  'Ciudad propia',
  'Buenos Aires',
  'Buenos Aires',
  'pendiente'
);

select is(
  (select name from public.sites where id = 'f6000000-0000-0000-0000-000000000006'),
  'Sin ficha canónica',
  'un site sin ficha canónica conserva su identidad propia'
);

select * from finish();

rollback;
