-- Fase 3: funciones SECURITY DEFINER y policies de Storage multi-empresa.
--
-- Confirma que cada punto que antes dependía del rol global quedó conectado a
-- la membresía por empresa, y que Storage no usa una membresía sin rol (eso
-- abriría archivos ajenos a cualquier instalador del roster).
--
-- **Por qué el archivo tiene dos partes.** Antes era un único SELECT que
-- comparaba el TEXTO FUENTE de cada función con `like`. Siete de esas
-- aserciones fallaban desde hacía semanas, y ninguna señalaba un bug: la
-- lógica se había movido de lugar sin cambiar de comportamiento. Un ejemplo
-- de los siete: la guarda de «órdenes abiertas» ya no vive en `promote`, sino
-- en `revoke_company_member_role`, porque con roles duales ascender a
-- coordinación ya no quita la instalación — el riesgo aparece al QUITARLA.
-- La protección seguía intacta; el test miraba el lugar equivocado.
--
-- Esas siete se reescribieron para comprobar QUÉ HACE cada función, no cómo
-- está escrita. Eso obliga a cambiar de usuario entre asserts (`promote`
-- exige gerente, `accept_invitation` exige el invitado), y eso no entra en un
-- solo SELECT: por eso la segunda parte son sentencias sueltas. La primera
-- parte conserva el SELECT único, que sigue siendo cómodo de pegar en
-- Supabase Studio.
--
-- Lo que queda mirando texto fuente son las policies de Storage —donde el
-- texto de la policy ES lo que se quiere fijar— y unas pocas funciones
-- estables. Si alguna vuelve a fallar por un refactor sin cambio de conducta,
-- el arreglo es el mismo: reescribirla apuntando a comportamiento.

begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

-- ---------------------------------------------------------------------------
-- Parte 1 — Estructural: policies de Storage y funciones estables
-- ---------------------------------------------------------------------------

select msg from (
  select 1 as n, msg from ok(
    pg_get_functiondef('public.validate_project_relations()'::regprocedure)
      like '%company_installers%'
    and pg_get_functiondef('public.validate_project_relations()'::regprocedure)
      like '%role = ''coordinator''%',
    'validate_project_relations valida coordinador por membresía activa'
  ) msg

  union all
  select 2, msg from ok(
    pg_get_functiondef('public.replace_installer_weekly_availability(uuid,jsonb)'::regprocedure)
      like '%auth_has_company_role(p_company_id, ''installer''%',
    'la disponibilidad exige rol installer en la empresa elegida'
  ) msg

  union all
  select 3, msg from ok(
    pg_get_functiondef('public.touch_chat_thread()'::regprocedure)
      like '%auth_has_company_role(t.company_id, ''coordinator''%'
    and pg_get_functiondef('public.touch_chat_thread()'::regprocedure)
      like '%auth_has_company_role(t.company_id, ''installer''%',
    'touch_chat_thread reconoce ambos roles por membresía'
  ) msg

  union all
  select 4, msg from ok(
    pg_get_functiondef('public.broadcast_matches_installer(uuid)'::regprocedure)
      like '%company_installers%'
    and pg_get_functiondef('public.broadcast_matches_installer(uuid)'::regprocedure)
      not like '%from public.profiles%',
    'el matching de bolsa excluye empresas propias desde la única fuente de membresía'
  ) msg

  union all
  select 5, msg from ok(
    pg_get_functiondef('public.reject_broadcast_application(uuid,uuid)'::regprocedure)
      like '%auth_has_company_role(b.company_id, ''coordinator''%'
    and pg_get_functiondef('public.reject_broadcast_application(uuid,uuid)'::regprocedure)
      like '%can_operate_project(b.project_id)%',
    'reject_broadcast autoriza al coordinador del proyecto'
  ) msg

  union all
  select 6, msg from ok(
    pg_get_functiondef('public.close_broadcast(uuid)'::regprocedure)
      like '%auth_has_company_role(b.company_id, ''coordinator''%'
    and pg_get_functiondef('public.close_broadcast(uuid)'::regprocedure)
      like '%can_operate_project(b.project_id)%',
    'close_broadcast autoriza al coordinador del proyecto'
  ) msg

  union all
  select 7, msg from ok(
    (
      select with_check
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'evidence_upload'
    ) like '%auth_has_company_role%'
    and (
      select with_check
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'evidence_upload'
    ) like '%can_operate_project%'
    and (
      select with_check
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'evidence_upload'
    ) like '%assigned_installer_id%',
    'evidence_upload separa gerente/coordinador del instalador asignado'
  ) msg

  union all
  select 8, msg from ok(
    (
      select qual
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'evidence_read'
    ) like '%auth_has_company_role%'
    and (
      select qual
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'evidence_read'
    ) like '%can_operate_project%',
    'evidence_read limita al coordinador a los proyectos que opera'
  ) msg

  union all
  select 9, msg from ok(
    (
      select qual
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'evidence_company_delete'
    ) like '%auth_has_company_role%'
    and (
      select qual
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'evidence_company_delete'
    ) like '%can_operate_project%',
    'evidence delete mantiene el alcance de proyecto'
  ) msg

  union all
  select 10, msg from ok(
    (
      select with_check
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'chat_storage_upload'
    ) like '%auth_has_company_role%'
    and (
      select with_check
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'chat_storage_upload'
    ) like '%chat_threads%',
    'chat upload valida rol y thread, no sólo el prefijo'
  ) msg

  union all
  select 11, msg from ok(
    (
      select qual
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'chat_storage_read'
    ) like '%auth_has_company_role%'
    and (
      select qual
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'chat_storage_read'
    ) like '%chat_threads%',
    'chat read valida rol y thread'
  ) msg

  union all
  select 12, msg from is(
    (
      select count(*)::integer
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname in (
          'evidence_upload',
          'evidence_read',
          'evidence_company_delete',
          'chat_storage_upload',
          'chat_storage_read'
        )
    ),
    5,
    'las cinco policies sensibles existen exactamente una vez'
  ) msg

  union all
  select 13, msg from ok(
    not exists (
      select 1
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname in (
          'evidence_upload',
          'evidence_read',
          'evidence_company_delete',
          'chat_storage_upload',
          'chat_storage_read'
        )
        and coalesce(qual, '') || coalesce(with_check, '')
          like '%auth_companies%'
    ),
    'Storage nunca usa una membresía sin discriminar el rol'
  ) msg

  union all
  select 14, msg from ok(
    pg_get_functiondef('public.announcement_recipient_emails(uuid)'::regprocedure)
      like '%company_manager%'
    and pg_get_functiondef('public.announcement_recipient_emails(uuid)'::regprocedure)
      not like '%coordinator%',
    'los emails de anuncios siguen siendo exclusivos del gerente'
  ) msg
) results
order by n;

