-- Finanzas · dos arreglos que bloqueaban el circuito de pagos
-- (docs/specs/2026-11-13-finanzas-flujo-semanal, bugs 8.1 y 8.2).
--
-- 8.1  `work_orders.finalized_at` dejó de grabarse: una reescritura de
--      `validate_order_transition` perdió la línea que la completaba. Finanzas
--      la exige para aprobar un pago y para calcular su vencimiento, así que
--      ninguna OT se podía aprobar. Se repone con un trigger PROPIO y chico,
--      para que una próxima reescritura de la validación no la vuelva a perder.
-- 8.2  La zona de pago se resolvía con `sites.zone = 'AMBA'`, pero desde la
--      migración de geografía `zone` trae la PROVINCIA. Todo pago quedaba
--      «interior». Se clasifica por provincia + ciudad.
--
-- Expansión pura: funciones y triggers nuevos, y `create or replace` de las
-- tres funciones que resolvían la zona. No cambia firmas ni borra nada.

-- ---------------------------------------------------------------------------
-- 1. Zona de pago: AMBA o interior
-- ---------------------------------------------------------------------------

-- Normaliza para comparar: minúsculas, sin tildes, sin puntos ni espacios de más.
-- No usa `unaccent` a propósito: así la función es inmutable de verdad y no
-- depende de una extensión.
create or replace function public.finance_normalize_place(p_value text)
returns text language sql immutable set search_path = '' as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.translate(pg_catalog.lower(coalesce(p_value, '')), 'áàäâéèëêíìïîóòöôúùüûñ.', 'aaaaeeeeiiiioooouuuun '),
    '\s+', ' ', 'g'))
$$;
revoke all on function public.finance_normalize_place(text) from public, anon;
grant execute on function public.finance_normalize_place(text) to authenticated;

