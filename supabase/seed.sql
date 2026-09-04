-- =============================================================
-- Instala Pro — Seed de desarrollo
-- Ejecutar DESPUÉS de la migración inicial.
-- Usuarios demo (password para todos: InstalaPro2026!)
--   admin@instalapro.dev       → platform_admin
--   gerente@demo.dev           → company_manager de "Gráfica Demo SA"
--   instalador1@demo.dev       → installer (AMBA)
--   instalador2@demo.dev       → installer (AMBA)
--   instalador3@demo.dev       → installer (Córdoba)
-- =============================================================

-- 1. Empresa demo (uuid fijo para referencia)
insert into public.companies (id, name, country, order_prefix)
values ('11111111-1111-1111-1111-111111111111', 'Gráfica Demo SA', 'AR', 'DEM')
on conflict (id) do nothing;

insert into public.companies (id, name, country, order_prefix, status) values
  ('66666666-6666-6666-6666-666666666666', 'Grafica Demo Brasil', 'BR', 'BRD', 'active'),
  ('77777777-7777-7777-7777-777777777777', 'Empresa Demo Suspendida', 'AR', 'SUS', 'suspended')
on conflict (id) do nothing;

-- 2. Usuarios auth (el trigger handle_new_user crea profiles/installers)
--
-- Sin función auxiliar. El CLI de Supabase manda el seed en lotes y no trata un
-- bloque `$$...$$` como una unidad, así que definir una función acá y llamarla
-- más abajo falla: primero con «schema "pg_temp" does not exist» y, al moverla
-- a `public`, con «function public.seed_user does not exist». Es lo que tuvo la
-- CI en rojo desde el 07-08-2026 y, de paso, lo que impidió que las 14 suites
-- pgTAP del repo llegaran a ejecutarse alguna vez. Un insert por conjunto no
-- tiene ese problema y encima es más corto.
--
-- Las columnas de token DEBEN ir en '' y no NULL: GoTrue las lee como string de
-- Go y un NULL rompe el login con "Database error querying schema".
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', d.id, 'authenticated', 'authenticated',
  d.email, extensions.crypt('InstalaPro2026!', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', d.meta, now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'admin@instalapro.dev',
   '{"role":"platform_admin","full_name":"Admin Instala Pro"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000002', 'gerente@demo.dev',
   '{"role":"company_manager","company_id":"11111111-1111-1111-1111-111111111111","full_name":"Gerente Demo"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000003', 'instalador1@demo.dev',
   '{"role":"installer","full_name":"Iván Instalador"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000004', 'instalador2@demo.dev',
   '{"role":"installer","full_name":"Paula Ploteo"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000005', 'instalador3@demo.dev',
   '{"role":"installer","full_name":"Carlos Córdoba"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000006', 'coordinador@demo.dev',
   '{"role":"installer","full_name":"Coordinadora Demo"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000007', 'gerente.b@demo.dev',
   '{"role":"company_manager","company_id":"66666666-6666-6666-6666-666666666666","full_name":"Gerente Demo Brasil","locale":"pt"}'::jsonb)
) as d(id, email, meta)
on conflict (id) do nothing;

-- La identidad de email es lo que GoTrue busca al iniciar sesion; sin esta fila
-- el usuario existe pero no puede entrar.
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.id in (
  'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000007'
)
on conflict do nothing;

-- 2b. Segundo factor (SEC-13): platform_admin y company_manager tienen la
-- verificación en dos pasos OBLIGATORIA, así que su login real pasa por el
-- step-up. Para que el E2E pueda entrar, se les siembra un factor TOTP ya
-- verificado con un secreto conocido; `e2e/auth.setup.ts` calcula el código
-- desde ese mismo secreto (`E2E_MFA_SECRET`). Es una cuenta sintética de un
-- entorno desechable, igual que la contraseña del seed — no es un secreto real.
insert into auth.mfa_factors (
  id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at
)
values
  ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'e2e-totp', 'totp', 'verified', 'A7W4YKU52M5CBGOZZJGCOI7K7OA5LNRR', now(), now()),
  ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002',
   'e2e-totp', 'totp', 'verified', 'A7W4YKU52M5CBGOZZJGCOI7K7OA5LNRR', now(), now()),
  ('f0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000007',
   'e2e-totp', 'totp', 'verified', 'A7W4YKU52M5CBGOZZJGCOI7K7OA5LNRR', now(), now())
on conflict (id) do nothing;

-- 3. Zonas y skills de los instaladores
update public.installers set zones = '{AR-BA-AMBA}', skills = '{ploteo_vehicular,vidrieras}'
  where id = 'a0000000-0000-0000-0000-000000000003';
