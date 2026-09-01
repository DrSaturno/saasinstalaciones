-- Bolsa de trabajo: cotizar y aprobar SIN que exista un proyecto.
--
-- El flujo nuevo del producto es: se publica la oportunidad, quien está fuera
-- del equipo cotiza, la empresa aprueba, y RECIÉN AHÍ se formaliza el
-- proyecto. Este archivo fija las tres reglas que lo sostienen, porque son
-- fáciles de romper sin darse cuenta:
--
--   1. La bolsa apunta AFUERA. Quien ya pertenece al equipo activo de esa
--      empresa no ve la convocatoria — para eso está la asignación directa.
--      Si alguien "arregla" `broadcast_matches_installer` quitando ese filtro,
--      la bolsa pasa a ser un tablón interno y deja de cumplir su función.
--   2. Aprobar NO crea el proyecto. Es el corazón del pedido: aprobar
--      incorpora a la persona al equipo y nada más; formalizar es un paso
--      humano aparte.
--   3. Sin proyecto no se asignan órdenes. No existen todavía, así que
--      pedirlo tiene que fallar fuerte en vez de asignar a ciegas.
--   4. Formalizar exige coordinador. Es el único lugar del producto donde se
--      exige: el alta normal de proyectos sigue permitiendo crearlos sin uno,
--      porque una empresa nueva todavía no tiene ninguno cargado.

begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- ---------------------------------------------------------------------------
-- Estructura
-- ---------------------------------------------------------------------------

select has_column(
  'public', 'broadcast_applications', 'quoted_amount',
  'la postulación puede llevar el monto que pide el instalador'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'broadcasts'
      and column_name = 'project_id'
  ),
  'YES',
  'una convocatoria puede existir sin proyecto: es la etapa previa, no un proyecto a medias'
);

-- ---------------------------------------------------------------------------
-- Fixture: una empresa, alguien de AFUERA y alguien que ya es del equipo.
-- Los dos cubren la misma zona; lo único que los distingue es la pertenencia,
-- que es justo lo que la bolsa tiene que discriminar.
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, country, order_prefix)
values ('c1000000-0000-0000-0000-000000000001', 'Empresa Bolsa', 'AR', 'EBO');

insert into auth.users (id, email, raw_user_meta_data) values
  ('c1000000-0000-0000-0000-000000000011', 'gerente.bolsa@test.dev',
   '{"role":"company_manager","company_id":"c1000000-0000-0000-0000-000000000001"}'::jsonb),
  ('c1000000-0000-0000-0000-000000000012', 'externo.bolsa@test.dev',
   '{"role":"installer"}'::jsonb),
  ('c1000000-0000-0000-0000-000000000013', 'delequipo.bolsa@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.installers (id, zones) values
  ('c1000000-0000-0000-0000-000000000012', array['AR-BA-AMBA']),
  ('c1000000-0000-0000-0000-000000000013', array['AR-BA-AMBA'])
on conflict (id) do update set zones = excluded.zones;

insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values ('c1000000-0000-0000-0000-000000000001',
        'c1000000-0000-0000-0000-000000000013', 'installer', 'active', now());

insert into public.broadcasts (
  id, company_id, project_id, zone, title, slots, status, currency
) values (
  'c1000000-0000-0000-0000-000000000021', 'c1000000-0000-0000-0000-000000000001',
  null, 'AR-BA-AMBA', 'Instalación sin proyecto', 1, 'open', 'ARS'
);

-- ---------------------------------------------------------------------------
-- La bolsa apunta afuera del equipo
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"c1000000-0000-0000-0000-000000000012","role":"authenticated"}';

select ok(
  public.broadcast_matches_installer('c1000000-0000-0000-0000-000000000021'),
  'quien está fuera del equipo ve la convocatoria de su zona'
);

select lives_ok(
  $$insert into public.broadcast_applications
      (broadcast_id, installer_id, message, quoted_amount)
    values ('c1000000-0000-0000-0000-000000000021',
            'c1000000-0000-0000-0000-000000000012', 'Puedo el martes', 85000)$$,
  'y puede cotizar: propone su monto, no sólo se anota'
);

select throws_ok(
  $$insert into public.broadcast_applications
      (broadcast_id, installer_id, quoted_amount)
    values ('c1000000-0000-0000-0000-000000000021',
            'c1000000-0000-0000-0000-000000000012', -1)$$,
  '23514',
  null,
  'una cotización negativa no entra'
);

set local request.jwt.claims to
  '{"sub":"c1000000-0000-0000-0000-000000000013","role":"authenticated"}';

select ok(
  not public.broadcast_matches_installer('c1000000-0000-0000-0000-000000000021'),
  'quien YA es del equipo no la ve: para eso está la asignación directa'
);

select is(
  (
    select count(*)::integer from public.broadcast_applications
    where broadcast_id = 'c1000000-0000-0000-0000-000000000021'
  ),
  0,
  'y tampoco alcanza la cotización de otro instalador'
);

-- ---------------------------------------------------------------------------
-- La empresa compara y aprueba
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"c1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
  (
    select quoted_amount from public.broadcast_applications
    where broadcast_id = 'c1000000-0000-0000-0000-000000000021'
  ),
  85000::numeric,
  'el gerente lee el monto cotizado, que es lo que le permite comparar'
);

-- Sin proyecto no hay órdenes: pedir asignarlas tiene que fallar fuerte, no
-- inventar un proyecto ni asignar a ciegas.
select throws_ok(
  $$select public.accept_broadcast_application(
      'c1000000-0000-0000-0000-000000000021',
      'c1000000-0000-0000-0000-000000000012',
      array['00000000-0000-4000-8000-000000000999']::uuid[])$$,
  'P0001',
  null,
  'sin proyecto no se pueden asignar órdenes'
);

