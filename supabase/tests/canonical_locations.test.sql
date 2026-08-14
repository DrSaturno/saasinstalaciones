-- Gate estructural y RLS de R2: identidad canónica sin fugas entre tenant,
-- cliente, proyecto ni actor. Todo el fixture revierte al final.

begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

select has_table('public', 'locations', 'existe locations');
select has_table('public', 'project_locations', 'existe project_locations');
select has_table('public', 'location_requirements', 'existe location_requirements');
select has_table('public', 'location_attachments', 'existe location_attachments');
select has_table('public', 'location_change_events', 'existe location_change_events');
select has_table('public', 'location_backfill_issues', 'existe la cola de conciliación');
select has_column('public', 'sites', 'location_id', 'sites conserva una FK de compatibilidad');
select has_function(
  'public',
  'normalize_location_external_ref',
  array['text'],
  'existe el normalizador de referencia externa'
);
select has_index(
  'public',
  'locations',
  'locations_canonical_ref_idx',
  'la clave canónica tiene un índice único parcial'
);

select is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      'public.locations'::regclass,
      'public.project_locations'::regclass,
      'public.location_requirements'::regclass,
      'public.location_attachments'::regclass,
      'public.location_change_events'::regclass,
      'public.location_backfill_issues'::regclass
    )
      and relrowsecurity
  ),
  6,
  'todas las tablas canónicas tienen RLS activa'
);

select is(
  public.normalize_location_external_ref(' AR - 001 / Norte '),
  'ar001norte',
  'la normalización elimina diferencias de formato'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'project_locations_project_tenant_client_fk'
      and contype = 'f'
  )
  and exists (
    select 1
    from pg_constraint
    where conname = 'project_locations_location_tenant_client_fk'
      and contype = 'f'
  ),
  'la asociación valida proyecto y locación por tenant+cliente'
);

-- ---------------------------------------------------------------------------
-- Fixture A/B con dos proyectos del mismo cliente en A.
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, country, order_prefix) values
  ('c2000000-0000-0000-0000-000000000001', 'Empresa canónica A', 'AR', 'CNA'),
  ('c2000000-0000-0000-0000-000000000002', 'Empresa canónica B', 'AR', 'CNB');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'c2000000-0000-0000-0000-000000000010',
  'authenticated', 'authenticated', 'manager-canonical@test.invalid',
  extensions.crypt('x', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"company_manager","company_id":"c2000000-0000-0000-0000-000000000001","full_name":"Manager Canonical"}',
  now(), now(), '', '', '', '', '', '', '', ''
), (
  '00000000-0000-0000-0000-000000000000',
  'c2000000-0000-0000-0000-000000000011',
  'authenticated', 'authenticated', 'coordinator-canonical@test.invalid',
  extensions.crypt('x', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"installer","full_name":"Coordinator Canonical"}',
  now(), now(), '', '', '', '', '', '', '', ''
), (
  '00000000-0000-0000-0000-000000000000',
  'c2000000-0000-0000-0000-000000000012',
  'authenticated', 'authenticated', 'installer-canonical@test.invalid',
  extensions.crypt('x', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"installer","full_name":"Installer Canonical"}',
  now(), now(), '', '', '', '', '', '', '', ''
);

insert into public.company_installers (
  company_id, installer_id, role, status, joined_at
) values
  (
    'c2000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000011',
    'coordinator', 'active', now()
  ),
  (
    'c2000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000012',
    'installer', 'active', now()
  );

insert into public.clients (id, company_id, name) values
  (
    'c2000000-0000-0000-0000-000000000020',
    'c2000000-0000-0000-0000-000000000001',
    'Cliente compartido A'
  ),
  (
    'c2000000-0000-0000-0000-000000000021',
    'c2000000-0000-0000-0000-000000000001',
    'Otro cliente A'
  ),
  (
    'c2000000-0000-0000-0000-000000000022',
    'c2000000-0000-0000-0000-000000000002',
    'Cliente B'
  );

