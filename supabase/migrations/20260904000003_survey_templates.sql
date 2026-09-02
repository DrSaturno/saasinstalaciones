-- Fase 3 de relevamiento y ejecución: la plantilla del relevamiento.
--
-- Hasta ahora "relevar" era escribir una nota de texto libre de tres
-- caracteres mínimos. El requisito pide otra cosa: recopilar información y
-- documentar las condiciones del lugar, y que el coordinador pueda pedir
-- mediciones concretas. Sin campos definidos, "faltan las medidas" no tiene
-- dónde escribirse.
--
-- **La definición se congela en la actividad.** `work_activities` ya tenía
-- `checklist_definition` y `template_version` sin que nadie los llenara, y ése
-- es exactamente el motivo por el que existen: cuando se crea la actividad se
-- copia la plantilla vigente, y editarla después NO cambia los relevamientos
-- que ya están en curso. Un instalador no puede quedar respondiendo un
-- formulario que cambió mientras él estaba en el punto.

create table if not exists public.survey_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  version integer not null check (version > 0),
  name text not null default '',
  -- Array de campos: {key, label, type: check|measure|text, unit?}
  definition jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists survey_templates_version_key
  on public.survey_templates (company_id, version);

-- Una sola plantilla vigente por empresa: si hubiera dos, "la plantilla actual"
-- dejaría de significar algo.
create unique index if not exists survey_templates_one_active
  on public.survey_templates (company_id)
  where is_active;

alter table public.survey_templates enable row level security;

-- La lee cualquiera del equipo: el instalador necesita ver qué le van a pedir
-- antes de ir al punto.
drop policy if exists survey_templates_read on public.survey_templates;
create policy survey_templates_read on public.survey_templates
  for select to authenticated
  using (company_id in (select public.auth_companies()));

drop policy if exists survey_templates_manager_read on public.survey_templates;
create policy survey_templates_manager_read on public.survey_templates
  for select to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

-- La define la empresa. Editar una plantilla vigente sería reescribir lo que
-- ya se le pidió a alguien, así que las versiones se agregan, no se cambian.
drop policy if exists survey_templates_manager_write on public.survey_templates;
create policy survey_templates_manager_write on public.survey_templates
  for insert to authenticated
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

-- ---------------------------------------------------------------------------
-- Plantilla inicial por empresa
--
-- Los campos salen del oficio, no de un ejemplo genérico: para instalar
-- gráfica de gran formato lo que hace falta saber antes de ir es cuánto mide
-- la superficie, cómo se llega, si hay corriente y qué obstáculos hay.
-- ---------------------------------------------------------------------------

insert into public.survey_templates (company_id, version, name, definition, is_active)
select
  c.id, 1, 'Relevamiento estándar',
  '[
    {"key":"ancho_m","label":"Ancho de la superficie","type":"measure","unit":"m"},
    {"key":"alto_m","label":"Alto de la superficie","type":"measure","unit":"m"},
    {"key":"altura_piso_m","label":"Altura desde el piso","type":"measure","unit":"m"},
    {"key":"acceso_vehicular","label":"¿Se puede acercar el vehículo?","type":"check"},
    {"key":"requiere_altura","label":"¿Hace falta escalera o hidroelevador?","type":"check"},
    {"key":"hay_corriente","label":"¿Hay toma de corriente disponible?","type":"check"},
    {"key":"superficie","label":"Material y estado de la superficie","type":"text"},
    {"key":"obstaculos","label":"Obstáculos o condiciones a tener en cuenta","type":"text"}
  ]'::jsonb,
  true
from public.companies c
where not exists (
  select 1 from public.survey_templates t where t.company_id = c.id
);

-- ---------------------------------------------------------------------------
-- Crear actividades copiando la plantilla vigente
--
-- Mismo comando de la Fase 0; lo único que cambia es que ahora la actividad de
-- relevamiento nace con los campos que hay que completar.
-- ---------------------------------------------------------------------------