update public.installers set zones = '{AR-BA-AMBA}', skills = '{corporeos,vidrieras}'
  where id = 'a0000000-0000-0000-0000-000000000004';
update public.installers set zones = '{AR-CBA}', skills = '{ploteo_vehicular}'
  where id = 'a0000000-0000-0000-0000-000000000005';

-- 4. Roster: los dos de AMBA son de confianza de la empresa demo
insert into public.company_installers (company_id, installer_id, status, joined_at) values
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003', 'active', now()),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004', 'active', now())
on conflict do nothing;

-- Actores adicionales del baseline: coordinador, dual, multiempresa y tenant
-- suspendido. El instalador 1 es dual en A e instalador en B.
insert into public.company_installers (
  company_id, installer_id, role, status, joined_at
) values
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000006', 'coordinator', 'active', now()),
  ('66666666-6666-6666-6666-666666666666', 'a0000000-0000-0000-0000-000000000003', 'installer', 'active', now()),
  ('77777777-7777-7777-7777-777777777777', 'a0000000-0000-0000-0000-000000000004', 'installer', 'active', now())
on conflict do nothing;

insert into public.company_membership_roles (company_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003', 'coordinator'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000006', 'coordinator')
on conflict do nothing;

update public.company_installers
set role = 'coordinator'
where company_id = '11111111-1111-1111-1111-111111111111'
  and installer_id in (
    'a0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000006'
  );

-- 5. Proyecto demo con 20 puntos
-- `zones` tiene que declarar las mismas zonas que usan los sites de abajo. Con
-- la lista vacía el seed quedaba inconsistente consigo mismo y eso rompía dos
-- cosas de verdad: la importación rechazaba TODA fila por «zona fuera del
-- proyecto», y editar el proyecto fallaba porque `updateProject` exige que las
-- zonas elegidas incluyan las que ya están en uso.
insert into public.projects (id, company_id, name, client_name, status, starts_at, zones)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        'Refacción Estaciones Norte', 'Shell Argentina', 'active', current_date,
        '{AR-BA-AMBA,AR-CBA}')
on conflict (id) do nothing;

insert into public.sites (project_id, company_id, name, address, city, state, zone, external_ref)
select
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Estación ' || lpad(n::text, 3, '0'),
  'Av. Siempreviva ' || (1000 + n * 7),
  case when n % 3 = 0 then 'Córdoba' else 'Buenos Aires' end,
  case when n % 3 = 0 then 'Córdoba' else 'Buenos Aires' end,
  case when n % 3 = 0 then 'AR-CBA' else 'AR-BA-AMBA' end,
  'SHELL-' || lpad(n::text, 4, '0')
from generate_series(1, 20) n
on conflict do nothing;

-- 6. Órdenes en distintos estados
--    (insert directo con estado; la máquina de estados solo valida UPDATEs)
insert into public.work_orders (site_id, project_id, company_id, title, status, scheduled_date, assigned_installer_id, created_by)
select
  s.id, s.project_id, s.company_id,
  'Recambio de gráfica — ' || s.name,
  case
    when row_number() over (order by s.name) <= 2 then 'finalizada'
    when row_number() over (order by s.name) <= 4 then 'en_proceso'
    when row_number() over (order by s.name) <= 6 then 'planificada'
    else 'pendiente'
  end,
  case when row_number() over (order by s.name) <= 6 then current_date + (row_number() over (order by s.name))::int end,
  case
    when row_number() over (order by s.name) % 2 = 0 then 'a0000000-0000-0000-0000-000000000003'::uuid
    when row_number() over (order by s.name) <= 6 then 'a0000000-0000-0000-0000-000000000004'::uuid
  end,
  'a0000000-0000-0000-0000-000000000002'
from public.sites s
where s.project_id = '22222222-2222-2222-2222-222222222222'
  and not exists (select 1 from public.work_orders w where w.site_id = s.id);

-- 7. Una calificación sobre una orden finalizada (prueba el trigger de estrellas)
insert into public.ratings (order_id, company_id, installer_id, stars, comment)
select w.id, w.company_id, w.assigned_installer_id, 5, 'Impecable, antes de tiempo.'
from public.work_orders w
where w.status = 'finalizada' and w.assigned_installer_id is not null
limit 1
on conflict do nothing;

-- 8. Un avance de ejemplo
insert into public.order_updates (id, order_id, company_id, installer_id, type, note, client_created_at)
select gen_random_uuid(), w.id, w.company_id, w.assigned_installer_id, 'progress',
       'Frente terminado, mañana laterales.', now()
from public.work_orders w
where w.status = 'en_proceso' and w.assigned_installer_id is not null
limit 1;

