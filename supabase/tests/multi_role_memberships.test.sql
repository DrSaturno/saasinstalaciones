begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select has_table(
  'public',
  'company_membership_roles',
  'existe la tabla normalizada de roles por membresía'
);
select has_function(
  'public',
  'grant_company_member_role',
  array['uuid', 'text'],
  'existe el comando de alta aditiva de rol'
);
select has_function(
  'public',
  'revoke_company_member_role',
  array['uuid', 'text'],
  'existe el comando de baja controlada de rol'
);

insert into public.companies (id, name, country, order_prefix)
values (
  'b1000000-0000-0000-0000-000000000001',
  'Empresa roles duales',
  'AR',
  'DUA'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'b1000000-0000-0000-0000-000000000010',
  'authenticated', 'authenticated', 'manager-dual@test.invalid',
  extensions.crypt('x', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"company_manager","company_id":"b1000000-0000-0000-0000-000000000001","full_name":"Manager Dual"}',
  now(), now(), '', '', '', '', '', '', '', ''
), (
  '00000000-0000-0000-0000-000000000000',
  'b1000000-0000-0000-0000-000000000011',
  'authenticated', 'authenticated', 'dual@test.invalid',
  extensions.crypt('x', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"installer","full_name":"Persona Dual"}',
  now(), now(), '', '', '', '', '', '', '', ''
);

insert into public.company_installers (
  company_id, installer_id, role, status, joined_at
) values (
  'b1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000011',
  'installer', 'active', now()
);

reset role;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'b1000000-0000-0000-0000-000000000012',
  'authenticated', 'authenticated', 'installer-team@test.invalid',
  extensions.crypt('x', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"installer","full_name":"Team installer"}',
  now(), now(), '', '', '', '', '', '', '', ''
);

insert into public.company_installers (
  company_id, installer_id, role, status, joined_at
) values (
  'b1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000012',
  'installer', 'active', now()
);

select is(
  (
    select count(*)::integer
    from public.company_membership_roles
    where company_id = 'b1000000-0000-0000-0000-000000000001'
      and user_id = 'b1000000-0000-0000-0000-000000000011'
  ),
  1,
  'el adaptador legacy crea el rol inicial'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b1000000-0000-0000-0000-000000000010","role":"authenticated"}';

select lives_ok(
  $$select public.grant_company_member_role(
    'b1000000-0000-0000-0000-000000000011', 'coordinator'
  )$$,
  'el manager agrega coordinación sin retirar instalación'
);
select is(
  (
    select count(*)::integer
    from public.company_membership_roles
    where company_id = 'b1000000-0000-0000-0000-000000000001'
      and user_id = 'b1000000-0000-0000-0000-000000000011'
  ),
  2,
  'la persona conserva dos roles en la misma empresa'
);
select is(
  (
    select role
    from public.company_installers
    where company_id = 'b1000000-0000-0000-0000-000000000001'
      and installer_id = 'b1000000-0000-0000-0000-000000000011'
  ),
  'coordinator',
  'la proyección legacy prefiere coordinator para compatibilidad'
);
select lives_ok(
  $$select public.grant_company_member_role(
    'b1000000-0000-0000-0000-000000000011', 'coordinator'
  )$$,
  'agregar dos veces el mismo rol es idempotente'
);
select is(
  (
    select count(*)::integer
    from public.company_membership_roles
    where company_id = 'b1000000-0000-0000-0000-000000000001'
      and user_id = 'b1000000-0000-0000-0000-000000000011'
  ),
  2,
  'la repetición no duplica capacidades'
);

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select ok(
  public.auth_has_company_role(
    'b1000000-0000-0000-0000-000000000001', 'installer'
  ),
  'el usuario dual conserva autorización de instalación'
);
select ok(
  public.auth_has_company_role(
    'b1000000-0000-0000-0000-000000000001', 'coordinator'
  ),
  'el usuario dual también obtiene autorización de coordinación'
);

select is(
  (
    select count(*)::integer
    from public.company_membership_roles
    where company_id = 'b1000000-0000-0000-0000-000000000001'
      and user_id = 'b1000000-0000-0000-0000-000000000012'
      and role = 'installer'
  ),
  1,
  'a coordinator can validate a teammate installer capability'
);

reset role;
insert into public.projects (
  id, company_id, name, coordinator_id, status
) values (
  'b1000000-0000-0000-0000-000000000020',
  'b1000000-0000-0000-0000-000000000001',
  'Proyecto activo dual',
  'b1000000-0000-0000-0000-000000000011',
  'active'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b1000000-0000-0000-0000-000000000010","role":"authenticated"}';

select throws_ok(
  $$select public.revoke_company_member_role(
    'b1000000-0000-0000-0000-000000000011', 'coordinator'
  )$$,
  'P0001',
  'No se puede quitar coordinación: hay proyectos activos',
  'no se quita coordinación mientras existan proyectos activos'
);

reset role;
update public.projects
set status = 'done'
where id = 'b1000000-0000-0000-0000-000000000020';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b1000000-0000-0000-0000-000000000010","role":"authenticated"}';

select lives_ok(
  $$select public.revoke_company_member_role(
    'b1000000-0000-0000-0000-000000000011', 'coordinator'
  )$$,
  'se puede quitar coordinación después de cerrar el proyecto'
);
select is(
  (
    select count(*)::integer
    from public.company_membership_roles
    where company_id = 'b1000000-0000-0000-0000-000000000001'
      and user_id = 'b1000000-0000-0000-0000-000000000011'
  ),
  1,
  'queda la capacidad de instalación'
);
select is(
  (
    select role
    from public.company_installers
    where company_id = 'b1000000-0000-0000-0000-000000000001'
      and installer_id = 'b1000000-0000-0000-0000-000000000011'
  ),
  'installer',
  'la proyección legacy vuelve a installer'
);

select * from finish();
rollback;
