-- Finanzas · circuito semanal de pagos (docs/specs/2026-11-13-finanzas-flujo-semanal).
--
--   OT terminada → aviso del domingo → APRUEBA EL DUEÑO (confirma o corrige el
--   monto) → el instalador/coordinador carga SU factura → recién ahí se puede
--   pagar → comprobante.
--
-- Qué cambia respecto de la versión anterior:
--   * La factura deja de exigirse al APROBAR y pasa a exigirse al PAGAR (D2).
--   * Aprobar un pago es del dueño de la empresa, no de cualquier perfil de
--     Finanzas (D11). Los cobros siguen como estaban.
--   * El monto corregido al aprobar vuelve a la OT, que es la fuente (D8).
--   * El proveedor carga su propia factura; una factura puede cubrir varias OTs (D3, D10).
--   * Un cobro no se cierra sin factura emitida, aunque el dinero ya haya entrado (D5).
--
-- Expansión: columnas, funciones, triggers y políticas nuevas; `create or
-- replace` de cuatro funciones existentes sin cambiar su firma.

-- ---------------------------------------------------------------------------
-- 1. Qué pagos necesitan factura y si ya la tienen
-- ---------------------------------------------------------------------------

create or replace function public.finance_entry_requires_invoice(p_direction text, p_category text)
returns boolean language sql immutable set search_path = '' as $$
  select p_direction = 'payable' and p_category in ('installation', 'coordination', 'logistics', 'service')
$$;
revoke all on function public.finance_entry_requires_invoice(text, text) from public, anon;
grant execute on function public.finance_entry_requires_invoice(text, text) to authenticated;

-- Interna: la usan triggers y funciones `security definer`, también desde la
-- sesión de un instalador, que no puede leer las tablas de Finanzas.
create or replace function public.finance_entry_has_invoice(p_entry uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.finance_documents d where d.entry_id = p_entry and d.kind = 'invoice')
      or exists (select 1 from public.finance_invoice_allocations a
                   join public.finance_invoices i on i.id = a.invoice_id and i.company_id = a.company_id
                  where a.entry_id = p_entry and i.status <> 'void')