-- ---------------------------------------------------------------------------
-- Parte 2 — Comportamiento
--
-- Fixture: una empresa con gerente, un instalador, DOS coordinadores (uno
-- responsable del proyecto y otro que no lo es), un externo que se postula, y
-- alguien invitado. El segundo coordinador existe sólo para distinguir
-- «notifica al responsable» de «notifica a cualquier coordinador».
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, country, order_prefix)
values ('f1000000-0000-0000-0000-000000000001', 'Empresa F', 'AR', 'EFA');

insert into auth.users (id, email, raw_user_meta_data) values
  ('f1000000-0000-0000-0000-000000000011', 'gerente.f@test.dev',
   '{"role":"company_manager","company_id":"f1000000-0000-0000-0000-000000000001"}'::jsonb),
  ('f1000000-0000-0000-0000-000000000012', 'instalador.f@test.dev', '{"role":"installer"}'::jsonb),
  ('f1000000-0000-0000-0000-000000000013', 'coordinador.f@test.dev', '{"role":"installer"}'::jsonb),
  ('f1000000-0000-0000-0000-000000000014', 'externo.f@test.dev', '{"role":"installer"}'::jsonb),
  ('f1000000-0000-0000-0000-000000000015', 'coordinador2.f@test.dev', '{"role":"installer"}'::jsonb),
  ('f1000000-0000-0000-0000-000000000016', 'invitado.f@test.dev', '{"role":"installer"}'::jsonb);

insert into public.installers (id) values
  ('f1000000-0000-0000-0000-000000000012'),
  ('f1000000-0000-0000-0000-000000000013'),
  ('f1000000-0000-0000-0000-000000000014'),
  ('f1000000-0000-0000-0000-000000000015'),
  ('f1000000-0000-0000-0000-000000000016')
on conflict (id) do nothing;