insert into public.projects (
  id, company_id, client_id, name, coordinator_id, status
) values
  (
    'c2000000-0000-0000-0000-000000000030',
    'c2000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000020',
    'Proyecto A1 coordinado',
    'c2000000-0000-0000-0000-000000000011',
    'active'
  ),
  (
    'c2000000-0000-0000-0000-000000000031',
    'c2000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000020',
    'Proyecto A2 ajeno',
    null,
    'active'
  ),
  (
    'c2000000-0000-0000-0000-000000000032',
    'c2000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000021',
    'Proyecto otro cliente A',
    null,
    'active'
  ),
  (
    'c2000000-0000-0000-0000-000000000033',
    'c2000000-0000-0000-0000-000000000002',
    'c2000000-0000-0000-0000-000000000022',
    'Proyecto B',
    null,
    'active'
  );

insert into public.locations (
  id, company_id, client_id, external_ref, name, source, created_by
) values
  (
    'c2000000-0000-0000-0000-000000000040',
    'c2000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000020',
    'LOC-A-001', 'Locación compartida A', 'manual',
    'c2000000-0000-0000-0000-000000000010'
  ),
  (
    'c2000000-0000-0000-0000-000000000041',
    'c2000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000021',
    'LOC-A-002', 'Locación de otro cliente A', 'manual',
    'c2000000-0000-0000-0000-000000000010'
  ),
  (
    'c2000000-0000-0000-0000-000000000042',
    'c2000000-0000-0000-0000-000000000002',
    'c2000000-0000-0000-0000-000000000022',
    'LOC-B-001', 'Locación B', 'manual', null
  );

insert into public.project_locations (
  company_id, client_id, project_id, location_id, created_by
) values
  (
    'c2000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000020',
    'c2000000-0000-0000-0000-000000000030',
    'c2000000-0000-0000-0000-000000000040',
    'c2000000-0000-0000-0000-000000000010'
  ),
  (
    'c2000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000020',
    'c2000000-0000-0000-0000-000000000031',
    'c2000000-0000-0000-0000-000000000040',
    'c2000000-0000-0000-0000-000000000010'
  ),
  (
    'c2000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000021',
    'c2000000-0000-0000-0000-000000000032',
    'c2000000-0000-0000-0000-000000000041',
    'c2000000-0000-0000-0000-000000000010'
  ),
  (
    'c2000000-0000-0000-0000-000000000002',
    'c2000000-0000-0000-0000-000000000022',
    'c2000000-0000-0000-0000-000000000033',
    'c2000000-0000-0000-0000-000000000042',
    null
  );

insert into public.sites (
  id, project_id, company_id, location_id, name, external_ref
) values
  (
    'c2000000-0000-0000-0000-000000000050',
    'c2000000-0000-0000-0000-000000000030',
    'c2000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000040',
    'Site A1', 'LOC-A-001'
  ),
  (
    'c2000000-0000-0000-0000-000000000051',
    'c2000000-0000-0000-0000-000000000031',
    'c2000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000040',
    'Site A2', 'LOC-A-001'
  ),
  (
    'c2000000-0000-0000-0000-000000000052',
    'c2000000-0000-0000-0000-000000000032',
    'c2000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000041',
    'Site otro cliente A', 'LOC-A-002'
  ),
  (
    'c2000000-0000-0000-0000-000000000053',
    'c2000000-0000-0000-0000-000000000033',
    'c2000000-0000-0000-0000-000000000002',
    'c2000000-0000-0000-0000-000000000042',
    'Site B', 'LOC-B-001'
  );

insert into public.work_orders (
  id, order_number, site_id, project_id, company_id, title,
  assigned_installer_id
) values (
  'c2000000-0000-0000-0000-000000000054',
  'CANONICAL-A1',
  'c2000000-0000-0000-0000-000000000050',
  'c2000000-0000-0000-0000-000000000030',
  'c2000000-0000-0000-0000-000000000001',
  'Orden asignada en A1',
  'c2000000-0000-0000-0000-000000000012'
);

