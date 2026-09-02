-- Fase 4 de relevamiento y ejecución: dispensar el prerrequisito.
--
-- La regla ya estaba enforced desde agosto: una ejecución con relevamiento
-- pendiente no puede pasar a `in_progress` (`PREREQUISITE_SURVEY_NOT_APPROVED`).
-- Lo que faltaba era la salida legítima para cuando hay que arrancar igual —
-- el cliente apura, el relevamiento se hizo por teléfono, lo que sea— y que esa
-- salida quede registrada.
--
-- **Quién puede dispensar: la misma autoridad que aprueba (DEC-15).**
--
-- Es el punto que más importa de esta migración. Si el gerente pudiera
-- dispensar, DEC-15 quedaría decorativa: no puede aprobar el relevamiento, pero
-- dispensaría el requisito y la ejecución arrancaría igual sin que el
-- coordinador viera nada. La puerta de atrás sería más ancha que la puerta.
--
-- Así que dispensar exige `survey_decision_authority`: el coordinador
-- responsable, o el gerente sólo cuando el proyecto no tiene coordinador.
--
-- **El motivo es obligatorio y largo.** La tabla ya exigía entre 10 y 500
-- caracteres, y está bien que sea así: "ok" no explica por qué se salteó un
-- control, y dentro de seis meses alguien va a querer saberlo.

create or replace function public.waive_activity_prerequisite(
  p_activity_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity public.work_activities%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if auth.uid() is null then
    raise exception 'ACCESS_DENIED';
  end if;

  select * into v_activity
  from public.work_activities a
  where a.id = p_activity_id
  for update;
  if not found then raise exception 'ACTIVITY_NOT_FOUND'; end if;

  if v_activity.prerequisite_activity_id is null then
    raise exception 'ACTIVITY_HAS_NO_PREREQUISITE';
  end if;

  -- Ya dispensada: se devuelve sin error para que un reintento no rompa, pero
  -- tampoco se pisa el motivo original. El primero es el que explica la
  -- decisión que efectivamente se tomó.
  if v_activity.prerequisite_waived_at is not null then
    return;
  end if;

  -- Si el relevamiento ya está aprobado no hay nada que dispensar, y dejar
  -- pasar la llamada guardaría una excusa para un control que nunca se salteó.
  if exists (
    select 1 from public.survey_submissions ss
    where ss.activity_id = v_activity.prerequisite_activity_id
      and ss.status = 'approved'
  ) then
    raise exception 'PREREQUISITE_ALREADY_APPROVED';
  end if;

  -- La misma autoridad que aprueba. Ver el comentario de arriba: sin esto,
  -- dispensar sería la puerta de atrás de DEC-15.
  if public.survey_decision_authority(v_activity.prerequisite_activity_id) is null then
    raise exception 'WAIVER_NOT_YOURS';
  end if;

  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'WAIVER_REASON_REQUIRED';
  end if;

  update public.work_activities
  set prerequisite_waived_at = now(),
      prerequisite_waived_reason = v_reason
  where id = p_activity_id;
end;
$$;

revoke all on function public.waive_activity_prerequisite(uuid, text) from public;
grant execute on function public.waive_activity_prerequisite(uuid, text) to authenticated;

comment on function public.waive_activity_prerequisite(uuid, text) is
  'Permite arrancar una ejecución sin el relevamiento aprobado, dejando constancia. Exige la MISMA autoridad que aprobar (DEC-15): si no, dispensar sería la puerta de atrás de esa decisión.';