$$;
revoke all on function public.finance_entry_has_invoice(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Configuración del aviso semanal
-- ---------------------------------------------------------------------------

alter table public.finance_payment_rules
  add column if not exists digest_email text
    check (digest_email is null or (length(digest_email) between 5 and 254 and digest_email like '%_@_%._%')),
  add column if not exists digest_enabled boolean not null default true;

comment on column public.finance_payment_rules.digest_email is
  'Casilla que recibe el aviso del domingo. Null = el correo de la cuenta del dueño.';

-- ---------------------------------------------------------------------------
-- 3. Reglas de estado: aprobar es del dueño, la factura se exige al pagar
-- ---------------------------------------------------------------------------

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
    if not v_internal or (old.source<>'operations' and old.template_id is null) then raise exception 'amount_change_requires_source'; end if;
  end if;
  if v_internal and (old.source='operations' or old.template_id is not null) and new.amount<>old.amount then
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

create or replace function public.finance_validate_transaction()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_entry public.finance_entries; v_available numeric; v_kind text; v_today date;
begin
  if tg_op='UPDATE' then
    if (to_jsonb(new)-'proof_document_id') is distinct from (to_jsonb(old)-'proof_document_id') or
      old.proof_document_id is not null or new.proof_document_id is null then raise exception 'transaction_immutable'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text,0));
  select * into v_entry from public.finance_entries where id=new.entry_id and company_id=new.company_id for update;
  if not found then raise exception 'entry_missing'; end if;
  if new.proof_document_id is not null then
    select kind into v_kind from public.finance_documents where id=new.proof_document_id and entry_id=new.entry_id and company_id=new.company_id;
    if v_kind is distinct from (case when v_entry.direction='payable' then 'transfer_proof' else 'bank_credit' end) then raise exception 'proof_mismatch'; end if;
  end if;
  if tg_op='UPDATE' then return new; end if;
  if v_entry.status not in ('approved','settled') and not(v_entry.status='review' and new.installment='advance') then raise exception 'approval_required'; end if;
  -- Sin factura no se paga (D2). El débito de un cheque ya emitido es un hecho
  -- bancario y se registra igual: a ese cheque la factura se le exigió al
  -- cargarlo (ver `finance_cheque_allocation_requires_invoice`).
  if new.cheque_id is null and public.finance_entry_requires_invoice(v_entry.direction,v_entry.category)
    and not public.finance_entry_has_invoice(v_entry.id) then raise exception 'invoice_required_to_pay'; end if;
  select (now() at time zone case when country='BR' then 'America/Sao_Paulo' else 'America/Argentina/Buenos_Aires' end)::date
    into v_today from public.companies where id=new.company_id;
  if new.occurred_on>v_today then raise exception 'future_cash'; end if;
  if exists(select 1 from public.finance_suppliers s where s.id=v_entry.supplier_id and s.kind in ('installer','coordinator'))
    and new.method not in ('transfer','cash') then raise exception 'field_team_transfer_or_cash_only'; end if;
  if new.method='check' then
    if not exists(select 1 from public.finance_cheques c join public.finance_cheque_allocations a on a.cheque_id=c.id and a.company_id=c.company_id
      where c.id=new.cheque_id and c.company_id=new.company_id and c.status='settled' and c.settled_on=new.occurred_on
        and a.entry_id=new.entry_id and a.amount=new.amount) then raise exception 'cheque_settlement_required'; end if;
  elsif new.cheque_id is not null then raise exception 'invalid_cheque_method'; end if;
  select v_entry.amount-coalesce((select sum(amount) from public.finance_transactions where entry_id=new.entry_id),0)
    -coalesce((select sum(a.amount) from public.finance_cheque_allocations a join public.finance_cheques c on c.id=a.cheque_id
      where a.entry_id=new.entry_id and c.status='pending'),0) into v_available;
  if new.cheque_id is null and new.amount>v_available then raise exception 'insufficient_available_balance'; end if;
  return new;
end $$;

-- Un cheque emitido también es un pago: la factura se exige al cargarlo.
create or replace function public.finance_cheque_allocation_requires_invoice()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_entry public.finance_entries;
begin
  select * into v_entry from public.finance_entries where id=new.entry_id and company_id=new.company_id;
  if found and public.finance_entry_requires_invoice(v_entry.direction,v_entry.category)
     and not public.finance_entry_has_invoice(v_entry.id) then
    raise exception 'invoice_required_to_pay';
  end if;
  return new;
end $$;
revoke all on function public.finance_cheque_allocation_requires_invoice() from public, anon, authenticated;
drop trigger if exists finance_cheque_allocation_invoice_guard on public.finance_cheque_allocations;
create trigger finance_cheque_allocation_invoice_guard before insert on public.finance_cheque_allocations
  for each row execute function public.finance_cheque_allocation_requires_invoice();

-- Un cobro no se cierra sin factura emitida (D5). El dinero que entró se
-- registra igual —es un hecho—; lo que no pasa es a «saldado».
create or replace function public.finance_close_paid_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.finance_entries e set status='settled',settled_on=new.occurred_on,updated_by=new.created_by
    where e.id=new.entry_id and e.company_id=new.company_id and (e.status='approved' or (e.status='review' and new.installment='advance'))
      and (e.direction='payable' or public.finance_entry_has_invoice(e.id))
      and (select coalesce(sum(t.amount),0) from public.finance_transactions t where t.entry_id=e.id)>=e.amount;
  return new;
end $$;

-- …y se cierra solo cuando la factura llega después del dinero.
create or replace function public.finance_close_invoiced_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.finance_entries e
     set status='settled',
         settled_on=(select max(t.occurred_on) from public.finance_transactions t where t.entry_id=e.id),
         updated_by=auth.uid()
   where e.id=new.entry_id and e.company_id=new.company_id and e.status='approved' and e.amount>0
     and (select coalesce(sum(t.amount),0) from public.finance_transactions t where t.entry_id=e.id)>=e.amount;
  return new;