-- AMBA = Ciudad de Buenos Aires + Gran Buenos Aires. La ciudad sólo cuenta si la
-- provincia es Buenos Aires (o CABA): «San Martín» en Mendoza no es AMBA.
-- «San Nicolás» queda afuera adrede: como barrio porteño choca con San Nicolás
-- de los Arroyos, que es interior. Sin ciudad cargada no se puede saber: interior.
create or replace function public.finance_classify_zone(p_state text, p_city text, p_zone text)
returns text language sql immutable set search_path = '' as $$
  with n as (
    select public.finance_normalize_place(p_state) as state,
           public.finance_normalize_place(p_city) as city,
           public.finance_normalize_place(p_zone) as zone
  )
  select case
    when n.zone like '%amba%' then 'amba'
    when n.state in ('ciudad autonoma de buenos aires', 'caba', 'capital federal', 'ciudad de buenos aires')
      or n.zone in ('ciudad autonoma de buenos aires', 'caba', 'capital federal', 'ciudad de buenos aires')
      or n.city in ('ciudad autonoma de buenos aires', 'caba', 'capital federal', 'ciudad de buenos aires', 'c a b a')
      then 'amba'
    when (n.state in ('buenos aires', 'provincia de buenos aires', 'gran buenos aires', 'gba')
          or (n.state = '' and n.zone in ('buenos aires', 'gran buenos aires', 'gba')))
      and n.city = any (array[
        -- partidos del Gran Buenos Aires
        'almirante brown','avellaneda','berazategui','esteban echeverria','ezeiza','florencio varela',
        'general san martin','san martin','hurlingham','ituzaingo','jose c paz','la matanza','lanus',
        'lomas de zamora','malvinas argentinas','merlo','moreno','moron','quilmes','san fernando',
        'san isidro','san miguel','tigre','tres de febrero','vicente lopez','escobar','pilar',
        'presidente peron','san vicente','marcos paz','general rodriguez','canuelas',
        -- localidades del Gran Buenos Aires
        'martinez','olivos','villa lynch','llavallol','lavallol','beccar','boulogne','munro','florida',
        'villa ballester','san andres','caseros','ciudadela','ramos mejia','san justo','haedo','castelar',
        'banfield','temperley','adrogue','burzaco','bernal','wilde','gerli','remedios de escalada',
        'monte grande','canning','tortuguitas','grand bourg','del viso','nordelta','benavidez',
        'don torcuato','general pacheco','pacheco','san antonio de padua','villa tesei','bella vista',
        'jose leon suarez','villa martelli','villa adelina','carapachay','acassuso','la lucila','victoria',
        'virreyes','garin','ingeniero maschwitz','maschwitz','belen de escobar','isidro casanova',
        'gonzalez catan','laferrere','gregorio de laferrere','tapiales','villa madero','lomas del mirador',
        'la tablada','aldo bonzi','ciudad evita','villa celina','villa luzuriaga','rafael castillo',
        'virrey del pino','longchamps','glew','claypole','rafael calzada','jose marmol',
        'san francisco solano','ezpeleta','hudson','ranelagh','platanos','villa dominico','sarandi',
        'dock sud','pineyro','valentin alsina','monte chingolo','villa fiorito','ingeniero budge',
        'turdera','luis guillon','el jaguel','tristan suarez','carlos spegazzini','villa de mayo',
        'los polvorines','pablo nogues','villa bosch','saenz pena','santos lugares','el palomar',
        'martin coronado','loma hermosa','pablo podesta','ciudad jardin','william morris','villa udaondo',
        'paso del rey','francisco alvarez','la reja','trujui','mariano acosta','pontevedra','libertad',
        'muniz','rincon de milberg','el talar','troncos del talar','dique lujan',
        -- barrios porteños cargados con provincia «Buenos Aires»
        'agronomia','almagro','balvanera','barracas','belgrano','boedo','caballito','chacarita','coghlan',
        'colegiales','constitucion','flores','floresta','la boca','la paternal','paternal','liniers',
        'mataderos','monte castro','monserrat','montserrat','nueva pompeya','nunez','palermo',
        'parque avellaneda','parque chacabuco','parque chas','parque patricios','puerto madero','recoleta',
        'retiro','saavedra','san cristobal','san telmo','velez sarsfield','versalles','villa crespo',
        'villa del parque','villa devoto','villa general mitre','villa lugano','villa luro','villa ortuzar',
        'villa pueyrredon','villa real','villa riachuelo','villa santa rita','villa soldati','villa urquiza',
        'once','abasto','microcentro','barrio norte','congreso','tribunales'
      ]) then 'amba'
    else 'interior'
  end
  from n
$$;
revoke all on function public.finance_classify_zone(text, text, text) from public, anon;
grant execute on function public.finance_classify_zone(text, text, text) to authenticated;

comment on function public.finance_classify_zone(text, text, text) is
  'Zona de pago de Finanzas (amba | interior) a partir de provincia, ciudad y zona del local. Única fuente: la usan los sincronizadores y la app.';

-- Zona de un local concreto. Interna: la llaman los sincronizadores.
create or replace function public.finance_site_zone(p_site uuid, p_company uuid)
returns text language sql stable security definer set search_path = '' as $$
  select public.finance_classify_zone(s.state, s.city, s.zone)
  from public.sites s where s.id = p_site and s.company_id = p_company