select lives_ok(
  $$select public.accept_broadcast_application(
      'c1000000-0000-0000-0000-000000000021',
      'c1000000-0000-0000-0000-000000000012',
      array[]::uuid[])$$,
  'aprobar una cotización sin proyecto sí funciona: es la etapa previa'
);

reset role;

select is(
  (
    select status from public.broadcast_applications
    where broadcast_id = 'c1000000-0000-0000-0000-000000000021'
  ),
  'accepted',
  'la postulación queda aceptada'
);

select is(
  (
    select status from public.company_installers
    where company_id = 'c1000000-0000-0000-0000-000000000001'
      and installer_id = 'c1000000-0000-0000-0000-000000000012'
  ),
  'active',
  'y quien cotizó pasa a integrar el equipo'
);

select ok(
  exists (
    select 1 from public.company_membership_roles
    where company_id = 'c1000000-0000-0000-0000-000000000001'
      and user_id = 'c1000000-0000-0000-0000-000000000012'
      and role = 'installer'
  ),
  'con rol de instalador en esa empresa'
);

select is(
  (
    select quoted_amount from public.broadcast_applications
    where broadcast_id = 'c1000000-0000-0000-0000-000000000021'
  ),
  85000::numeric,
  'la cotización sobrevive a la aprobación: es el precio que se acordó'
);

-- El corazón del pedido.
select is(
  (
    select project_id from public.broadcasts
    where id = 'c1000000-0000-0000-0000-000000000021'
  ),
  null,
  'aprobar NO crea el proyecto solo: formalizar es un paso humano aparte'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"c1000000-0000-0000-0000-000000000012","role":"authenticated"}';

select ok(
  not public.broadcast_matches_installer('c1000000-0000-0000-0000-000000000021'),
  'ya incorporado, deja de ver la convocatoria por la que entró'
);

reset role;


-- ---------------------------------------------------------------------------
-- Formalizar el proyecto: el último paso, y el único que exige coordinador
-- ---------------------------------------------------------------------------

insert into public.clients (id, company_id, name)
values ('c1000000-0000-0000-0000-000000000041',
        'c1000000-0000-0000-0000-000000000001', 'Cliente Cotizado');

update public.broadcasts
set client_id = 'c1000000-0000-0000-0000-000000000041',
    pay_amount = 100000,
    pay_visible = true
where id = 'c1000000-0000-0000-0000-000000000021';

-- El 13 ya está en el roster como installer; se lo asciende a coordinador para
-- que exista alguien a cargo.
insert into public.company_membership_roles (company_id, user_id, role)
values ('c1000000-0000-0000-0000-000000000001',
        'c1000000-0000-0000-0000-000000000013', 'coordinator')
on conflict do nothing;

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"c1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
  $$select public.formalize_project_from_broadcast(
      'c1000000-0000-0000-0000-000000000021',
      'c1000000-0000-0000-0000-000000000012',
      null,
      'Proyecto sin coordinador')$$,
  'P0001',
  null,
  'sin coordinador no se crea el proyecto, aunque la cotización esté aceptada'
);

select lives_ok(
  $$select public.formalize_project_from_broadcast(
      'c1000000-0000-0000-0000-000000000021',
      'c1000000-0000-0000-0000-000000000012',
      'c1000000-0000-0000-0000-000000000013',
      'Instalación formalizada')$$,
  'con coordinador sí: se crea el proyecto desde la convocatoria'
);

-- Dos veces crearía dos proyectos para el mismo trabajo.
select throws_ok(
  $$select public.formalize_project_from_broadcast(
      'c1000000-0000-0000-0000-000000000021',
      'c1000000-0000-0000-0000-000000000012',
      'c1000000-0000-0000-0000-000000000013',
      'Duplicado')$$,
  'P0001',
  null,
  'formalizar dos veces la misma búsqueda está bloqueado'
);

reset role;

select ok(
  exists (
    select 1 from public.projects p
    join public.broadcasts b on b.project_id = p.id
    where b.id = 'c1000000-0000-0000-0000-000000000021'
      and p.coordinator_id = 'c1000000-0000-0000-0000-000000000013'
      and p.client_id = 'c1000000-0000-0000-0000-000000000041'
      and p.zones = array['AR-BA-AMBA']
  ),
  'el proyecto hereda cliente y zona de la convocatoria, con el coordinador exigido'
);

select ok(
  exists (
    select 1 from public.sites s
    join public.broadcasts b on b.project_id = s.project_id
    where b.id = 'c1000000-0000-0000-0000-000000000021'
      and s.is_placeholder
  ),
  'el punto nace incompleto: la convocatoria sabe la zona, no la dirección'
);

select is(
  (
    select w.installer_amount from public.work_orders w
    join public.broadcasts b on b.project_id = w.project_id
    where b.id = 'c1000000-0000-0000-0000-000000000021'
  ),
  85000::numeric,
  'el costo es lo COTIZADO (85.000), no lo que la empresa había publicado (100.000)'
);

select is(
  (
    select w.amount from public.work_orders w
    join public.broadcasts b on b.project_id = w.project_id
    where b.id = 'c1000000-0000-0000-0000-000000000021'
  ),
  null,
  'y no inventa el ingreso: lo que se le cobra al cliente todavía no se sabe'
);

select ok(
  exists (
    select 1 from public.work_orders w
    join public.broadcasts b on b.project_id = w.project_id
    where b.id = 'c1000000-0000-0000-0000-000000000021'
      and w.assigned_installer_id = 'c1000000-0000-0000-0000-000000000012'
      and w.source = 'broadcast'
      and w.order_number <> ''
  ),
  'la orden queda asignada a quien cotizó, marcada como venida de la bolsa'
);

select * from finish();

rollback;