-- El alta en el roster crea sola la fila de `company_membership_roles`.
insert into public.company_installers (company_id, installer_id, role, status, joined_at) values
  ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000012', 'installer', 'active', now()),
  ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000013', 'coordinator', 'active', now()),
  ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000015', 'coordinator', 'active', now());

insert into public.clients (id, company_id, name) values
  ('f1000000-0000-0000-0000-000000000021', 'f1000000-0000-0000-0000-000000000001', 'Cliente F');

-- El coordinador 13 es el responsable; el 15 no lo es.
insert into public.projects (id, company_id, client_id, coordinator_id, name, country, zones) values
  ('f1000000-0000-0000-0000-000000000031', 'f1000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000021', 'f1000000-0000-0000-0000-000000000013',
   'Proyecto F', 'AR', array['Buenos Aires']);

insert into public.sites (id, project_id, company_id, name) values
  ('f1000000-0000-0000-0000-000000000041', 'f1000000-0000-0000-0000-000000000031',
   'f1000000-0000-0000-0000-000000000001', 'Punto F');

insert into public.work_orders (id, site_id, project_id, company_id, title, assigned_installer_id, status) values
  ('f1000000-0000-0000-0000-000000000051', 'f1000000-0000-0000-0000-000000000041',
   'f1000000-0000-0000-0000-000000000031', 'f1000000-0000-0000-0000-000000000001',
   'Orden abierta del instalador', 'f1000000-0000-0000-0000-000000000012', 'en_proceso'),
  ('f1000000-0000-0000-0000-000000000052', 'f1000000-0000-0000-0000-000000000041',
   'f1000000-0000-0000-0000-000000000031', 'f1000000-0000-0000-0000-000000000001',
   'Orden sin asignar', null, 'pendiente');

insert into public.chat_threads (company_id, installer_id) values
  ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000012')
on conflict (company_id, installer_id) do nothing;

insert into public.broadcasts (id, company_id, project_id, zone, title, status) values
  ('f1000000-0000-0000-0000-000000000091', 'f1000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000031', 'Buenos Aires', 'Convocatoria F', 'open');

-- --- Ascenso y descenso -----------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select public.promote_installer_to_coordinator('f1000000-0000-0000-0000-000000000012');

reset role;
select is(
  (
    select string_agg(role, '+' order by role)
    from public.company_membership_roles
    where company_id = 'f1000000-0000-0000-0000-000000000001'
      and user_id = 'f1000000-0000-0000-0000-000000000012'
  ),
  'coordinator+installer',
  'ascender suma la coordinación SIN quitar la instalación (modelo de rol dual)'
);

-- La guarda de «órdenes abiertas» vive acá, no en el ascenso: con rol dual,
-- ascender ya no deja huérfano ningún trabajo — quitar la instalación sí.
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
  $$select public.revoke_company_member_role(
      'f1000000-0000-0000-0000-000000000012', 'installer')$$,
  'P0001',
  null,
  'no se puede quitar la instalación a alguien con órdenes abiertas'
);

select public.demote_coordinator_to_installer('f1000000-0000-0000-0000-000000000012');

reset role;
select ok(
  (
    select string_agg(role, '+' order by role)
    from public.company_membership_roles
    where company_id = 'f1000000-0000-0000-0000-000000000001'
      and user_id = 'f1000000-0000-0000-0000-000000000012'
  ) = 'installer'
  and exists (
    select 1 from public.installers
    where id = 'f1000000-0000-0000-0000-000000000012'
  )
  and (
    select role from public.company_installers
    where company_id = 'f1000000-0000-0000-0000-000000000001'
      and installer_id = 'f1000000-0000-0000-0000-000000000012'
  ) = 'installer',
  'descender deja sólo instalación, conserva la ficha de oficio y ajusta el rol legacy'
);

-- --- Invitación -------------------------------------------------------------

insert into public.invitations (id, company_id, email, token, status, role, expires_at) values
  ('f1000000-0000-0000-0000-0000000000a1', 'f1000000-0000-0000-0000-000000000001',
   'invitado.f@test.dev', 'f1000000-0000-0000-0000-0000000000b1',
   'pending', 'coordinator', now() + interval '7 days');

set local role authenticated;
-- El email va en el token: `accept_invitation` compara contra el JWT, no
-- contra `auth.users`.
set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000016","email":"invitado.f@test.dev","role":"authenticated"}';

select public.accept_invitation('f1000000-0000-0000-0000-0000000000b1');