end $$;
revoke all on function public.finance_close_invoiced_entry() from public, anon, authenticated;
drop trigger if exists finance_invoice_allocation_close on public.finance_invoice_allocations;
create trigger finance_invoice_allocation_close after insert on public.finance_invoice_allocations
  for each row execute function public.finance_close_invoiced_entry();

-- ---------------------------------------------------------------------------
-- 4. Facturas: anulación trazable y número reutilizable tras anular
-- ---------------------------------------------------------------------------

alter table public.finance_invoices
  add column if not exists void_reason text check (void_reason is null or length(void_reason) between 3 and 300),
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id) on delete set null;

drop index if exists public.finance_invoices_received_number_idx;
create unique index finance_invoices_received_number_idx
  on public.finance_invoices(company_id, supplier_id, invoice_number)
  where direction = 'received' and status <> 'void';

create or replace function public.finance_validate_invoice_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if row(new.id, new.company_id, new.direction, new.client_id, new.supplier_id,
      new.invoice_number, new.issued_on, new.due_on, new.amount, new.currency,
      new.storage_path, new.file_name, new.created_by, new.created_at)
     is distinct from
     row(old.id, old.company_id, old.direction, old.client_id, old.supplier_id,
      old.invoice_number, old.issued_on, old.due_on, old.amount, old.currency,
      old.storage_path, old.file_name, old.created_by, old.created_at) then
    raise exception 'Los datos de una factura registrada no se pueden cambiar';
  end if;
  -- Anular sólo desde una función interna (`finance_reject_supplier_invoice`).
  if new.status = 'void' and old.status <> 'void' and current_user not in ('authenticated','anon') then
    new.voided_at := now();
    return new;
  end if;
  if old.direction <> 'issued' or old.status <> 'registered' or new.status <> 'sent' then
    raise exception 'Sólo una factura emitida y registrada puede marcarse enviada';
  end if;
  new.sent_at := now();
  return new;
end $$;

-- Lo imputado por una factura anulada deja de ocupar saldo de la obligación:
-- si no, el proveedor no podría volver a facturar lo que Finanzas le devolvió.
create or replace function public.finance_validate_invoice_allocation()
returns trigger language plpgsql set search_path = public as $$
declare v_invoice public.finance_invoices%rowtype; v_entry public.finance_entries%rowtype;
  v_invoice_used numeric(14,2); v_entry_used numeric(14,2);
begin
  select * into v_invoice from public.finance_invoices
    where id = new.invoice_id and company_id = new.company_id for update;
  select * into v_entry from public.finance_entries
    where id = new.entry_id and company_id = new.company_id for update;
  if v_invoice.id is null or v_entry.id is null or v_invoice.status = 'void' or
     v_invoice.currency <> v_entry.currency or
     (v_invoice.direction = 'issued' and
       (v_entry.direction <> 'receivable' or v_invoice.client_id <> v_entry.client_id)) or
     (v_invoice.direction = 'received' and
       (v_entry.direction <> 'payable' or v_invoice.supplier_id <> v_entry.supplier_id)) then
    raise exception 'Factura y obligación incompatibles';
  end if;
  select coalesce(sum(amount),0) into v_invoice_used from public.finance_invoice_allocations
    where invoice_id = new.invoice_id;
  select coalesce(sum(a.amount),0) into v_entry_used from public.finance_invoice_allocations a
    join public.finance_invoices i on i.id = a.invoice_id and i.company_id = a.company_id
    where a.entry_id = new.entry_id and i.status <> 'void';
  if v_invoice_used + new.amount > v_invoice.amount or
     v_entry_used + new.amount > v_entry.amount then
    raise exception 'La imputación supera el saldo de factura u obligación';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Aprobación en lote, con monto confirmado o corregido
-- ---------------------------------------------------------------------------

