-- Finanzas · corrección de importes en gastos fijos y puntuales, y aviso semanal
-- configurable (docs/specs/2026-11-13-finanzas-flujo-semanal).
--
-- 1. El dueño puede corregir al aprobar el importe de CUALQUIER pago propio de la
--    empresa, no sólo los que nacen de una OT: gastos fijos, sueldos y gastos
--    puntuales también. Los importados históricos siguen sin poder cambiarse.
-- 2. El aviso del domingo pasa a configurarse por empresa: día de la semana,
--    hora (en la hora local del país) y casilla. El planificador puede correr
--    cada hora o una vez al día: cada empresa recibe el aviso en el primer
--    pasaje posterior a su horario, una sola vez por semana.

-- 1. Importes corregibles al aprobar

create or replace function public.finance_validate_entry()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_internal boolean := current_user not in ('authenticated','anon'); v_paid numeric;
begin
  if tg_op='INSERT' then
    if new.status<>'review' or (new.installment='advance' and new.due_on is null) or
      (not v_internal and (new.source<>'manual' or new.amount<=0)) then raise exception 'invalid_new_entry'; end if;
    if not v_internal and new.source='manual' and new.order_id is not null and exists(
      select 1 from public.finance_entries e where e.company_id=new.company_id and e.order_id=new.order_id and e.source='operations' and e.status<>'void'
        and e.direction=new.direction and coalesce(e.supplier_id,e.client_id)=coalesce(new.supplier_id,new.client_id)
        and (e.category=new.category or new.direction='receivable')
    ) then raise exception 'use_existing_obligation'; end if;
    return new;
  end if;
  if new.id<>old.id or new.company_id<>old.company_id or new.direction<>old.direction or
    new.order_id is distinct from old.order_id or new.supplier_id is distinct from old.supplier_id or
    new.client_id is distinct from old.client_id or new.currency<>old.currency or
    new.source<>old.source or new.source_key is distinct from old.source_key or
    new.template_id is distinct from old.template_id or new.period_month is distinct from old.period_month then raise exception 'entry_identity_immutable'; end if;
  if new.amount<>old.amount then
    if not v_internal or (old.source not in ('operations','manual') and old.template_id is null) then raise exception 'amount_change_requires_source'; end if;
  end if;
  if v_internal and (old.source in ('operations','manual') or old.template_id is not null) and new.amount<>old.amount then
    select coalesce(sum(amount),0) into v_paid from public.finance_transactions where entry_id=new.id;
    if old.status<>'void' then
      if v_paid>=new.amount and v_paid>0 then
        new.status:='settled'; select max(occurred_on) into new.settled_on from public.finance_transactions where entry_id=new.id;
      elsif old.status='settled' then new.status:='approved'; new.settled_on:=null;
      end if;
    end if;
    new.updated_at:=now(); return new;
  end if;
  if v_internal and new.status='settled' and old.status='review' and exists(select 1 from public.finance_transactions where entry_id=new.id and installment='advance') then
    select coalesce(sum(amount),0) into v_paid from public.finance_transactions where entry_id=new.id;
    if v_paid>=new.amount then new.updated_at:=now(); return new; end if;
  end if;
  if v_internal and new.source='operations' and old.status='approved' and new.status='review' and new.amount=old.amount then
    new.settled_on:=null;new.updated_at:=now();return new;
  end if;
  if old.status in ('settled','void') then raise exception 'entry_closed'; end if;
  if new.status='void' and (exists(select 1 from public.finance_transactions where entry_id=new.id) or
    exists(select 1 from public.finance_cheque_allocations a join public.finance_cheques c on c.id=a.cheque_id where a.entry_id=new.id and c.status='pending')) then raise exception 'entry_has_cash_or_reservations'; end if;
  if new.status='approved' and old.status<>'approved' then
    -- Aprobar un PAGO es decisión del dueño (D11). Las funciones internas
    -- (`finance_approve_payables`) hacen su propio control antes de llegar acá.
    if new.direction='payable' and not v_internal and not coalesce(public.auth_is_company_owner(new.company_id),false) then
      raise exception 'approval_owner_only' using errcode='42501'; end if;
    if new.direction='payable' and new.order_id is not null and new.installment<>'advance' and
      not exists(select 1 from public.work_orders w where w.id=new.order_id and w.company_id=new.company_id and w.status='finalizada' and w.finalized_at is not null) then raise exception 'order_completion_required'; end if;
  end if;
  if new.status='settled' then
    select coalesce(sum(amount),0) into v_paid from public.finance_transactions where entry_id=new.id;
    if old.status<>'approved' or v_paid<new.amount then raise exception 'pending_balance'; end if;
  end if;
  if new.status is distinct from old.status and not ((old.status='review' and new.status in ('approved','void')) or
    (old.status='approved' and new.status in ('settled','void'))) then raise exception 'invalid_entry_transition'; end if;
  new.updated_at:=now(); return new;