$$;
revoke all on function public.finance_site_zone(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Los tres sincronizadores usan la clasificación nueva
-- ---------------------------------------------------------------------------

create or replace function public.finance_sync_order(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare w public.work_orders; v_client uuid; v_zone text; v_supplier uuid; v_name text; v_mode text; v_amount numeric;
begin
  select * into w from public.work_orders where id=p_order;
  if not found then return; end if;
  v_amount:=public.finance_order_source_amount(w.id,w.company_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(w.company_id::text,0));
  select client_id,billing_mode into v_client,v_mode from public.projects where id=w.project_id and company_id=w.company_id;
  v_zone:=coalesce(public.finance_site_zone(w.site_id,w.company_id),'interior');
  if v_client is not null and v_mode='per_installation' and v_amount is not null and v_amount>0 then
    insert into public.finance_entries(company_id,direction,order_id,client_id,category,installment,description,amount,currency,created_by,source,source_key)
      values(w.company_id,'receivable',w.id,v_client,'installation','total',w.title,v_amount,w.currency,auth.uid(),'operations','order-client:'||w.id)
      on conflict(company_id,source,source_key) do update set amount=excluded.amount,description=excluded.description,updated_by=auth.uid()
      where finance_entries.amount is distinct from excluded.amount;
  else
    update public.finance_entries set amount=0,updated_by=auth.uid() where company_id=w.company_id and source='operations' and source_key='order-client:'||w.id and amount<>0;
  end if;
  if w.assigned_installer_id is not null and w.installer_amount is not null and w.installer_amount>0 then
    select full_name into v_name from public.profiles where id=w.assigned_installer_id;
    insert into public.finance_suppliers(company_id,name,kind,installer_id)
      values(w.company_id,coalesce(nullif(v_name,''),'Equipo'),'installer',w.assigned_installer_id)
      on conflict(company_id,installer_id) do nothing;
    select id into v_supplier from public.finance_suppliers where company_id=w.company_id and installer_id=w.assigned_installer_id;
    insert into public.finance_entries(company_id,direction,order_id,supplier_id,category,installment,zone,description,amount,currency,created_by,source,source_key)
      values(w.company_id,'payable',w.id,v_supplier,'installation','total',v_zone,w.title,w.installer_amount,w.currency,auth.uid(),'operations','order-team:'||w.id||':'||w.assigned_installer_id)
      on conflict(company_id,source,source_key) do update set amount=excluded.amount,description=excluded.description,zone=excluded.zone,updated_by=auth.uid()
      where finance_entries.amount is distinct from excluded.amount;
  end if;
  -- La zona puede corregirse sola (cambió la ciudad del local) mientras el pago
  -- siga abierto. Un pago saldado o anulado no se toca.
  update public.finance_entries e set zone=v_zone,updated_by=auth.uid()
    where e.company_id=w.company_id and e.order_id=w.id and e.direction='payable' and e.source='operations'
      and e.status in ('review','approved') and e.zone is distinct from v_zone;
  update public.finance_entries e set status='review',updated_by=auth.uid()
    where e.company_id=w.company_id and e.order_id=w.id and e.direction='payable' and e.source='operations' and e.source_key like 'order-team:%'
      and (w.assigned_installer_id is null or e.source_key<>'order-team:'||w.id||':'||w.assigned_installer_id or coalesce(w.installer_amount,0)=0)
      and e.status='approved' and e.amount>(select coalesce(sum(t.amount),0) from public.finance_transactions t where t.entry_id=e.id);
end $$;
revoke all on function public.finance_sync_order(uuid) from public,anon,authenticated;

create or replace function public.finance_sync_operational_cost()
returns trigger language plpgsql security definer set search_path = '' as $$
declare w public.work_orders; v_supplier uuid; v_name text; v_kind text; v_key text;
begin
  if tg_op='UPDATE' and (new.id<>old.id or new.company_id<>old.company_id or new.order_id<>old.order_id or new.payee_id<>old.payee_id or new.category<>old.category or new.created_by<>old.created_by) then raise exception 'cost_identity_immutable'; end if;
  select * into w from public.work_orders where id=new.order_id and company_id=new.company_id;
  if new.active and not exists(select 1 from public.company_installers where company_id=new.company_id and installer_id=new.payee_id and status='active') then raise exception 'active_roster_required'; end if;
  if new.category='installation' and new.payee_id=w.assigned_installer_id then raise exception 'edit_lead_cost_on_order'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.company_id::text,0));
  v_kind:=case when new.category='coordination' then 'coordinator' else 'installer' end;
  select full_name into v_name from public.profiles where id=new.payee_id;
  insert into public.finance_suppliers(company_id,name,kind,installer_id) values(new.company_id,coalesce(nullif(v_name,''),'Equipo'),v_kind,new.payee_id)
    on conflict(company_id,installer_id) do nothing;
  select id into v_supplier from public.finance_suppliers where company_id=new.company_id and installer_id=new.payee_id;
  v_key:='order-cost:'||new.id;
  if new.active and new.amount>0 then
    insert into public.finance_entries(company_id,direction,order_id,supplier_id,category,installment,zone,description,amount,currency,created_by,source,source_key)
      values(new.company_id,'payable',new.order_id,v_supplier,new.category,'total',coalesce(public.finance_site_zone(w.site_id,w.company_id),'interior'),new.description,new.amount,w.currency,auth.uid(),'operations',v_key)
      on conflict(company_id,source,source_key) do update set amount=excluded.amount,description=excluded.description,updated_by=auth.uid()
      where finance_entries.amount is distinct from excluded.amount;
  else
    update public.finance_entries e set amount=coalesce((select sum(t.amount) from public.finance_transactions t where t.entry_id=e.id),0),updated_by=auth.uid()
      where e.company_id=new.company_id and e.source='operations' and e.source_key=v_key
      and e.amount is distinct from coalesce((select sum(t.amount) from public.finance_transactions t where t.entry_id=e.id),0);
  end if;
  return new;