-- p_items: [{"entry_id": uuid, "amount": número opcional}]. Si `amount` difiere
-- del actual, se corrige EN LA FUENTE (la OT, el ayudante o el costo operativo)
-- y Finanzas lo sigue por los sincronizadores de siempre: queda un solo número
-- y el historial guarda el valor anterior. Todo o nada.
-- Devuelve a quién hay que avisar (push y correo los manda la app).
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
revoke all on function public.finance_approve_payables(jsonb) from public, anon;
grant execute on function public.finance_approve_payables(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. El proveedor (instalador o coordinador) y su factura
-- ---------------------------------------------------------------------------

-- Lo que el instalador ve de Finanzas: SÓLO sus pagos aprobados o saldados.
-- Nunca el libro, ni lo de otra persona, ni lo que todavía está en revisión.
create or replace function public.finance_my_billing()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'entry_id', e.id, 'company_id', e.company_id, 'company_name', c.name,
      'order_id', e.order_id, 'order_number', w.order_number,
      'title', coalesce(nullif(e.description, ''), w.title, ''),
      'site_name', st.name, 'category', e.category,
      'amount', e.amount, 'currency', e.currency, 'status', e.status,
      'due_on', e.due_on, 'settled_on', e.settled_on,
      'paid_amount', coalesce((select sum(t.amount) from public.finance_transactions t where t.entry_id = e.id), 0),
      'requires_invoice', public.finance_entry_requires_invoice(e.direction, e.category),
      'invoice', (select jsonb_build_object('id', i.id, 'number', i.invoice_number, 'issued_on', i.issued_on, 'amount', i.amount)
                    from public.finance_invoice_allocations a
                    join public.finance_invoices i on i.id = a.invoice_id and i.company_id = a.company_id
                   where a.entry_id = e.id and i.status <> 'void'
                   order by i.created_at desc limit 1)
    ) order by e.status, e.due_on nulls last, e.created_at), '[]'::jsonb)
  from public.finance_entries e
  join public.finance_suppliers s on s.id = e.supplier_id and s.company_id = e.company_id
  join public.companies c on c.id = e.company_id and c.status = 'active'
  left join public.work_orders w on w.id = e.order_id and w.company_id = e.company_id
  left join public.sites st on st.id = w.site_id and st.company_id = w.company_id
  where s.installer_id = auth.uid() and e.direction = 'payable' and e.amount > 0
    and (e.status = 'approved' or (e.status = 'settled' and e.settled_on >= current_date - 120))
$$;
revoke all on function public.finance_my_billing() from public, anon;
grant execute on function public.finance_my_billing() to authenticated;