end $$;

create or replace function public.finance_approve_payables(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := public.auth_company();
  v_item record; e public.finance_entries; v_rows integer;
  v_installer uuid; v_locale text; v_name text; v_email text; v_order_number text;
  v_out jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not coalesce(public.auth_is_company_owner(v_company), false)
     or not coalesce(public.finance_can_access(v_company), false) then
    raise exception 'approval_owner_only' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 200 then
    raise exception 'invalid_items';
  end if;
  if (select count(*) <> count(distinct x->>'entry_id') from jsonb_array_elements(p_items) x) then
    raise exception 'duplicate_entry';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company::text, 0));

  for v_item in
    select (x->>'entry_id')::uuid as id, nullif(x->>'amount', '')::numeric as amount
    from jsonb_array_elements(p_items) x order by 1
  loop
    select * into e from public.finance_entries where id = v_item.id and company_id = v_company for update;
    if not found or e.direction <> 'payable' or e.status <> 'review' then
      raise exception 'entry_not_reviewable';
    end if;

    if v_item.amount is not null and v_item.amount <> e.amount then
      if v_item.amount <= 0 or v_item.amount > 999999999999.99 or round(v_item.amount, 2) <> v_item.amount then
        raise exception 'invalid_amount';
      end if;
      if public.finance_entry_has_invoice(e.id)
         or exists (select 1 from public.finance_transactions t where t.entry_id = e.id) then
        raise exception 'amount_locked';
      end if;
      if e.source = 'operations' and e.source_key like 'order-team:%' then
        update public.work_orders set installer_amount = v_item.amount
         where id = e.order_id and company_id = v_company
           and 'order-team:' || id || ':' || assigned_installer_id = e.source_key;
        get diagnostics v_rows = row_count;
      elsif e.source = 'operations' and e.source_key like 'order-helper:%'
            and to_regclass('public.work_order_team_members') is not null then
        execute 'update public.work_order_team_members set installer_amount = $1
                  where id = $2 and company_id = $3 and status = ''active'''
          using v_item.amount, substring(e.source_key from 14)::uuid, v_company;
        get diagnostics v_rows = row_count;
      elsif e.source = 'operations' and e.source_key like 'order-cost:%' then
        update public.order_financial_costs set amount = v_item.amount, updated_by = auth.uid(), updated_at = now()
         where id = substring(e.source_key from 12)::uuid and company_id = v_company and active;
        get diagnostics v_rows = row_count;
      elsif e.template_id is not null or e.source = 'manual' then
        -- Gasto fijo, sueldo o gasto puntual: el importe de ESTE pago se corrige acá,
        -- sin tocar la plantilla (los meses siguientes siguen con su importe).
        update public.finance_entries set amount = v_item.amount, updated_by = auth.uid()
         where id = e.id and company_id = v_company and status = 'review';
        get diagnostics v_rows = row_count;
      else
        raise exception 'amount_change_requires_source';
      end if;
      if v_rows <> 1 then raise exception 'amount_source_changed'; end if;
      select * into e from public.finance_entries where id = v_item.id;
      if e.amount <> v_item.amount or e.status <> 'review' then raise exception 'amount_sync_failed'; end if;
    end if;

    update public.finance_entries set status = 'approved', updated_by = auth.uid() where id = e.id;

    select s.installer_id into v_installer from public.finance_suppliers s
     where s.id = e.supplier_id and s.company_id = v_company;
    if v_installer is not null and public.finance_entry_requires_invoice(e.direction, e.category) then
      select p.locale, p.full_name into v_locale, v_name from public.profiles p where p.id = v_installer;
      select w.order_number into v_order_number from public.work_orders w where w.id = e.order_id;
      v_email := null;
      if to_regclass('auth.users') is not null then
        execute 'select email from auth.users where id = $1' into v_email using v_installer;
      end if;
      if to_regclass('public.notifications') is not null then
        execute 'insert into public.notifications (user_id, type, title, body, data) values ($1, $2, $3, $4, $5)'
          using v_installer, 'payment_approved'::text,
            case when v_locale = 'pt' then 'Pagamento aprovado: envie sua nota fiscal'
                 else 'Pago aprobado: cargá tu factura' end,
            coalesce(v_order_number || ' · ', '') || e.currency || ' ' ||
              pg_catalog.translate(pg_catalog.to_char(e.amount, 'FM999,999,999,990.00'), ',.', '.,'),
            jsonb_build_object('url', '/earnings', 'entry_id', e.id, 'order_id', e.order_id,
              'company_id', v_company, 'locale', coalesce(v_locale, 'es'));
      end if;
      v_out := v_out || jsonb_build_object('entry_id', e.id, 'installer_id', v_installer, 'email', v_email,
        'locale', coalesce(v_locale, 'es'), 'name', v_name, 'order_id', e.order_id,
        'order_number', v_order_number, 'amount', e.amount, 'currency', e.currency);
    end if;
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Aviso semanal configurable
-- ---------------------------------------------------------------------------

alter table public.finance_payment_rules
  add column if not exists digest_weekday smallint not null default 7 check (digest_weekday between 1 and 7),
  add column if not exists digest_hour smallint not null default 4 check (digest_hour between 0 and 23),
  add column if not exists digest_last_sent_at timestamptz;

comment on column public.finance_payment_rules.digest_weekday is 'Día del aviso semanal: 1 = lunes … 7 = domingo.';
comment on column public.finance_payment_rules.digest_hour is 'Hora local (0-23) del aviso semanal.';

-- Qué hay abierto en una empresa. Interna: la usan el aviso programado y la vista previa.
create or replace function public.finance_digest_payload(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r record; v_today date;
begin
  select co.country, coalesce(pr.amba_weekday, 1) as amba_wd, coalesce(pr.interior_weekday, 2) as int_wd
    into r from public.companies co
    left join public.finance_payment_rules pr on pr.company_id = co.id where co.id = p_company;
  v_today := (now() at time zone case when r.country = 'BR' then 'America/Sao_Paulo'
                                      else 'America/Argentina/Buenos_Aires' end)::date;
  return jsonb_build_object(
    'today', v_today, 'amba_weekday', r.amba_wd, 'interior_weekday', r.int_wd,
    'entries', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', e.id, 'status', e.status, 'zone', e.zone, 'category', e.category,
          'party', s.name, 'party_kind', s.kind,
          'order_number', w.order_number, 'site', st.name, 'city', st.city,
          'description', coalesce(nullif(e.description, ''), w.title, ''),
          'amount', e.amount - coalesce((select sum(t.amount) from public.finance_transactions t where t.entry_id = e.id), 0),
          'currency', e.currency, 'due_on', e.due_on,
          'order_finished', (e.order_id is null or (w.status = 'finalizada' and w.finalized_at is not null)),
          'requires_invoice', public.finance_entry_requires_invoice(e.direction, e.category),
          'has_invoice', public.finance_entry_has_invoice(e.id)
        ) order by e.zone nulls last, s.name, w.order_number), '[]'::jsonb)
      from public.finance_entries e
      join public.finance_suppliers s on s.id = e.supplier_id and s.company_id = e.company_id
      left join public.work_orders w on w.id = e.order_id and w.company_id = e.company_id
      left join public.sites st on st.id = w.site_id and st.company_id = w.company_id
      where e.company_id = p_company and e.direction = 'payable' and e.status in ('review', 'approved')
        and e.amount > coalesce((select sum(t.amount) from public.finance_transactions t where t.entry_id = e.id), 0)
    ));
end $$;
revoke all on function public.finance_digest_payload(uuid) from public, anon, authenticated;

-- Las empresas a las que les toca el aviso AHORA: pasó su día y hora de esta
-- semana, no se les mandó ya, y no pasaron más de 36 horas (si el planificador
-- se cayó un día, se recupera; si pasó una semana, se espera a la próxima).
create or replace function public.finance_weekly_digest()
returns table (company_id uuid, company_name text, recipient text, locale text, payload jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare c record; v_recipient text; v_locale text; v_owner uuid; v_tz text; v_now timestamp; v_occurrence timestamp;
begin
  for c in
    select co.id, co.name, co.country, r.digest_email, coalesce(r.digest_weekday, 7) as wd,
           coalesce(r.digest_hour, 4) as hr, r.digest_last_sent_at
      from public.companies co
      left join public.finance_payment_rules r on r.company_id = co.id
     where co.status = 'active' and coalesce(r.digest_enabled, true)
       and exists (select 1 from public.finance_entries e where e.company_id = co.id)
  loop
    v_tz := case when c.country = 'BR' then 'America/Sao_Paulo' else 'America/Argentina/Buenos_Aires' end;
    v_now := now() at time zone v_tz;
    v_occurrence := date_trunc('day', v_now)
      - make_interval(days => ((extract(isodow from v_now)::integer - c.wd + 7) % 7))
      + make_interval(hours => c.hr);
    if v_occurrence > v_now then v_occurrence := v_occurrence - interval '7 days'; end if;
    if v_now - v_occurrence > interval '36 hours' then continue; end if;
    if c.digest_last_sent_at is not null and (c.digest_last_sent_at at time zone v_tz) >= v_occurrence then continue; end if;

    select p.id, p.locale into v_owner, v_locale from public.profiles p
     where p.company_id = c.id and p.role = 'company_manager' and p.is_owner order by p.id limit 1;
    v_recipient := c.digest_email;
    if v_recipient is null and v_owner is not null and to_regclass('auth.users') is not null then
      execute 'select email from auth.users where id = $1' into v_recipient using v_owner;
    end if;
    if v_recipient is null then continue; end if;
    company_id := c.id; company_name := c.name; recipient := v_recipient; locale := coalesce(v_locale, 'es');
    payload := public.finance_digest_payload(c.id);
    return next;
  end loop;
end $$;
revoke all on function public.finance_weekly_digest() from public, anon, authenticated;

create or replace function public.finance_mark_digest_sent(p_company uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.finance_payment_rules (company_id, digest_last_sent_at) values (p_company, now())
  on conflict (company_id) do update set digest_last_sent_at = now()
$$;
revoke all on function public.finance_mark_digest_sent(uuid) from public, anon, authenticated;

-- Para el dueño: lo que diría el aviso HOY, más su configuración. Alimenta la
-- vista previa y el envío de prueba; no manda nada.
create or replace function public.finance_digest_preview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid := public.auth_company();
begin
  if auth.uid() is null or not coalesce(public.auth_is_company_owner(v_company), false) then
    raise exception 'approval_owner_only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'company_name', (select name from public.companies where id = v_company),
    'payload', public.finance_digest_payload(v_company),
    'settings', (select jsonb_build_object('email', r.digest_email, 'enabled', r.digest_enabled,
                  'weekday', r.digest_weekday, 'hour', r.digest_hour)
                 from public.finance_payment_rules r where r.company_id = v_company));
end $$;
revoke all on function public.finance_digest_preview() from public, anon;
grant execute on function public.finance_digest_preview() to authenticated;

-- Recordatorio de factura: ahora devuelve sólo a quien recibió una notificación
-- NUEVA (una por persona, empresa y semana), así el correo no se repite aunque
-- el planificador corra cada hora.
create or replace function public.finance_emit_invoice_reminders()
returns table (installer_id uuid, email text, locale text, full_name text, company_name text, pending_count integer)
language plpgsql security definer set search_path = '' as $$
declare r record; v_email text; v_key text; v_new uuid;
begin
  for r in
    select s.installer_id as uid, e.company_id as cid, co.name as cname, p.locale as loc, p.full_name as fname, count(*)::integer as n
      from public.finance_entries e
      join public.finance_suppliers s on s.id = e.supplier_id and s.company_id = e.company_id
      join public.companies co on co.id = e.company_id and co.status = 'active'
      join public.profiles p on p.id = s.installer_id
     where e.direction = 'payable' and e.status = 'approved' and e.amount > 0
       and s.installer_id is not null
       and public.finance_entry_requires_invoice(e.direction, e.category)
       and not public.finance_entry_has_invoice(e.id)
       and e.updated_at < now() - interval '2 days'
     group by s.installer_id, e.company_id, co.name, p.locale, p.full_name
  loop
    v_key := 'invoice-reminder:' || r.uid || ':' || r.cid || ':' || to_char(now(), 'IYYY-IW');
    v_new := null;
    execute 'insert into public.notifications (user_id, type, title, body, data, dedupe_key)
             values ($1, $2, $3, $4, $5, $6) on conflict do nothing returning id'
      into v_new
      using r.uid, 'invoice_reminder'::text,
        case when r.loc = 'pt' then 'Falta sua nota fiscal' else 'Falta tu factura' end,
        case when r.loc = 'pt' then r.n || ' pagamento(s) aprovado(s) aguardam nota fiscal'
             else r.n || ' pago(s) aprobado(s) esperan tu factura para poder pagarse' end,
        jsonb_build_object('url', '/earnings', 'company_id', r.cid, 'severity', 'warning', 'locale', coalesce(r.loc, 'es')),
        v_key;
    if v_new is null then continue; end if;
    v_email := null;
    if to_regclass('auth.users') is not null then
      execute 'select email from auth.users where id = $1' into v_email using r.uid;
    end if;
    installer_id := r.uid; email := v_email; locale := coalesce(r.loc, 'es'); full_name := r.fname;
    company_name := r.cname; pending_count := r.n;
    return next;
  end loop;
end $$;
revoke all on function public.finance_emit_invoice_reminders() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.finance_weekly_digest() to service_role;
    grant execute on function public.finance_emit_invoice_reminders() to service_role;
    grant execute on function public.finance_mark_digest_sent(uuid) to service_role;
  end if;
end $$;