create or replace function public.create_order_activities(
  p_order_id uuid,
  p_include_survey boolean default false,
  p_include_execution boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders%rowtype;
  v_survey_id uuid;
  v_execution_id uuid;
  v_existing_types text[];
  v_wanted_types text[];
  v_definition jsonb := '[]'::jsonb;
  v_template_version integer := 1;
begin
  if auth.uid() is null then raise exception 'ACCESS_DENIED'; end if;
  if not (p_include_survey or p_include_execution) then
    raise exception 'ACTIVITY_KIND_REQUIRED';
  end if;

  select * into v_order from public.work_orders w where w.id = p_order_id;
  if not found or not public.auth_can_operate_work_order(p_order_id, v_order.company_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  v_wanted_types := array_remove(array[
    case when p_include_survey then 'survey' end,
    case when p_include_execution then 'execution' end], null);

  select array_agg(a.activity_type order by a.activity_type)
  into v_existing_types
  from public.work_activities a where a.work_order_id = p_order_id;

  if v_existing_types is not null then
    if v_existing_types <> (select array_agg(t order by t) from unnest(v_wanted_types) t) then
      raise exception 'ACTIVITIES_ALREADY_EXIST';
    end if;
    select
      (select a.id from public.work_activities a
        where a.work_order_id = p_order_id and a.activity_type = 'survey' limit 1),
      (select a.id from public.work_activities a
        where a.work_order_id = p_order_id and a.activity_type = 'execution' limit 1)
    into v_survey_id, v_execution_id;
    return jsonb_build_object('survey_activity_id', v_survey_id,
      'execution_activity_id', v_execution_id, 'created', false);
  end if;

  if p_include_survey then
    -- La plantilla se copia, no se referencia: si mañana la empresa la cambia,
    -- este relevamiento sigue pidiendo lo que pedía cuando se creó.
    select t.definition, t.version
    into v_definition, v_template_version
    from public.survey_templates t
    where t.company_id = v_order.company_id and t.is_active
    limit 1;

    insert into public.work_activities (company_id, work_order_id, activity_type,
      position, lifecycle, schedule_precision, created_by,
      checklist_definition, template_version)
    values (v_order.company_id, p_order_id, 'survey', 1, 'draft', 'unknown', auth.uid(),
      coalesce(v_definition, '[]'::jsonb), coalesce(v_template_version, 1))
    returning id into v_survey_id;
  end if;

  if p_include_execution then
    insert into public.work_activities (company_id, work_order_id, activity_type,
      position, lifecycle, schedule_precision, prerequisite_activity_id, created_by)
    values (v_order.company_id, p_order_id, 'execution',
      case when p_include_survey then 2 else 1 end,
      'draft', 'unknown', v_survey_id, auth.uid())
    returning id into v_execution_id;
  end if;

  return jsonb_build_object('survey_activity_id', v_survey_id,
    'execution_activity_id', v_execution_id, 'created', true);
end;
$$;

revoke all on function public.create_order_activities(uuid, boolean, boolean) from public;
grant execute on function public.create_order_activities(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Las empresas nuevas también
--
-- El seed de arriba cubre a las que ya existen. Sin esto, cualquier empresa
-- creada después nacería sin plantilla, y su primer relevamiento le mostraría
-- al instalador un formulario vacío — que es peor que el texto libre que
-- estamos reemplazando.
--
-- Apareció probando con una empresa recién creada, no con las del seed: el
-- caso sólo se ve si el fixture no viene del mismo lote que la migración.
-- ---------------------------------------------------------------------------

create or replace function public.seed_survey_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.survey_templates (company_id, version, name, definition, is_active)
  values (
    new.id, 1, 'Relevamiento estándar',
    '[
      {"key":"ancho_m","label":"Ancho de la superficie","type":"measure","unit":"m"},
      {"key":"alto_m","label":"Alto de la superficie","type":"measure","unit":"m"},
      {"key":"altura_piso_m","label":"Altura desde el piso","type":"measure","unit":"m"},
      {"key":"acceso_vehicular","label":"¿Se puede acercar el vehículo?","type":"check"},
      {"key":"requiere_altura","label":"¿Hace falta escalera o hidroelevador?","type":"check"},
      {"key":"hay_corriente","label":"¿Hay toma de corriente disponible?","type":"check"},
      {"key":"superficie","label":"Material y estado de la superficie","type":"text"},
      {"key":"obstaculos","label":"Obstáculos o condiciones a tener en cuenta","type":"text"}
    ]'::jsonb,
    true
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists companies_seed_survey_template on public.companies;
create trigger companies_seed_survey_template
  after insert on public.companies
  for each row execute function public.seed_survey_template();