-- El proveedor carga UNA factura que cubre uno o varios pagos aprobados suyos.
-- El importe tiene que ser exactamente la suma aprobada (sin IVA). Idempotente
-- por `p_id`: reintentar tras un corte no duplica.
create or replace function public.finance_submit_my_invoice(
  p_id uuid, p_company_id uuid, p_invoice_number text, p_issued_on date,
  p_amount numeric, p_storage_path text, p_file_name text, p_entry_ids uuid[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_supplier uuid; v_existing public.finance_invoices; v_today date;
  v_count integer; v_total numeric; v_currencies integer; v_currency text; v_name text;
begin
  if auth.uid() is null then raise exception 'finance_denied' using errcode = '42501'; end if;
  select s.id, s.name into v_supplier, v_name from public.finance_suppliers s
   where s.company_id = p_company_id and s.installer_id = auth.uid();
  if v_supplier is null
     or not exists (select 1 from public.companies c where c.id = p_company_id and c.status = 'active')
     or not exists (select 1 from public.company_installers ci
                     where ci.company_id = p_company_id and ci.installer_id = auth.uid() and ci.status = 'active') then
    raise exception 'finance_denied' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company_id::text, 0));

  select * into v_existing from public.finance_invoices where id = p_id;
  if found then
    if v_existing.company_id = p_company_id and v_existing.supplier_id = v_supplier
       and v_existing.created_by = auth.uid() then return p_id; end if;
    raise exception 'idempotency_conflict';
  end if;

  if p_entry_ids is null or cardinality(p_entry_ids) not between 1 and 100
     or (select count(distinct x) from unnest(p_entry_ids) x) <> cardinality(p_entry_ids) then
    raise exception 'allocations_required';
  end if;
  if p_invoice_number is null or length(btrim(p_invoice_number)) not between 1 and 100 then
    raise exception 'invoice_number_required';
  end if;
  if p_file_name is null or length(p_file_name) not between 1 and 255 then raise exception 'invoice_file_scope'; end if;
  if p_storage_path is distinct from p_company_id::text || '/supplier-invoices/' || auth.uid()::text || '/' || p_id::text then
    raise exception 'invoice_file_scope';
  end if;
  select (now() at time zone case when c.country = 'BR' then 'America/Sao_Paulo'
                                  else 'America/Argentina/Buenos_Aires' end)::date
    into v_today from public.companies c where c.id = p_company_id;
  if p_issued_on is null or p_issued_on > v_today or p_issued_on < v_today - 370 then
    raise exception 'invalid_issue_date';
  end if;

  perform 1 from public.finance_entries e
   where e.id = any (p_entry_ids) and e.company_id = p_company_id order by e.id for update;
  select count(*), sum(e.amount), count(distinct e.currency), min(e.currency)
    into v_count, v_total, v_currencies, v_currency
    from public.finance_entries e
   where e.id = any (p_entry_ids) and e.company_id = p_company_id and e.supplier_id = v_supplier
     and e.direction = 'payable' and e.status = 'approved' and e.amount > 0
     and not public.finance_entry_has_invoice(e.id)
     and not exists (select 1 from public.finance_transactions t where t.entry_id = e.id);
  if v_count <> cardinality(p_entry_ids) then raise exception 'entry_not_billable'; end if;
  if v_currencies <> 1 then raise exception 'currency_mismatch'; end if;
  if p_amount is null or p_amount is distinct from v_total then raise exception 'invoice_amount_mismatch'; end if;

  insert into public.finance_invoices
    (id, company_id, direction, supplier_id, invoice_number, issued_on, amount, currency, storage_path, file_name, created_by)
  values (p_id, p_company_id, 'received', v_supplier, btrim(p_invoice_number), p_issued_on, p_amount, v_currency,
          p_storage_path, p_file_name, auth.uid());
  insert into public.finance_invoice_allocations (company_id, invoice_id, entry_id, amount)
    select p_company_id, p_id, e.id, e.amount from public.finance_entries e where e.id = any (p_entry_ids);

  -- Factura que llega pasado su día de pago: entra en el próximo (D12). Se
  -- admite pagar el mismo día si todavía es lunes/martes.
  update public.finance_entries e
     set due_on = greatest(coalesce(e.due_on, x.next_day), x.next_day), updated_by = auth.uid()
    from (select e2.id,
                 public.finance_next_payment_date(v_today - 1,
                   (case when e2.zone = 'amba' then coalesce(r.amba_weekday, 1)
                         else coalesce(r.interior_weekday, 2) end)::smallint) as next_day
            from public.finance_entries e2
            left join public.finance_payment_rules r on r.company_id = e2.company_id
           where e2.id = any (p_entry_ids) and e2.zone is not null) x
   where e.id = x.id and (e.due_on is null or e.due_on < x.next_day);

  if to_regclass('public.notifications') is not null then
    execute 'insert into public.notifications (user_id, type, title, body, data)
             select p.id, ''supplier_invoice_received'',
                    case when p.locale = ''pt'' then ''Nota fiscal recebida: '' else ''Factura recibida: '' end || $1,
                    $2, jsonb_build_object(''url'', ''/finance/payments?status=approved'', ''invoice_id'', $3,
                      ''company_id'', $4, ''locale'', p.locale)
               from public.profiles p
              where p.company_id = $4 and p.role = ''company_manager''
                and (p.is_owner or exists (select 1 from public.company_staff_permissions sp
                       where sp.user_id = p.id and sp.company_id = $4 and sp.can_manage_finance))'
      using coalesce(v_name, ''),
            btrim(p_invoice_number) || ' · ' || v_currency || ' ' ||
              pg_catalog.translate(pg_catalog.to_char(p_amount, 'FM999,999,999,990.00'), ',.', '.,'),
            p_id, p_company_id;
  end if;
  return p_id;