insert into public.location_attachments (
  id, company_id, client_id, location_id, storage_path,
  file_name, mime_type, size_bytes, uploaded_by
) values (
  'c2000000-0000-0000-0000-000000000060',
  'c2000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000020',
  'c2000000-0000-0000-0000-000000000040',
  'c2000000-0000-0000-0000-000000000001/locations/c2000000-0000-0000-0000-000000000040/permit.pdf',
  'permit.pdf', 'application/pdf', 1024,
  'c2000000-0000-0000-0000-000000000010'
);

insert into public.location_requirements (
  id, company_id, client_id, location_id, kind, requirement_type,
  status, document_attachment_id, created_by
) values (
  'c2000000-0000-0000-0000-000000000061',
  'c2000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000020',
  'c2000000-0000-0000-0000-000000000040',
  'permit', 'Ingreso municipal', 'valid',
  'c2000000-0000-0000-0000-000000000060',
  'c2000000-0000-0000-0000-000000000010'
);

select throws_ok(
  $test$
    insert into public.sites (
      id, project_id, company_id, location_id, name
    ) values (
      'c2000000-0000-0000-0000-000000000055',
      'c2000000-0000-0000-0000-000000000030',
      'c2000000-0000-0000-0000-000000000001',
      'c2000000-0000-0000-0000-000000000041',
      'Cruce de cliente inválido'
    )
  $test$,
  'P0001',
  'La locación canónica no pertenece al tenant y cliente del proyecto',
  'sites rechaza una locación de otro cliente aun dentro del mismo tenant'
);

-- ---------------------------------------------------------------------------
-- Coordinador: identidad compartida visible, asociación contractual P2 oculta.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"c2000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
  (
    select count(*)::integer
    from public.locations
    where id in (
      'c2000000-0000-0000-0000-000000000040',
      'c2000000-0000-0000-0000-000000000041',
      'c2000000-0000-0000-0000-000000000042'
    )
  ),
  1,
  'el coordinador ve sólo la locación de su proyecto'
);

select is(
  (
    select count(*)::integer
    from public.project_locations
    where location_id = 'c2000000-0000-0000-0000-000000000040'
  ),
  1,
  'compartir identidad no filtra datos contractuales del proyecto A2'
);

-- Postgres no admite un `with` que escribe metido dentro de una subconsulta, y
-- así estaban escritas las cuatro comprobaciones de escritura de este archivo:
-- abortaban la suite entera en la primera de ellas. La forma que sí vale es
-- dejar el `with` al tope de una sentencia propia y guardar el resultado, que
-- además conserva lo que se quería medir —filas afectadas— en vez de conformarse
-- con mirar el efecto. RLS bloquea sin lanzar error: la señal son las 0 filas.
with changed as (
  update public.locations
  set permanent_notes = 'edición directa no autorizada',
      updated_by = 'c2000000-0000-0000-0000-000000000011'
  where id = 'c2000000-0000-0000-0000-000000000040'
  returning 1
)
select count(*)::integer as filas into temp table _escritura_coordinador from changed;

select is(
  (select filas from _escritura_coordinador),
  0,
  'el coordinador no modifica datos permanentes directamente'
);

select lives_ok(
  $test$
    insert into public.location_change_events (
      company_id, client_id, location_id, actor_id, actor_context,
      event_type, status, changed_fields, after_data
    ) values (
      'c2000000-0000-0000-0000-000000000001',
      'c2000000-0000-0000-0000-000000000020',
      'c2000000-0000-0000-0000-000000000040',
      'c2000000-0000-0000-0000-000000000011',
      'coordinator', 'change_proposed', 'pending',
      array['access_notes'], '{"access_notes":"Nueva indicación"}'::jsonb
    )
  $test$,
  'el coordinador propone un cambio auditable en su alcance'
);

