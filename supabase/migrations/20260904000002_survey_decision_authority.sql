-- Fase 2 de relevamiento y ejecución: quién aprueba (DEC-15).
--
-- Hasta ahora `decide_survey_submission` usaba `auth_can_operate_work_activity`,
-- que incluye al gerente. El requisito dice lo contrario con todas las letras:
-- "la aprobación del relevamiento no deberá depender directamente de la empresa
-- como instancia operativa, sino del coordinador responsable".
--
-- **DEC-15, cerrada el 02-09-2026.** Aprueba el coordinador del proyecto. El
-- gerente sólo cuando el proyecto NO tiene coordinador asignado — que es un
-- caso real y no una excepción teórica: `projects.coordinator_id` es nullable
-- a propósito, para que una empresa nueva pueda crear su primer proyecto sin
-- tener a nadie cargado todavía. Sin ese fallback, un relevamiento de un
-- proyecto sin coordinador quedaría imposible de aprobar para siempre.
--
-- Y cada uso del fallback queda marcado, para que después se pueda ver cuántas
-- veces la empresa decidió en lugar de un coordinador. Una excepción que no se
-- puede contar deja de ser una excepción.

alter table public.survey_submission_decisions
  add column if not exists used_manager_fallback boolean not null default false;

comment on column public.survey_submission_decisions.used_manager_fallback is
  'DEC-15: true cuando decidió el gerente porque el proyecto no tenía coordinador asignado. Permite auditar cuán seguido se usa la excepción.';

-- ---------------------------------------------------------------------------
-- Quién puede decidir sobre un relevamiento
-- ---------------------------------------------------------------------------

create or replace function public.survey_decision_authority(p_activity_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  -- 'coordinator' | 'manager_fallback' | null (no puede decidir)
  select case
    when exists (
      select 1
      from public.work_activities a
      join public.work_orders w on w.id = a.work_order_id
      join public.projects p on p.id = w.project_id
      where a.id = p_activity_id
        and p.coordinator_id = auth.uid()
    ) then 'coordinator'
    when exists (
      select 1
      from public.work_activities a
      join public.work_orders w on w.id = a.work_order_id
      join public.projects p on p.id = w.project_id
      where a.id = p_activity_id
        and p.coordinator_id is null
        and public.auth_role() = 'company_manager'
        and w.company_id = public.auth_company()
    ) then 'manager_fallback'
    else null
  end;
$$;

revoke all on function public.survey_decision_authority(uuid) from public;
grant execute on function public.survey_decision_authority(uuid) to authenticated;

comment on function public.survey_decision_authority(uuid) is
  'DEC-15. Devuelve con qué autoridad decide quien llama: coordinador del proyecto, gerente por ausencia de coordinador, o null.';

-- ---------------------------------------------------------------------------
-- La decisión, ahora con la autoridad correcta
--
-- Se conserva TODO lo que la función ya hacía bien —idempotencia por
-- operation_id con detección de reúso, prohibición de autoaprobarse, exigir la
-- última versión, notificar al autor en su idioma— y sólo cambia quién pasa el
-- control de acceso.
-- ---------------------------------------------------------------------------

create or replace function public.decide_survey_submission(
  p_operation_id uuid,
  p_submission_id uuid,
  p_decision text,
  p_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.survey_submissions%rowtype;
  v_existing public.survey_submission_decisions%rowtype;
  v_decision_id uuid;
  v_project_id uuid;
  v_locale text := 'es';
  v_authority text;
begin
  if auth.uid() is null then
    raise exception 'ACCESS_DENIED';
  end if;
  if p_operation_id is null then
    raise exception 'OPERATION_ID_REQUIRED';
  end if;
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'INVALID_SURVEY_DECISION';
  end if;
  if p_decision = 'changes_requested'
     and char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'SURVEY_DECISION_REASON_REQUIRED';
  end if;

  select d.* into v_existing
  from public.survey_submission_decisions d
  where d.operation_id = p_operation_id;

  if found then
    if v_existing.reviewer_id is distinct from auth.uid()
       or v_existing.submission_id is distinct from p_submission_id
       or v_existing.decision is distinct from p_decision
       or v_existing.reason is distinct from coalesce(p_reason, '') then
      raise exception 'OPERATION_ID_REUSED';
    end if;
    return v_existing.id;
  end if;

  select ss.* into v_submission
  from public.survey_submissions ss
  where ss.id = p_submission_id
  for update;
  if not found then
    raise exception 'ACCESS_DENIED';
  end if;

  -- DEC-15: acá está el cambio. Ya no alcanza con poder operar la orden.
  v_authority := public.survey_decision_authority(v_submission.activity_id);
  if v_authority is null then
    raise exception 'SURVEY_DECISION_NOT_YOURS';
  end if;

  if v_submission.author_id is not null
     and v_submission.author_id = auth.uid() then
    raise exception 'SELF_APPROVAL_FORBIDDEN';
  end if;
  if v_submission.status <> 'submitted' then
    raise exception 'SURVEY_NOT_AWAITING_REVIEW';
  end if;
  if exists (
    select 1 from public.survey_submissions newer
    where newer.activity_id = v_submission.activity_id
      and newer.version > v_submission.version
  ) then
    raise exception 'SURVEY_DECISION_REQUIRES_LATEST_VERSION';
  end if;

  insert into public.survey_submission_decisions (
    company_id, submission_id, operation_id, correlation_id,
    decision, reason, reviewer_id, used_manager_fallback
  ) values (
    v_submission.company_id, v_submission.id, p_operation_id, p_operation_id,
    p_decision, coalesce(p_reason, ''), auth.uid(),
    v_authority = 'manager_fallback'
  )
  returning id into v_decision_id;

  update public.survey_submissions
  set status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      approved_by = case when p_decision = 'approved' then auth.uid() else null end,
      approved_at = case when p_decision = 'approved' then now() else null end
  where id = v_submission.id;

  select w.project_id into v_project_id
  from public.work_activities a
  join public.work_orders w on w.id = a.work_order_id
  where a.id = v_submission.activity_id;

  if v_submission.author_id is not null then
    select coalesce(p.locale, 'es') into v_locale
    from public.profiles p where p.id = v_submission.author_id;

    perform public.persist_in_app_notification(
      v_submission.company_id,
      v_project_id,
      v_submission.author_id,
      'survey_decided',
      'survey_submission',
      v_submission.id,
      case
        when v_locale = 'pt' and p_decision = 'approved' then 'Levantamento aprovado'
        when v_locale = 'pt' then 'Ajustes solicitados no levantamento'
        when p_decision = 'approved' then 'Relevamiento aprobado'
        else 'Cambios solicitados en el relevamiento'
      end,
      coalesce(nullif(trim(p_reason), ''),
        case when v_locale = 'pt' then 'A revisao foi registrada.'
             else 'La revision fue registrada.' end),
      jsonb_build_object(
        'submission_id', v_submission.id,
        'activity_id', v_submission.activity_id,
        'decision', p_decision,
        'url', '/tasks'
      ),
      p_operation_id,
      'survey-decision:' || v_decision_id::text
    );
  end if;

  return v_decision_id;
end;
$$;