end $$;
revoke all on function public.finance_submit_my_invoice(uuid, uuid, text, date, numeric, text, text, uuid[]) from public, anon;
grant execute on function public.finance_submit_my_invoice(uuid, uuid, text, date, numeric, text, text, uuid[]) to authenticated;

-- Finanzas devuelve una factura mal cargada (archivo equivocado, número mal).
-- Sólo si todavía no se pagó nada de lo que cubre. El proveedor vuelve a ver
-- esos pagos en «Para facturar» y recibe el motivo.
create or replace function public.finance_reject_supplier_invoice(p_invoice uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_company uuid := public.auth_company(); i public.finance_invoices; v_installer uuid; v_locale text;
begin
  if not coalesce(public.finance_can_access(v_company), false) then
    raise exception 'finance_denied' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company::text, 0));
  select * into i from public.finance_invoices where id = p_invoice and company_id = v_company for update;
  if not found or i.direction <> 'received' or i.status = 'void' then raise exception 'invoice_missing'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 3 and 300 then raise exception 'reason_required'; end if;
  if exists (select 1 from public.finance_invoice_allocations a
               join public.finance_transactions t on t.entry_id = a.entry_id
              where a.invoice_id = i.id) then
    raise exception 'invoice_has_payments';
  end if;
  update public.finance_invoices
     set status = 'void', void_reason = btrim(p_reason), voided_by = auth.uid()
   where id = i.id;
  select s.installer_id into v_installer from public.finance_suppliers s where s.id = i.supplier_id;
  if v_installer is not null and to_regclass('public.notifications') is not null then
    select p.locale into v_locale from public.profiles p where p.id = v_installer;
    execute 'insert into public.notifications (user_id, type, title, body, data) values ($1, $2, $3, $4, $5)'
      using v_installer, 'supplier_invoice_rejected'::text,
        case when v_locale = 'pt' then 'Envie a nota fiscal novamente' else 'Volvé a cargar tu factura' end,
        left(i.invoice_number || ' · ' || btrim(p_reason), 180),
        jsonb_build_object('url', '/earnings', 'invoice_id', i.id, 'company_id', v_company,
          'severity', 'warning', 'locale', coalesce(v_locale, 'es'));
  end if;
end $$;
revoke all on function public.finance_reject_supplier_invoice(uuid, text) from public, anon;
grant execute on function public.finance_reject_supplier_invoice(uuid, text) to authenticated;

-- Storage: el proveedor sube y lee sólo en SU carpeta
-- `<empresa>/supplier-invoices/<su id>/<factura>`. Las políticas de Finanzas
-- (toda la carpeta de la empresa) siguen como estaban.
create or replace function public.finance_supplier_invoice_path_allowed(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (storage.foldername(p_name))[2] = 'supplier-invoices'
     and (storage.foldername(p_name))[3] = auth.uid()::text
     and exists (select 1 from public.company_installers ci
                   join public.companies c on c.id = ci.company_id and c.status = 'active'
                  where ci.company_id::text = (storage.foldername(p_name))[1]
                    and ci.installer_id = auth.uid() and ci.status = 'active')
$$;
revoke all on function public.finance_supplier_invoice_path_allowed(text) from public, anon;
grant execute on function public.finance_supplier_invoice_path_allowed(text) to authenticated;

create or replace function public.finance_invoice_path_in_use(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.finance_invoices i where i.storage_path = p_name)
$$;
revoke all on function public.finance_invoice_path_in_use(text) from public, anon;
grant execute on function public.finance_invoice_path_in_use(text) to authenticated;

drop policy if exists finance_supplier_invoice_insert on storage.objects;
create policy finance_supplier_invoice_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'finance-private' and public.finance_supplier_invoice_path_allowed(name));
drop policy if exists finance_supplier_invoice_read on storage.objects;
create policy finance_supplier_invoice_read on storage.objects for select to authenticated
  using (bucket_id = 'finance-private' and public.finance_supplier_invoice_path_allowed(name));
