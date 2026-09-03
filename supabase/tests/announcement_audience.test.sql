-- Punto 23: público combinable, conteo previo idéntico al envío, fan-out
-- idempotente, y la línea que separa un comunicado de una oferta de trabajo.
--
-- Los cuatro casos que justifican el archivo:
--
-- 1. **Los criterios se combinan.** "Buenos Aires + disponibles" tiene que
--    ser más chico que cada uno por separado, o el AND es decorativo.
-- 2. **El preview no puede mentir.** El conteo previo y las notificaciones
--    creadas salen de la misma función; si alguien las separa, esto falla.
-- 3. **Republicar no duplica.** El `dedupe_key` es lo que lo garantiza.
-- 4. **Un comunicado no crea trabajo.** Ni oferta, ni postulación, ni OT.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into public.companies (id, name, country, order_prefix) values
  ('ca000000-0000-0000-0000-000000000001', 'Empresa Comunicados', 'AR', 'ECO'),
  ('ca000000-0000-0000-0000-000000000002', 'Empresa Ajena', 'AR', 'EAJ');

insert into auth.users (id, email, raw_user_meta_data) values
  ('ca000000-0000-0000-0000-000000000011', 'gerente.eco@test.dev',
   '{"role":"company_manager","company_id":"ca000000-0000-0000-0000-000000000001"}'::jsonb),
  -- Buenos Aires, disponible.
  ('ca000000-0000-0000-0000-000000000012', 'ba.libre@test.dev', '{"role":"installer"}'::jsonb),
  -- Buenos Aires, NO disponible (ausencia aprobada vigente).
  ('ca000000-0000-0000-0000-000000000013', 'ba.ausente@test.dev', '{"role":"installer"}'::jsonb),
  -- Córdoba, disponible.
  ('ca000000-0000-0000-0000-000000000014', 'cba.libre@test.dev', '{"role":"installer"}'::jsonb),
  -- De la otra empresa: nunca puede entrar al público.
  ('ca000000-0000-0000-0000-000000000015', 'ajeno@test.dev', '{"role":"installer"}'::jsonb);

update public.installers set zones = array['Buenos Aires'], available = true
 where id = 'ca000000-0000-0000-0000-000000000012';
update public.installers set zones = array['Buenos Aires'], available = true
 where id = 'ca000000-0000-0000-0000-000000000013';
update public.installers set zones = array['Córdoba'], available = true
 where id = 'ca000000-0000-0000-0000-000000000014';
update public.installers set zones = array['Buenos Aires'], available = true
 where id = 'ca000000-0000-0000-0000-000000000015';

insert into public.company_installers (company_id, installer_id, role, status, joined_at) values
  ('ca000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000012', 'installer', 'active', now()),
  ('ca000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000013', 'installer', 'active', now()),
  ('ca000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000014', 'installer', 'active', now()),
  ('ca000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000015', 'installer', 'active', now());

-- La ausencia se inserta ya aprobada saliendo del rol: `installer_unavailability`
-- sólo deja al propio instalador pedirla (pendiente) o a la empresa revisarla
-- por RPC. Se saltea la RLS para armar el escenario, no para lo que se prueba.
insert into public.installer_unavailability (
  installer_id, company_id, starts_at, ends_at, reason, status
) values (
  'ca000000-0000-0000-0000-000000000013', 'ca000000-0000-0000-0000-000000000001',
  now() - interval '1 day', now() + interval '2 days', 'licencia', 'approved'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"ca000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
  public.announcement_audience_count('{}'::jsonb),
  3,
  'sin criterios, el público es todo el roster activo de la empresa'
);

select is(
  public.announcement_audience_count('{"zones":["Buenos Aires"]}'::jsonb),
  2,
  'por provincia: los dos de Buenos Aires, y nadie de la otra empresa'
);

select is(
  public.announcement_audience_count('{"availableOnly":true}'::jsonb),
  2,
  'por disponibilidad: queda afuera quien tiene una ausencia aprobada vigente'
);

-- El corazón del pedido: los criterios se combinan.
select is(
  public.announcement_audience_count('{"zones":["Buenos Aires"],"availableOnly":true}'::jsonb),
  1,
  'combinados: Buenos Aires Y disponible es más chico que cada uno por separado'
);

-- El preview y el envío tienen que coincidir exactamente.
select is(
  (select recipients from public.publish_announcement(
    'Corte de calle', 'Evitar el acceso norte',
    'critical', '{"zones":["Buenos Aires"],"availableOnly":true}'::jsonb)),
  1,
  'lo que se publica coincide con lo que el preview había contado'
);

-- Las dos aserciones que siguen miran la tabla de notificaciones completa,
-- así que salen del rol: como `authenticated`, la RLS sólo deja ver las
-- propias y el gerente vería cero siempre — pasarían por el motivo
-- equivocado.
reset role;

select is(
  (select count(*)::integer from public.notifications
    where user_id = 'ca000000-0000-0000-0000-000000000015'),
  0,
  'el instalador de otra empresa nunca recibe el comunicado'
);

-- Republicar no puede duplicar la bandeja de nadie. Dos publicaciones
-- distintas SÍ son dos avisos (cada una con su id); lo que no puede pasar es
-- que la MISMA publicación entre dos veces — que es lo que pasaba antes,
-- cuando el fan-out no escribía `dedupe_key`.
insert into public.notifications (user_id, type, title, body, data, dedupe_key)
select user_id, type, title, body, data, dedupe_key
from public.notifications
where dedupe_key like 'announcement:%'
on conflict (dedupe_key) where dedupe_key is not null do nothing;

select is(
  (select count(*)::integer from public.notifications
    where user_id = 'ca000000-0000-0000-0000-000000000012' and type = 'announcement'),
  1,
  'reinsertar el mismo aviso no duplica: el dedupe_key lo frena'
);

set local role authenticated;

-- La línea con la bolsa de trabajo.
select is(
  (select count(*)::integer from public.broadcasts
    where company_id = 'ca000000-0000-0000-0000-000000000001')
  + (select count(*)::integer from public.work_orders
    where company_id = 'ca000000-0000-0000-0000-000000000001'),
  0,
  'publicar un comunicado no crea ninguna oferta ni orden de trabajo'
);

reset role;

select * from finish();
rollback;
