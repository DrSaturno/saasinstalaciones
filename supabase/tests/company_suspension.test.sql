-- Gate funcional de R0-FIX-01. Comprueba que una suspensión afecte a una
-- sesión ya emitida y que un usuario multiempresa conserve su tenant activo.

begin;

select plan(12);

insert into public.companies (id, name, country, status, order_prefix) values
  ('bbbbbbbb-0000-0000-0000-00000000000a', 'Suspendida A', 'AR', 'suspended', 'SUA'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Activa B', 'AR', 'active', 'ACB');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated',
  'manager@suspension.invalid', extensions.crypt('x', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}',
  '{"role":"company_manager","company_id":"bbbbbbbb-0000-0000-0000-00000000000a","full_name":"Manager suspendido"}',
  now(), now(), '', '', '', '', '', '', '', ''
), (
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated',
  'field@suspension.invalid', extensions.crypt('x', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}',
  '{"role":"installer","full_name":"Campo multiempresa"}',
  now(), now(), '', '', '', '', '', '', '', ''
);

insert into public.company_installers (
  company_id, installer_id, role, status, joined_at
) values
  ('bbbbbbbb-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-0000000000f2', 'installer', 'active', now()),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-0000000000f2', 'installer', 'active', now());

insert into public.projects (id, company_id, name) values
  ('bbbbbbbb-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-00000000000a', 'Proyecto A'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Proyecto B');

insert into public.sites (id, project_id, company_id, name) values
  ('bbbbbbbb-0000-0000-0000-0000000000a2', 'bbbbbbbb-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-00000000000a', 'Sitio A'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Sitio B');

insert into public.work_orders (
  id, order_number, site_id, project_id, company_id, title,
  assigned_installer_id
) values
  ('bbbbbbbb-0000-0000-0000-0000000000a3', 'SUSP-A', 'bbbbbbbb-0000-0000-0000-0000000000a2', 'bbbbbbbb-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-00000000000a', 'Orden A', 'bbbbbbbb-0000-0000-0000-0000000000f2'),
  ('bbbbbbbb-0000-0000-0000-0000000000b3', 'ACT-B', 'bbbbbbbb-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Orden B', 'bbbbbbbb-0000-0000-0000-0000000000f2');

insert into public.invitations (
  id, company_id, email, token, role, status, expires_at
) values (
  'bbbbbbbb-0000-0000-0000-0000000000a4',
  'bbbbbbbb-0000-0000-0000-00000000000a',
  'field@suspension.invalid',
  'bbbbbbbb-0000-0000-0000-0000000000a5',
  'installer',
  'pending',
  now() + interval '1 day'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-0000000000f1","role":"authenticated"}';

select is(
  public.auth_company(),
  null::uuid,
  'el gerente suspendido no obtiene auth_company'
);

select is(
  (select count(*)::integer from public.projects),
  0,
  'una sesión vigente del gerente no lee datos tenant suspendidos'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-0000000000f2","role":"authenticated"}';

select is(
  (select count(*)::integer from public.auth_companies()),
  1,
  'el usuario multiempresa conserva sólo su empresa activa'
);

select is(
  public.auth_has_company_role(
    'bbbbbbbb-0000-0000-0000-00000000000a', 'installer'
  ),
  false,
  'la membresía de la empresa suspendida no autoriza'
);

select is(
  public.auth_has_company_role(
    'bbbbbbbb-0000-0000-0000-00000000000b', 'installer'
  ),
  true,
  'la membresía de la otra empresa sigue autorizando'
);

select is(
  (select count(*)::integer from public.companies),
  1,
  'el selector de empresas oculta el tenant suspendido'
);

select is(
  (select count(*)::integer from public.company_installers),
  1,
  'el roster propio expone sólo memberships de tenants activos'
);

select is(
  (select count(*)::integer from public.work_orders),
  1,
  'las órdenes asignadas del tenant suspendido quedan bloqueadas'
);

select is(
  (select count(*)::integer from public.sites),
  1,
  'las locaciones derivadas del tenant suspendido quedan bloqueadas'
);

select is(
  (select count(*)::integer from public.notifications),
  1,
  'las notificaciones tenant también se filtran por empresa activa'
);

select throws_ok(
  $test$
    select public.accept_invitation(
      'bbbbbbbb-0000-0000-0000-0000000000a5'
    )
  $test$,
  'P0001',
  'Invitación inválida o vencida',
  'no se puede aceptar una invitación de un tenant suspendido'
);

reset role;

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and policyname in (
        'evidence_upload', 'evidence_read',
        'chat_storage_upload', 'chat_storage_read'
      )
      and (
        coalesce(qual, '') || coalesce(with_check, '')
      ) like '%company_path_is_active%'
  ),
  4,
  'las cuatro policies de Storage aplican el gate de empresa activa'
);

select * from finish();
rollback;