drop policy if exists finance_supplier_invoice_cleanup on storage.objects;
create policy finance_supplier_invoice_cleanup on storage.objects for delete to authenticated
  using (bucket_id = 'finance-private' and public.finance_supplier_invoice_path_allowed(name)
    and not public.finance_invoice_path_in_use(name));

-- ---------------------------------------------------------------------------
-- 7. Aviso del domingo y recordatorios (los llama el cron con service_role)
-- ---------------------------------------------------------------------------

-- Una fila por empresa con el aviso activado. `payload` trae todo lo abierto;
-- la app arma el correo (qué aprobar, AMBA e interior por separado, qué se
-- paga lunes y martes).
create or replace function public.finance_weekly_digest()
returns table (company_id uuid, company_name text, recipient text, locale text, payload jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare c record; v_recipient text; v_locale text; v_owner uuid; v_today date;
begin
  for c in
    select co.id, co.name, co.country, r.digest_email, coalesce(r.amba_weekday, 1) as amba_weekday,
           coalesce(r.interior_weekday, 2) as interior_weekday
      from public.companies co
      left join public.finance_payment_rules r on r.company_id = co.id
     where co.status = 'active' and coalesce(r.digest_enabled, true)
       and exists (select 1 from public.finance_entries e where e.company_id = co.id)
  loop
    select p.id, p.locale into v_owner, v_locale from public.profiles p
     where p.company_id = c.id and p.role = 'company_manager' and p.is_owner order by p.id limit 1;
    v_recipient := c.digest_email;
    if v_recipient is null and v_owner is not null and to_regclass('auth.users') is not null then
      execute 'select email from auth.users where id = $1' into v_recipient using v_owner;
    end if;
    if v_recipient is null then continue; end if;
    v_today := (now() at time zone case when c.country = 'BR' then 'America/Sao_Paulo'
                                        else 'America/Argentina/Buenos_Aires' end)::date;
    company_id := c.id; company_name := c.name; recipient := v_recipient; locale := coalesce(v_locale, 'es');
    payload := jsonb_build_object(
      'today', v_today, 'amba_weekday', c.amba_weekday, 'interior_weekday', c.interior_weekday,
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
        where e.company_id = c.id and e.direction = 'payable' and e.status in ('review', 'approved')
          and e.amount > coalesce((select sum(t.amount) from public.finance_transactions t where t.entry_id = e.id), 0)
      ));
    return next;
  end loop;
end $$;
revoke all on function public.finance_weekly_digest() from public, anon, authenticated;

-- Recordatorio a quien tiene pagos aprobados hace más de dos días y todavía no
-- cargó la factura. Una notificación por persona, empresa y semana.
create or replace function public.finance_emit_invoice_reminders()
returns table (installer_id uuid, email text, locale text, full_name text, company_name text, pending_count integer)
language plpgsql security definer set search_path = '' as $$
declare r record; v_email text; v_key text;
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
    if to_regclass('public.notifications') is not null then
      execute 'insert into public.notifications (user_id, type, title, body, data, dedupe_key)
               values ($1, $2, $3, $4, $5, $6) on conflict do nothing'
        using r.uid, 'invoice_reminder'::text,
          case when r.loc = 'pt' then 'Falta sua nota fiscal' else 'Falta tu factura' end,
          case when r.loc = 'pt' then r.n || ' pagamento(s) aprovado(s) aguardam nota fiscal'
               else r.n || ' pago(s) aprobado(s) esperan tu factura para poder pagarse' end,
          jsonb_build_object('url', '/earnings', 'company_id', r.cid, 'severity', 'warning', 'locale', coalesce(r.loc, 'es')),
          v_key;
    end if;
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
  end if;
end $$;