end $$;
revoke all on function public.finance_sync_operational_cost() from public,anon,authenticated;

create or replace function public.finance_sync_helper(p_member uuid,p_company uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row jsonb;w public.work_orders;v_supplier uuid;v_name text;v_key text:='order-helper:'||p_member;v_amount numeric;
begin
  if to_regclass('public.work_order_team_members') is null then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company::text,0));
  execute 'select to_jsonb(m) from public.work_order_team_members m where id=$1 and company_id=$2' into v_row using p_member,p_company;
  if v_row is null or v_row->>'status'<>'active' or coalesce((v_row->>'installer_amount')::numeric,0)=0 then
    update public.finance_entries e set status='review',updated_by=auth.uid()
      where e.company_id=p_company and e.source='operations' and e.source_key=v_key and e.status='approved'
        and e.amount>(select coalesce(sum(t.amount),0) from public.finance_transactions t where t.entry_id=e.id);
    return;
  end if;
  select * into w from public.work_orders where id=(v_row->>'order_id')::uuid and company_id=p_company;
  if not found then return; end if;
  if w.assigned_installer_id=(v_row->>'installer_id')::uuid then return; end if;
  select full_name into v_name from public.profiles where id=(v_row->>'installer_id')::uuid;
  insert into public.finance_suppliers(company_id,name,kind,installer_id) values(p_company,coalesce(nullif(v_name,''),'Equipo'),'installer',(v_row->>'installer_id')::uuid) on conflict(company_id,installer_id) do nothing;
  select id into v_supplier from public.finance_suppliers where company_id=p_company and installer_id=(v_row->>'installer_id')::uuid;
  v_amount:=(v_row->>'installer_amount')::numeric;
  insert into public.finance_entries(company_id,direction,order_id,supplier_id,category,installment,zone,description,amount,currency,created_by,source,source_key)
    values(p_company,'payable',w.id,v_supplier,'installation','total',coalesce(public.finance_site_zone(w.site_id,p_company),'interior'),w.title,v_amount,w.currency,auth.uid(),'operations',v_key)
    on conflict(company_id,source,source_key) do update set amount=excluded.amount,updated_by=auth.uid() where finance_entries.amount is distinct from excluded.amount;
end $$;
revoke all on function public.finance_sync_helper(uuid,uuid) from public,anon,authenticated;