reset role;
select ok(
  (
    select string_agg(role, '+' order by role)
    from public.company_membership_roles
    where company_id = 'f1000000-0000-0000-0000-000000000001'
      and user_id = 'f1000000-0000-0000-0000-000000000016'
  ) = 'coordinator'
  and (
    select status from public.company_installers
    where company_id = 'f1000000-0000-0000-0000-000000000001'
      and installer_id = 'f1000000-0000-0000-0000-000000000016'
  ) = 'active'
  and (
    select status from public.invitations
    where id = 'f1000000-0000-0000-0000-0000000000a1'
  ) = 'accepted',
  'aceptar una invitación aplica el rol a la membresía y activa el roster'
);

-- --- Notificaciones ---------------------------------------------------------

insert into public.order_updates (id, order_id, company_id, installer_id, type, note) values
  ('f1000000-0000-0000-0000-000000000061', 'f1000000-0000-0000-0000-000000000051',
   'f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000012',
   'progress', 'Avance de prueba');

insert into public.broadcast_applications (broadcast_id, installer_id) values
  ('f1000000-0000-0000-0000-000000000091', 'f1000000-0000-0000-0000-000000000014');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000012","role":"authenticated"}';
insert into public.chat_messages (id, thread_id, company_id, sender_id, body)
select 'f1000000-0000-0000-0000-000000000081', t.id, t.company_id,
       'f1000000-0000-0000-0000-000000000012', 'Hola'
  from public.chat_threads t
 where t.company_id = 'f1000000-0000-0000-0000-000000000001'
   and t.installer_id = 'f1000000-0000-0000-0000-000000000012';
reset role;

-- El coordinador 15 es el control: está activo en la misma empresa pero NO
-- coordina este proyecto. Si recibiera estos avisos, la notificación estaría
-- yendo a un rol global en vez de a quien es responsable.
select ok(
  (
    select count(*) from public.notifications
    where user_id = 'f1000000-0000-0000-0000-000000000013' and type = 'update_received'
  ) = 1
  and (
    select count(*) from public.notifications
    where user_id = 'f1000000-0000-0000-0000-000000000015' and type = 'update_received'
  ) = 0,
  'los avances notifican al coordinador responsable del proyecto, no a todos'
);

select ok(
  (
    select count(*) from public.notifications
    where user_id = 'f1000000-0000-0000-0000-000000000013' and type = 'application_received'
  ) = 1
  and (
    select count(*) from public.notifications
    where user_id = 'f1000000-0000-0000-0000-000000000015' and type = 'application_received'
  ) = 0,
  'las postulaciones notifican al coordinador responsable, no a un rol global'
);

-- El chat sí es de alcance empresa: no cuelga de ningún proyecto.
select is(
  (
    select count(*)::integer from public.notifications
    where type = 'chat_message'
      and user_id in (
        'f1000000-0000-0000-0000-000000000013',
        'f1000000-0000-0000-0000-000000000015'
      )
  ),
  2,
  'el chat notifica a TODOS los coordinadores activos de esa empresa'
);

-- --- Aceptar una postulación ------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000013","role":"authenticated"}';

-- `assign_installer_gate` (Fase 3 de agenda) exige que la actividad exista
-- antes de poder asignar; esta orden se insertó como fixture directo, sin
-- pasar por `create_order_activities`.
select public.create_order_activities(
  'f1000000-0000-0000-0000-000000000052', false, true
);

select public.accept_broadcast_application(
  'f1000000-0000-0000-0000-000000000091',
  'f1000000-0000-0000-0000-000000000014',
  array['f1000000-0000-0000-0000-000000000052']::uuid[]
);

reset role;
select ok(
  (
    select string_agg(role, '+' order by role)
    from public.company_membership_roles
    where company_id = 'f1000000-0000-0000-0000-000000000001'
      and user_id = 'f1000000-0000-0000-0000-000000000014'
  ) = 'installer'
  and (
    select status from public.company_installers
    where company_id = 'f1000000-0000-0000-0000-000000000001'
      and installer_id = 'f1000000-0000-0000-0000-000000000014'
  ) = 'active'
  and (
    select assigned_installer_id from public.work_orders
    where id = 'f1000000-0000-0000-0000-000000000052'
  ) = 'f1000000-0000-0000-0000-000000000014',
  'el coordinador del proyecto acepta la postulación: crea membresía installer y asigna la orden'
);

select * from finish();

rollback;