-- 9. Un broadcast abierto en Córdoba (lo ve instalador3)
insert into public.broadcasts (company_id, project_id, zone, title, description, slots)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
        'AR-CBA', 'Refuerzo en Córdoba', 'Necesitamos 1 instalador para 6 estaciones zona Córdoba capital.', 1);

-- 10. Cola de revisión del backfill canónico (R2-UI-03)
-- Reproduce los dos casos que aparecieron de verdad al migrar producción, para
-- que la pantalla de revisión tenga con qué probarse. El primero es el
-- interesante: la misma referencia externa apuntando a dos locales que están en
-- ciudades distintas, o sea un error de carga y no un duplicado.
insert into public.clients (id, company_id, name)
values ('33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111', 'YPF Demo')
on conflict (id) do nothing;

update public.projects
set client_id = '33333333-3333-3333-3333-333333333333'
where id = '22222222-2222-2222-2222-222222222222'
  and client_id is null;

-- El seed corre despues de las migraciones: las 20 filas demo no existian
-- cuando se ejecuto el backfill de R2. Se replica ese paso aca para que la
-- ficha canonica y el dual-read tengan datos reales en los E2E locales.
insert into public.locations (
  company_id, client_id, external_ref, name, address, city, state, zone,
  country, contact_name, contact_phone, contact_email, opening_hours,
  access_notes, parking_notes, technical_notes, risk_notes, permanent_notes,
  source, created_at, updated_at
)
select
  s.company_id,
  p.client_id,
  s.external_ref,
  s.name,
  s.address,
  s.city,
  s.state,
  s.zone,
  p.country,
  s.contact_name,
  s.contact_phone,
  s.contact_email,
  s.opening_hours,
  s.access_notes,
  s.parking_notes,
  s.technical_notes,
  s.risk_notes,
  s.permanent_notes,
  'backfill',
  s.created_at,
  s.updated_at
from public.sites s
join public.projects p on p.id = s.project_id
where s.project_id = '22222222-2222-2222-2222-222222222222'
  and p.client_id is not null
on conflict (company_id, client_id, normalized_external_ref)
  where normalized_external_ref is not null
do nothing;

update public.sites s
set location_id = l.id
from public.projects p, public.locations l
where p.id = s.project_id
  and l.company_id = s.company_id
  and l.client_id = p.client_id
  and l.normalized_external_ref = public.normalize_location_external_ref(s.external_ref)
  and s.project_id = '22222222-2222-2222-2222-222222222222'
  and s.location_id is null;

insert into public.project_locations (
  company_id, client_id, project_id, location_id, status,
  operational_snapshot, created_at, updated_at
)
select
  s.company_id,
  p.client_id,
  s.project_id,
  s.location_id,
  'active',
  jsonb_build_object('legacy_site_ids', jsonb_agg(s.id order by s.id)),
  min(s.created_at),
  max(s.updated_at)
from public.sites s
join public.projects p on p.id = s.project_id
where s.project_id = '22222222-2222-2222-2222-222222222222'
  and s.location_id is not null
  and p.client_id is not null
group by s.company_id, p.client_id, s.project_id, s.location_id
on conflict (project_id, location_id) do nothing;

insert into public.location_backfill_issues (
  company_id, client_id, project_id, source_site_id,
  issue_code, normalized_external_ref, source_site_ids, details
)
select
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  s.id,
  'conflicting_source_data',
  'ypf001',
  array[s.id],
  '{"matched_by":"company_client_external_ref","variants":[
     {"city":"caba","name":"ypf - local 1","state":"ciudad autónoma de buenos aires",
      "address":"monroe y libertador","contact_name":"raul perez","contact_phone":"114534 5676"},
     {"city":"la plata","name":"local ypf 001","state":"buenos aires",
      "address":"av. horizonte 473","contact_name":"","contact_phone":""}]}'::jsonb
from public.sites s
where s.project_id = '22222222-2222-2222-2222-222222222222'
order by s.name limit 1
on conflict (source_site_id, issue_code) do nothing;

insert into public.location_backfill_issues (
  company_id, client_id, project_id, source_site_id,
  issue_code, source_site_ids, details
)
select
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  s.id,
  'missing_external_ref',
  array[s.id],
  '{"name":"shell001","address":"","city":"","state":"Buenos Aires","possible_source_site_ids":[]}'::jsonb
from public.sites s
where s.project_id = '22222222-2222-2222-2222-222222222222'
order by s.name offset 1 limit 1
on conflict (source_site_id, issue_code) do nothing;

-- Verificación rápida
select 'companies' t, count(*) from public.companies
union all select 'profiles', count(*) from public.profiles
union all select 'installers', count(*) from public.installers
union all select 'sites', count(*) from public.sites
union all select 'work_orders', count(*) from public.work_orders
union all select 'ratings', count(*) from public.ratings;