-- El vencimiento depende de la zona (lunes AMBA, martes interior): si la zona
-- de un pago abierto cambia, se recalcula. Antes sólo se calculaba al crear.
drop trigger if exists finance_schedule_entry_before_insert on public.finance_entries;
create trigger finance_schedule_entry_before_insert
  before insert or update of zone on public.finance_entries
  for each row execute function public.finance_schedule_entry();

-- ---------------------------------------------------------------------------
-- 3. Fecha de finalización de la OT
-- ---------------------------------------------------------------------------

-- Entrar a «finalizada» sella la fecha; salir (reapertura) la borra, así una
-- OT reabierta y vuelta a cerrar paga según su cierre real. Trigger propio y no
-- una línea dentro de `validate_order_transition`: esa función se reescribió
-- varias veces y en una de ellas la línea se perdió.
create or replace function public.stamp_order_finalized_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'finalizada' and new.finalized_at is null then
      new.finalized_at := pg_catalog.now();
    end if;
    return new;
  end if;
  if new.status = 'finalizada' and old.status is distinct from 'finalizada' then
    new.finalized_at := pg_catalog.now();
  elsif new.status is distinct from 'finalizada' and old.status = 'finalizada' then
    new.finalized_at := null;
  end if;
  return new;
end $$;
revoke all on function public.stamp_order_finalized_at() from public, anon, authenticated;

drop trigger if exists work_orders_05_stamp_finalized_at on public.work_orders;
create trigger work_orders_05_stamp_finalized_at
  before insert or update of status on public.work_orders
  for each row execute function public.stamp_order_finalized_at();

-- ---------------------------------------------------------------------------
-- 4. Lo que ya existe: completar fechas, corregir zonas, recalcular vencimientos
-- ---------------------------------------------------------------------------

-- Sin triggers de usuario: sólo se completa un dato que faltaba; no hay que
-- reescribir `updated_at` ni redisparar reglas de negocio de la orden.
do $$
declare v_has_updated boolean;
begin
  select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='work_orders' and column_name='updated_at') into v_has_updated;
  alter table public.work_orders disable trigger user;
  if v_has_updated then
    execute 'update public.work_orders set finalized_at = updated_at where status = ''finalizada'' and finalized_at is null';
  else
    update public.work_orders set finalized_at = now() where status = 'finalizada' and finalized_at is null;
  end if;
  alter table public.work_orders enable trigger user;
end $$;

-- Zona correcta en los pagos abiertos (el trigger de arriba recalcula el
-- vencimiento de cada fila que cambia).
update public.finance_entries e
   set zone = public.finance_site_zone(w.site_id, w.company_id)
  from public.work_orders w
 where w.id = e.order_id and w.company_id = e.company_id
   and e.direction = 'payable' and e.zone is not null
   and e.status in ('review', 'approved')
   and e.zone is distinct from public.finance_site_zone(w.site_id, w.company_id)
   and public.finance_site_zone(w.site_id, w.company_id) is not null;

-- Vencimiento de los pagos abiertos cuya zona NO cambió pero cuya OT ahora sí
-- tiene fecha de finalización.
update public.finance_entries e
   set due_on = public.finance_next_payment_date(
         (w.finalized_at at time zone case when c.country = 'BR' then 'America/Sao_Paulo'
                                           else 'America/Argentina/Buenos_Aires' end)::date,
         (case when e.zone = 'amba' then coalesce(r.amba_weekday, 1)
               else coalesce(r.interior_weekday, 2) end)::smallint)
  from public.work_orders w
  join public.companies c on c.id = w.company_id
  left join public.finance_payment_rules r on r.company_id = w.company_id
 where w.id = e.order_id and w.company_id = e.company_id
   and w.status = 'finalizada' and w.finalized_at is not null
   and e.direction = 'payable' and e.installment <> 'advance' and e.zone is not null
   and e.status in ('review', 'approved') and e.due_on is null;