-- ---------------------------------------------------------------------------
-- Instalador asignado: lectura permanente y propuesta, sin edición directa.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"c2000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (
    select count(*)::integer
    from public.locations
    where id in (
      'c2000000-0000-0000-0000-000000000040',
      'c2000000-0000-0000-0000-000000000041',
      'c2000000-0000-0000-0000-000000000042'
    )
  ),
  1,
  'el instalador ve sólo la locación de su OT asignada'
);

select is(
  (
    select count(*)::integer
    from public.project_locations
    where project_id in (
      'c2000000-0000-0000-0000-000000000030',
      'c2000000-0000-0000-0000-000000000031'
    )
  ),
  1,
  'el instalador ve sólo la asociación del proyecto de su OT'
);

select is(
  (select count(*)::integer from public.location_requirements),
  1,
  'el instalador asignado puede leer requisitos de la locación'
);

select is(
  (select count(*)::integer from public.location_attachments),
  1,
  'el instalador asignado puede leer adjuntos permanentes'
);

with changed as (
  update public.locations
  set risk_notes = 'edición directa no autorizada',
      updated_by = 'c2000000-0000-0000-0000-000000000012'
  where id = 'c2000000-0000-0000-0000-000000000040'
  returning 1
)
select count(*)::integer as filas into temp table _escritura_instalador from changed;

select is(
  (select filas from _escritura_instalador),
  0,
  'el instalador no modifica datos permanentes directamente'
);

select lives_ok(
  $test$
    insert into public.location_change_events (
      company_id, client_id, location_id, actor_id, actor_context,
      event_type, status, changed_fields, after_data
    ) values (
      'c2000000-0000-0000-0000-000000000001',
      'c2000000-0000-0000-0000-000000000020',
      'c2000000-0000-0000-0000-000000000040',
      'c2000000-0000-0000-0000-000000000012',
      'installer', 'change_proposed', 'pending',
      array['risk_notes'], '{"risk_notes":"Riesgo observado"}'::jsonb
    )
  $test$,
  'el instalador asignado puede proponer un cambio auditable'
);

-- ---------------------------------------------------------------------------
-- Manager A: administra lo permanente de A y nunca cruza hacia B.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"c2000000-0000-0000-0000-000000000010","role":"authenticated"}';

select is(
  (
    select count(*)::integer
    from public.locations
    where id in (
      'c2000000-0000-0000-0000-000000000040',
      'c2000000-0000-0000-0000-000000000041',
      'c2000000-0000-0000-0000-000000000042'
    )
  ),
  2,
  'el manager A ve sus locaciones y no la del tenant B'
);

with changed as (
  update public.locations
  set permanent_notes = 'dato permanente validado',
      updated_by = 'c2000000-0000-0000-0000-000000000010'
  where id = 'c2000000-0000-0000-0000-000000000040'
  returning 1
)
select count(*)::integer as filas into temp table _escritura_manager from changed;

select is(
  (select filas from _escritura_manager),
  1,
  'el manager administra datos permanentes de su tenant'
);

with changed as (
  update public.locations
  set permanent_notes = 'fuga',
      updated_by = 'c2000000-0000-0000-0000-000000000010'
  where id = 'c2000000-0000-0000-0000-000000000042'
  returning 1
)
select count(*)::integer as filas into temp table _fuga_entre_tenants from changed;

select is(
  (select filas from _fuga_entre_tenants),
  0,
  'el manager A no modifica la locación del tenant B'
);

select ok(
  exists (
    select 1
    from public.location_change_events
    where location_id = 'c2000000-0000-0000-0000-000000000040'
      and actor_id = 'c2000000-0000-0000-0000-000000000010'
      and actor_context = 'company_manager'
      and event_type = 'updated'
      and 'permanent_notes' = any(changed_fields)
  ),
  'la edición permanente genera auditoría automática con actor y campo'
);

reset role;

delete from public.projects
where id = 'c2000000-0000-0000-0000-000000000031';

select is(
  (
    select count(*)::integer
    from public.locations
    where id = 'c2000000-0000-0000-0000-000000000040'
  ),
  1,
  'eliminar un proyecto no elimina la identidad canónica compartida'
);

select * from finish();
rollback;
