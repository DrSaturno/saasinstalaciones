-- Subcuentas y permisos del gerente (SUBCTA-*, docs/specs/2026-09-24-subcuentas-permisos).
--
-- Una subcuenta es un `company_manager` más (is_owner = false): opera todo lo operativo igual
-- que el dueño porque las políticas operativas nunca distinguen entre los dos. Este archivo
-- prueba las tres excepciones (finanzas, configuración, gestión de subcuentas) y el aislamiento
-- entre empresas — no vuelve a probar lo operativo, que ya cubren las suites de cada módulo.

begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

-- ---------------------------------------------------------------------------
-- Fixture: dos empresas; en A un dueño y DOS subcuentas (una con permisos
-- completos, otra sin ninguno — sirve para probar «ve la propia, no la
-- ajena»); otra empresa B con su propio dueño.
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, country, order_prefix) values
  ('ac000000-0000-0000-0000-000000000001', 'Empresa A', 'AR', 'SCA'),
  ('ac000000-0000-0000-0000-000000000002', 'Empresa B', 'AR', 'SCB');

insert into auth.users (id, email, raw_app_meta_data) values
  ('ac000000-0000-0000-0000-000000000011', 'dueno.a@test.dev',
   '{"role":"company_manager","company_id":"ac000000-0000-0000-0000-000000000001"}'::jsonb),
  ('ac000000-0000-0000-0000-000000000012', 'sub.a@test.dev',
   '{"role":"company_manager","company_id":"ac000000-0000-0000-0000-000000000001","is_owner":false}'::jsonb),
  ('ac000000-0000-0000-0000-000000000013', 'dueno.b@test.dev',
   '{"role":"company_manager","company_id":"ac000000-0000-0000-0000-000000000002"}'::jsonb),
  ('ac000000-0000-0000-0000-000000000015', 'sub2.a@test.dev',
   '{"role":"company_manager","company_id":"ac000000-0000-0000-0000-000000000001","is_owner":false}'::jsonb);

insert into public.clients (id, company_id, name) values
  ('ac000000-0000-0000-0000-000000000021', 'ac000000-0000-0000-0000-000000000001', 'Cliente A');

-- ---------------------------------------------------------------------------
-- El trigger de alta ya distingue dueño de subcuenta por sí solo
-- ---------------------------------------------------------------------------

select is(
  (select is_owner from public.profiles where id = 'ac000000-0000-0000-0000-000000000011'),
  true,
  'sin is_owner en la metadata, el alta de gerente sigue siendo dueño (compatibilidad)'
);
select is(
  (select is_owner from public.profiles where id = 'ac000000-0000-0000-0000-000000000012'),
  false,
  'con is_owner:false en la metadata, la cuenta nace como subcuenta'
);

-- ---------------------------------------------------------------------------
-- Lo operativo: la subcuenta opera exactamente igual que el dueño
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"ac000000-0000-0000-0000-000000000012","role":"authenticated"}';

select lives_ok(
  $$insert into public.projects (id, company_id, client_id, name, country, zones)
    values ('ac000000-0000-0000-0000-000000000031', 'ac000000-0000-0000-0000-000000000001',
            'ac000000-0000-0000-0000-000000000021', 'Proyecto de la subcuenta', 'AR',
            array['Buenos Aires'])$$,
  'SUBCTA-R2.1: la subcuenta crea un proyecto igual que el dueño'
);

select is(
  (select count(*)::integer from public.projects
    where company_id = 'ac000000-0000-0000-0000-000000000001'),
  1,
  'y lo ve después'
);

-- ---------------------------------------------------------------------------
-- Sin permisos: ni finanzas ni configuración
-- ---------------------------------------------------------------------------

select is(
  public.auth_can_see_commercials('ac000000-0000-0000-0000-000000000001'),
  false,
  'SUBCTA-R2.2: sin permiso, la subcuenta no ve importes comerciales'
);

select throws_ok(
  $$select public.set_company_min_completion_photos(5::smallint)$$,
  'P0001',
  'Acceso denegado',
  'SUBCTA-R2.3: sin permiso, la subcuenta no cambia la configuración de la empresa'
);

-- ---------------------------------------------------------------------------
-- Ni siquiera con los dos permisos activados gestiona subcuentas (SUBCTA-R2.4)
-- ---------------------------------------------------------------------------

reset role;
insert into public.company_staff_permissions (user_id, company_id, can_manage_finance, can_manage_settings) values
  ('ac000000-0000-0000-0000-000000000012', 'ac000000-0000-0000-0000-000000000001', true, true),
  ('ac000000-0000-0000-0000-000000000015', 'ac000000-0000-0000-0000-000000000001', false, false);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"ac000000-0000-0000-0000-000000000012","role":"authenticated"}';

select throws_ok(
  $$insert into public.invitations (company_id, email, role)
    values ('ac000000-0000-0000-0000-000000000001', 'nueva@test.dev', 'company_staff')$$,
  '42501',
  null,
  'AC-SUBCTA-D: con los dos permisos igual no puede invitar a otra subcuenta'
);

-- SUBCTA-R1.4 (ve la propia) y SUBCTA-R2.4 (no ve la ajena) a la vez: si sólo
-- se contara el total, «1» sería ambiguo entre «ve la suya» y «ve la de otro».
select is(
  (
    select count(*)::integer from public.company_staff_permissions
    where user_id = 'ac000000-0000-0000-0000-000000000012'
  ),
  1,
  'SUBCTA-R1.4: la subcuenta ve su propia fila de permisos'
);

