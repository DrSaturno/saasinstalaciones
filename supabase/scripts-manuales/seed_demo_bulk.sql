-- =============================================================
-- Instala Pro — Carga masiva de datos demo (NO es una migración)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase, después del seed.sql
-- normal. Idempotente: usa external_ref / order_id para no duplicar
-- si se corre más de una vez por error.
--
-- Qué agrega sobre el seed base (que solo tiene 20 puntos y 4 estados):
--   - 40 puntos nuevos (SHELL-0021..SHELL-0060) en el proyecto demo
--   - 40 órdenes nuevas cubriendo los 7 estados de la máquina de estados
--     (el seed original no usaba relevamiento, en_revision ni cancelada)
--   - Historial de avances (order_updates) en las órdenes en curso/revisión
--   - Calificaciones (ratings) en las órdenes finalizadas asignadas
-- =============================================================

-- 1. 40 puntos nuevos en el proyecto demo existente
insert into public.sites (project_id, company_id, name, address, city, state, zone, external_ref)
select
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Estación ' || lpad(n::text, 3, '0'),
  'Av. Siempreviva ' || (1000 + n * 7),
  case when n % 3 = 0 then 'Córdoba' else 'Buenos Aires' end,
  case when n % 3 = 0 then 'Córdoba' else 'Buenos Aires' end,
  case when n % 3 = 0 then 'AR-CBA' else 'AR-BA-AMBA' end,
  'SHELL-' || lpad(n::text, 4, '0')
from generate_series(21, 60) n
where not exists (
  select 1 from public.sites where external_ref = 'SHELL-' || lpad(n::text, 4, '0')
);

-- 2. 40 órdenes nuevas, distribuidas en los 7 estados posibles.
--    Distribución (sobre 40): 8 pendiente, 6 relevamiento, 6 planificada,
--    6 en_proceso, 4 en_revision, 8 finalizada, 2 cancelada.
with ranked_sites as (
  select s.*, row_number() over (order by s.external_ref) as rn
  from public.sites s
  where s.project_id = '22222222-2222-2222-2222-222222222222'
    and s.external_ref between 'SHELL-0021' and 'SHELL-0060'
)
insert into public.work_orders (
  site_id, project_id, company_id, title, status, scheduled_date,
  assigned_installer_id, created_by
)
select
  rs.id, rs.project_id, rs.company_id,
  'Recambio de gráfica — ' || rs.name,
  case
    when rs.rn <= 8  then 'pendiente'
    when rs.rn <= 14 then 'relevamiento'
    when rs.rn <= 20 then 'planificada'
    when rs.rn <= 26 then 'en_proceso'
    when rs.rn <= 30 then 'en_revision'
    when rs.rn <= 38 then 'finalizada'
    else 'cancelada'
  end,
  case
    when rs.rn <= 14 then null                                             -- sin planificar aún
    when rs.rn <= 20 then current_date + (rs.rn - 14)::int                  -- planificada: a futuro
    when rs.rn <= 30 then current_date - (30 - rs.rn)::int                  -- en curso/revisión: recientes
    when rs.rn <= 38 then current_date - (10 + (rs.rn - 30) * 3)::int       -- finalizada: hace semanas
    else current_date - 5                                                  -- cancelada
  end,
  case
    when rs.rn <= 14 then null                                    -- pendiente/relevamiento: sin asignar
    when rs.rn % 2 = 0 then 'a0000000-0000-0000-0000-000000000003'::uuid  -- Iván
    else 'a0000000-0000-0000-0000-000000000004'::uuid                    -- Paula
  end,
  'a0000000-0000-0000-0000-000000000002'
from ranked_sites rs
where not exists (
  select 1 from public.work_orders w where w.site_id = rs.id
);

-- 3. Avances de ejemplo en las órdenes en curso (en_proceso)
insert into public.order_updates (id, order_id, company_id, installer_id, type, note, client_created_at)
select gen_random_uuid(), w.id, w.company_id, w.assigned_installer_id, 'checkin',
       'Llegada al sitio, inicio de instalación.', now() - interval '2 days'
from public.work_orders w
where w.status = 'en_proceso' and w.assigned_installer_id is not null
  and not exists (select 1 from public.order_updates u where u.order_id = w.id)
on conflict (id) do nothing;

insert into public.order_updates (id, order_id, company_id, installer_id, type, note, client_created_at)
select gen_random_uuid(), w.id, w.company_id, w.assigned_installer_id, 'progress',
       case (row_number() over (order by w.order_number) % 2)
         when 0 then 'Frente colocado, faltan laterales.'
         else 'Avance 60%, sin novedades.'
       end,
       now() - interval '6 hours'
from public.work_orders w
where w.status = 'en_proceso' and w.assigned_installer_id is not null
  and not exists (select 1 from public.order_updates u where u.order_id = w.id and u.type = 'progress')
on conflict (id) do nothing;

-- Un par de bloqueos, para que se vea el estado "con problemas" en la lista
insert into public.order_updates (id, order_id, company_id, installer_id, type, note, client_created_at)
select gen_random_uuid(), w.id, w.company_id, w.assigned_installer_id, 'blocker',
       'Falta material (vinilo 3M), esperando reposición del depósito.', now() - interval '1 day'
from public.work_orders w
where w.status = 'en_proceso' and w.assigned_installer_id is not null
  and not exists (select 1 from public.order_updates u where u.order_id = w.id and u.type = 'blocker')
order by w.order_number
limit 2
on conflict (id) do nothing;

-- 4. Avance "terminado" en las órdenes en revisión (esperando aprobación del gerente)
insert into public.order_updates (id, order_id, company_id, installer_id, type, note, client_created_at)
select gen_random_uuid(), w.id, w.company_id, w.assigned_installer_id, 'done',
       'Instalación terminada, lista para revisión.', now() - interval '3 hours'
from public.work_orders w
where w.status = 'en_revision' and w.assigned_installer_id is not null
  and not exists (select 1 from public.order_updates u where u.order_id = w.id and u.type = 'done')
on conflict (id) do nothing;

-- 5. Calificaciones en las órdenes finalizadas nuevas (estrellas 3 a 5)
insert into public.ratings (order_id, company_id, installer_id, stars, comment)
select
  w.id, w.company_id, w.assigned_installer_id,
  3 + (row_number() over (order by w.order_number) % 3),  -- 3, 4 o 5 estrellas
  case (row_number() over (order by w.order_number) % 4)
    when 0 then 'Excelente trabajo, antes de tiempo.'
    when 1 then 'Todo bien, sin observaciones.'
    when 2 then null
    else 'Buen trabajo, algo de demora en el inicio.'
  end
from public.work_orders w
where w.status = 'finalizada' and w.assigned_installer_id is not null
  and w.site_id in (select id from public.sites where external_ref between 'SHELL-0021' and 'SHELL-0060')
on conflict (order_id) do nothing;

-- Verificación: conteo de órdenes por estado tras la carga
select status, count(*) as cantidad
from public.work_orders
where company_id = '11111111-1111-1111-1111-111111111111'
group by status
order by
  case status
    when 'pendiente' then 1 when 'relevamiento' then 2 when 'planificada' then 3
    when 'en_proceso' then 4 when 'en_revision' then 5 when 'finalizada' then 6
    else 7
  end;
