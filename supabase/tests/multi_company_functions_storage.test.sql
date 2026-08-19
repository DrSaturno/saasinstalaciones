-- Fase 3: funciones SECURITY DEFINER y policies de Storage multi-empresa.
--
-- Este test es estructural: confirma que cada punto que antes dependía del rol
-- global quedó conectado a la membresía por empresa y que Storage no usa una
-- membresía sin rol (eso abriría archivos ajenos a cualquier instalador del
-- roster).
--
-- Todos los asserts se devuelven en un único SELECT porque Supabase Studio
-- muestra sólo el resultado de la última sentencia del script.

begin;

create extension if not exists pgtap with schema extensions;

-- Se emite SOLO la columna de texto: pg_prove lee TAP de la salida de psql y
-- una segunda columna la vuelve ilegible («No subtests run»). El `order by n`
-- se conserva porque el orden de un union all no esta garantizado y TAP se lee
-- en secuencia. Sigue sirviendo para pegar en Supabase Studio.
select msg from (
  select 0 as n, msg from plan(21) msg

  union all
  select 1, msg from ok(
    pg_get_functiondef('public.validate_project_relations()'::regprocedure)
      like '%company_installers%'
    and pg_get_functiondef('public.validate_project_relations()'::regprocedure)
      like '%role = ''coordinator''%',
    'validate_project_relations valida coordinador por membresía activa'
  ) msg

  union all
  select 2, msg from ok(
    pg_get_functiondef('public.promote_installer_to_coordinator(uuid)'::regprocedure)
      like '%update public.company_installers%'
    and pg_get_functiondef('public.promote_installer_to_coordinator(uuid)'::regprocedure)
      like '%órdenes abiertas%'
    and pg_get_functiondef('public.promote_installer_to_coordinator(uuid)'::regprocedure)
      not like '%update public.profiles%set role = ''coordinator''%',
    'promote cambia la membresía y bloquea ascensos con órdenes abiertas'
  ) msg

  union all
  select 3, msg from ok(
    pg_get_functiondef('public.demote_coordinator_to_installer(uuid)'::regprocedure)
      like '%update public.company_installers%'
    and pg_get_functiondef('public.demote_coordinator_to_installer(uuid)'::regprocedure)
      like '%insert into public.installers%'
    and pg_get_functiondef('public.demote_coordinator_to_installer(uuid)'::regprocedure)
      like '%set role = ''installer''%',
    'demote cambia sólo esa membresía, crea ficha de oficio y retira el legacy'
  ) msg

  union all
  select 4, msg from ok(
    pg_get_functiondef('public.accept_invitation(uuid)'::regprocedure)
      like '%Ya tenés otro rol activo en esta empresa%'
    and pg_get_functiondef('public.accept_invitation(uuid)'::regprocedure)
      like '%role = excluded.role%'
    and pg_get_functiondef('public.accept_invitation(uuid)'::regprocedure)
      not like '%auth_role() is distinct from v_inv.role%',
    'accept_invitation aplica el rol a la membresía y rechaza conflictos locales'
  ) msg

  union all
  select 5, msg from ok(
    pg_get_functiondef('public.replace_installer_weekly_availability(uuid,jsonb)'::regprocedure)
      like '%auth_has_company_role(p_company_id, ''installer''%',
    'la disponibilidad exige rol installer en la empresa elegida'
  ) msg

  union all
  select 6, msg from ok(
    pg_get_functiondef('public.touch_chat_thread()'::regprocedure)
      like '%auth_has_company_role(t.company_id, ''coordinator''%'
    and pg_get_functiondef('public.touch_chat_thread()'::regprocedure)
      like '%auth_has_company_role(t.company_id, ''installer''%',
    'touch_chat_thread reconoce ambos roles por membresía'
  ) msg

  union all
  select 7, msg from ok(
    pg_get_functiondef('public.broadcast_matches_installer(uuid)'::regprocedure)
      like '%company_installers%'
    and pg_get_functiondef('public.broadcast_matches_installer(uuid)'::regprocedure)
      not like '%from public.profiles%',
    'el matching de bolsa excluye empresas propias desde la única fuente de membresía'
  ) msg

  union all
  select 8, msg from ok(
    pg_get_functiondef('public.accept_broadcast_application(uuid,uuid,uuid[])'::regprocedure)
      like '%auth_has_company_role(b.company_id, ''coordinator''%'
    and pg_get_functiondef('public.accept_broadcast_application(uuid,uuid,uuid[])'::regprocedure)
      like '%can_operate_project(b.project_id)%'
    and pg_get_functiondef('public.accept_broadcast_application(uuid,uuid,uuid[])'::regprocedure)
      like '%role = ''installer''%',
    'accept_broadcast autoriza al coordinador del proyecto y crea membresía installer'
  ) msg

  union all
  select 9, msg from ok(
    pg_get_functiondef('public.reject_broadcast_application(uuid,uuid)'::regprocedure)
      like '%auth_has_company_role(b.company_id, ''coordinator''%'
    and pg_get_functiondef('public.reject_broadcast_application(uuid,uuid)'::regprocedure)
      like '%can_operate_project(b.project_id)%',
    'reject_broadcast autoriza al coordinador del proyecto'
  ) msg

  union all
  select 10, msg from ok(
    pg_get_functiondef('public.close_broadcast(uuid)'::regprocedure)
      like '%auth_has_company_role(b.company_id, ''coordinator''%'
    and pg_get_functiondef('public.close_broadcast(uuid)'::regprocedure)
      like '%can_operate_project(b.project_id)%',
    'close_broadcast autoriza al coordinador del proyecto'
  ) msg

  union all
  select 11, msg from ok(
    pg_get_functiondef('public.notify_broadcast_application()'::regprocedure)
      like '%ci.role = ''coordinator''%'
    and pg_get_functiondef('public.notify_broadcast_application()'::regprocedure)
      like '%pr.coordinator_id = p.id%',
    'las postulaciones notifican al coordinador responsable, no a un rol global'
  ) msg

  union all
  select 12, msg from ok(
    pg_get_functiondef('public.notify_order_update()'::regprocedure)
      like '%ci.role = ''coordinator''%'
    and pg_get_functiondef('public.notify_order_update()'::regprocedure)
      like '%pr.coordinator_id = p.id%',
    'los avances notifican al coordinador responsable del proyecto'
  ) msg

  union all
  select 13, msg from ok(
    pg_get_functiondef('public.notify_chat_message()'::regprocedure)
      like '%company_installers%'
    and pg_get_functiondef('public.notify_chat_message()'::regprocedure)
      like '%ci.role = ''coordinator''%',
    'el chat notifica a coordinadores activos de esa empresa'
  ) msg

  union all
  select 14, msg from ok(
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
  select 15, msg from ok(
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
  select 16, msg from ok(
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
  select 17, msg from ok(
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
  select 18, msg from ok(
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
  select 19, msg from is(
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
  select 20, msg from ok(
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
  select 21, msg from ok(
    pg_get_functiondef('public.announcement_recipient_emails(uuid)'::regprocedure)
      like '%company_manager%'
    and pg_get_functiondef('public.announcement_recipient_emails(uuid)'::regprocedure)
      not like '%coordinator%',
    'los emails de anuncios siguen siendo exclusivos del gerente'
  ) msg

  union all
  select 22, msg from finish() msg
) results
order by n;

rollback;