select is(
  (
    select count(*)::integer from public.company_staff_permissions
    where user_id = 'ac000000-0000-0000-0000-000000000015'
  ),
  0,
  'AC-SUBCTA-D: pero no la de otra subcuenta de la misma empresa'
);

-- ---------------------------------------------------------------------------
-- Con permiso de finanzas, sí ve importes; sin volver a iniciar sesión
-- ---------------------------------------------------------------------------

select is(
  public.auth_can_see_commercials('ac000000-0000-0000-0000-000000000001'),
  true,
  'SUBCTA-R3.1/AC-SUBCTA-C: activado el permiso, la MISMA sesión ya ve importes'
);

-- Configuración: sigue sin poder, porque el permiso que se le dio fue leído
-- desde una fila creada por otra vía (la insertó el dueño); se prueba también
-- que `can_manage_settings` sí habilita.
select lives_ok(
  $$select public.set_company_min_completion_photos(5::smallint)$$,
  'SUBCTA-R3.1: con can_manage_settings, la subcuenta sí cambia la configuración'
);

select is(
  (select min_completion_photos from public.companies
    where id = 'ac000000-0000-0000-0000-000000000001'),
  5::smallint,
  'y el valor quedó guardado'
);

reset role;

-- ---------------------------------------------------------------------------
-- El dueño sí gestiona subcuentas
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"ac000000-0000-0000-0000-000000000011","role":"authenticated"}';

-- El token se guarda en una tabla temporal (sin RLS propia) para poder usarlo
-- más abajo con la sesión de la subcuenta: así llega en la app real, por la
-- URL de la invitación, no por una consulta a `invitations` — que la propia
-- invitada no tiene por qué poder leer directamente.
create temp table _staff_invite_token (token uuid);

select lives_ok(
  $$with nueva as (
      insert into public.invitations (
        company_id, email, role, staff_can_manage_finance, staff_can_manage_settings
      ) values (
        'ac000000-0000-0000-0000-000000000001', 'nueva.sub@test.dev', 'company_staff', true, false
      )
      returning token
    )
    insert into _staff_invite_token select token from nueva$$,
  'SUBCTA-R1.1: el dueño sí invita una subcuenta, con el permiso ya decidido'
);

select is(
  (select count(*)::integer from public.company_staff_permissions),
  2,
  'y sí ve/gestiona las fichas de permisos de sus dos subcuentas'
);

select lives_ok(
  $$update public.company_staff_permissions
    set can_manage_settings = true
    where user_id = 'ac000000-0000-0000-0000-000000000012'$$,
  'SUBCTA-R3.1: el dueño ajusta el permiso cuando quiere'
);

reset role;

-- ---------------------------------------------------------------------------
-- Aislamiento entre empresas (AC-SUBCTA-E)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"ac000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  (select count(*)::integer from public.company_staff_permissions),
  0,
  'el dueño de la empresa B no ve las subcuentas de la empresa A'
);

select is(
  (select count(*)::integer from public.invitations where role = 'company_staff'),
  0,
  'ni sus invitaciones de subcuenta'
);

-- Un UPDATE que la RLS no autoriza no lanza error: simplemente no encuentra la
-- fila (USING no matchea). Por eso se comprueba el efecto —cero filas
-- tocadas, permiso sin cambiar— y no la excepción.
with intento as (
  update public.company_staff_permissions
     set can_manage_finance = true
   where user_id = 'ac000000-0000-0000-0000-000000000012'
  returning 1
)
select count(*)::integer as filas into temp table _fuga_entre_empresas from intento;

select is(
  (select filas from _fuga_entre_empresas),
  0,
  'el dueño de la empresa B no puede tocar el permiso de una subcuenta de A'
);

reset role;

-- ---------------------------------------------------------------------------
-- accept_company_staff_invitation
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_app_meta_data) values
  ('ac000000-0000-0000-0000-000000000014', 'nueva.sub@test.dev',
   '{"role":"company_manager","company_id":"ac000000-0000-0000-0000-000000000001","is_owner":false}'::jsonb);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"ac000000-0000-0000-0000-000000000014","role":"authenticated","email":"nueva.sub@test.dev"}';

select lives_ok(
  $$select public.accept_company_staff_invitation(
      (select token from _staff_invite_token)
    )$$,
  'la subcuenta recién creada acepta su invitación'
);

select throws_ok(
  $$select public.accept_company_staff_invitation(
      (select token from _staff_invite_token)
    )$$,
  'P0001',
  'Invitación inválida o vencida',
  'aceptarla dos veces falla: ya no está pending'
);

-- Se verifica el resultado fuera de la sesión restringida de la subcuenta: no
-- tiene por qué poder leer directamente `invitations`, y la función ya
-- demostró (arriba) que aceptar dos veces falla, que es la prueba indirecta
-- de que la primera vez sí quedó marcada.
reset role;

select is(
  (select can_manage_finance from public.company_staff_permissions
    where user_id = 'ac000000-0000-0000-0000-000000000014'),
  true,
  'y queda con el permiso que el dueño le dio al invitarla (finance sí, settings no)'
);

select is(
  (select status from public.invitations where email = 'nueva.sub@test.dev'),
  'accepted',
  'la invitación queda aceptada'
);

select * from finish();

rollback;
