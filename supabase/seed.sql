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

-- 2. Usuarios auth (el trigger handle_new_user crea profiles/installers)
create or replace function pg_temp.seed_user(
  p_id uuid, p_email text, p_meta jsonb
) returns void language plpgsql as $$
begin
  -- Las columnas de token DEBEN ir en '' y no NULL: GoTrue las lee como
  -- string de Go y un NULL rompe el login con "Database error querying schema".
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt('InstalaPro2026!', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', p_meta, now(), now(),
    '', '', '', '', '', '', '', ''
  ) on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), p_id, p_id::text, 'email',
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    now(), now(), now()
  ) on conflict do nothing;
end;
$$;

select pg_temp.seed_user(
  'a0000000-0000-0000-0000-000000000001', 'admin@instalapro.dev',
  '{"role":"platform_admin","full_name":"Admin Instala Pro"}'::jsonb);

select pg_temp.seed_user(
  'a0000000-0000-0000-0000-000000000002', 'gerente@demo.dev',
  '{"role":"company_manager","company_id":"11111111-1111-1111-1111-111111111111","full_name":"Gerente Demo"}'::jsonb);

select pg_temp.seed_user(
  'a0000000-0000-0000-0000-000000000003', 'instalador1@demo.dev',
  '{"role":"installer","full_name":"Iván Instalador"}'::jsonb);

select pg_temp.seed_user(
  'a0000000-0000-0000-0000-000000000004', 'instalador2@demo.dev',
  '{"role":"installer","full_name":"Paula Ploteo"}'::jsonb);

select pg_temp.seed_user(
  'a0000000-0000-0000-0000-000000000005', 'instalador3@demo.dev',
  '{"role":"installer","full_name":"Carlos Córdoba"}'::jsonb);

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

-- 5. Proyecto demo con 20 puntos
insert into public.projects (id, company_id, name, client_name, status, starts_at)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        'Refacción Estaciones Norte', 'Shell Argentina', 'active', current_date)
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

-- Verificación rápida
select 'companies' t, count(*) from public.companies
union all select 'profiles', count(*) from public.profiles
union all select 'installers', count(*) from public.installers
union all select 'sites', count(*) from public.sites
union all select 'work_orders', count(*) from public.work_orders
union all select 'ratings', count(*) from public.ratings;
