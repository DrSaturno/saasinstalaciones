-- QA de la última pieza sin verificar del modelo multiempresa: una persona con
-- DOS membresías activas de distinto rol en distintas empresas.
--
-- Rogelio hoy sólo valida la mitad coordinador: tiene una sola membresía, así
-- que el home no llega a mostrar el nivel de agrupación por empresa. Este
-- script agrega una segunda membresía para poder ver los N bloques de verdad.
--
-- Los tres pasos son independientes: leer, agregar, deshacer. **Correr el paso
-- 1 primero** y elegir los UUID con eso a la vista; los pasos 2 y 3 tienen los
-- valores en un solo lugar arriba para no repetirlos.
--
-- No borra ni modifica nada existente: sólo agrega una fila en
-- `company_installers`, y el paso 3 la saca. Las órdenes, proyectos y perfiles
-- quedan intactos en los tres casos.

-- ---------------------------------------------------------------------------
-- PASO 1 — Leer el estado actual (sólo SELECT, no cambia nada)
-- ---------------------------------------------------------------------------

-- 1a. Quién tiene qué membresías hoy. La columna `membresias` dice cuántas
--     tiene cada uno: con 1 el home NO agrupa por empresa (es el caso de
--     Rogelio), con 2 o más sí.
select
  p.id as persona_id,
  p.full_name,
  p.role as rol_de_cuenta,
  ci.company_id,
  c.name as empresa,
  ci.role as rol_en_la_empresa,
  ci.status,
  count(*) over (partition by ci.installer_id) as membresias
from public.company_installers ci
join public.profiles p on p.id = ci.installer_id
join public.companies c on c.id = ci.company_id
where ci.status = 'active'
order by p.full_name, c.name;

-- 1b. Empresas disponibles, para elegir una donde la persona TODAVÍA NO esté.
select id as company_id, name as empresa, country
from public.companies
order by name;

-- ---------------------------------------------------------------------------
-- PASO 1.5 — Sólo si el paso 1b devolvió UNA sola empresa
-- ---------------------------------------------------------------------------
-- Hallazgo del 2026-07-28: producción tiene una sola empresa (Gráfica Demo SA).
-- Con una sola, este QA es IMPOSIBLE: los roles son excluyentes dentro de una
-- empresa, así que nadie puede ser coordinador e instalador a la vez ahí. Hace
-- falta una segunda empresa.
--
-- Dos caminos:
--
--   (a) Por la app, desde `/master` con la cuenta platform_admin: es el flujo
--       real de alta y de paso lo ejercita. Crea también un gerente. Preferible
--       si además se quiere validar ese flujo.
--
--   (b) Por SQL, con el insert de acá abajo: más rápido y no crea usuarios de
--       más. Alcanza para este QA, porque lo que se quiere probar es la
--       agrupación por empresa del área instalador, no el alta.
--
-- `order_prefix` tiene que ser único: es lo que numera las órdenes (QAT-00001).

/*
insert into public.companies (id, name, country, order_prefix)
values (
  '22222222-2222-2222-2222-222222222222',
  'QA Doble Membresía',
  'AR',
  'QAT'
)
on conflict (id) do nothing;
*/

-- Para borrarla al terminar (después del paso 3, que saca la membresía):
--
--   delete from public.companies
--   where id = '22222222-2222-2222-2222-222222222222';
--
-- El `on delete cascade` de `company_installers` se lleva la membresía sola,
-- pero conviene igual correr el paso 3 primero y confirmar que no quedó nada
-- colgando.

-- ---------------------------------------------------------------------------
-- PASO 2 — Agregar la segunda membresía
-- ---------------------------------------------------------------------------
-- Reemplazar los dos UUID con lo que haya devuelto el paso 1. La empresa tiene
-- que ser una donde la persona NO figure ya: dentro de una misma empresa los
-- roles son excluyentes, y el `on conflict` de abajo pisaría el rol que ya
-- tiene en vez de crear uno nuevo.
--
-- El rol va en 'installer' a propósito: si la persona ya coordina en otra
-- empresa, esto arma justo el caso mixto (coordina en una, ejecuta en otra),
-- que es lo que falta probar.

-- Valores reales de producción, resueltos el 2026-07-28 con el paso 1:
--
--   Rogelio Instalador 1 – Prueba   39c8d038-a6fb-417c-af03-941a4082dd7c
--     · rol_de_cuenta      installer   ← el cutover de la Fase 6a ya aplicado
--     · Gráfica Demo SA    coordinator ← la coordinación vive en la membresía
--     · ficha de oficio    sí
--
-- Es el sujeto ideal: ya coordina en una empresa, así que sumarlo como
-- instalador en la otra arma el caso mixto de una sola fila.

/*
insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values (
  '22222222-2222-2222-2222-222222222222',  -- QA Doble Membresía
  '39c8d038-a6fb-417c-af03-941a4082dd7c',  -- Rogelio
  'installer',
  'active',
  now()
)
on conflict (company_id, installer_id)
do update set role = excluded.role, status = 'active';
*/

-- Después de correr el insert, entrar con esa cuenta y revisar a 375 px:
--
--   /home         → tiene que aparecer un bloque POR EMPRESA (el de
--                   coordinador primero, después el de instalador, cada uno
--                   con el nombre de su empresa). Con una sola membresía este
--                   nivel de agrupación no se renderiza — que aparezca ES la
--                   prueba.
--   /tasks        → OJO: no va a agrupar todavía, y está bien. Agrupa según
--                   las empresas presentes EN LAS ÓRDENES, no en las
--                   membresías, y la empresa nueva no tiene ninguna. Para
--                   ejercitar ese camino hace falta proyecto + locación +
--                   orden asignada allá (ver "lo que esto NO cubre", al final).
--   /coordination → sólo las órdenes de los proyectos que coordina; no se
--                   mezclan con las que ejecuta.
--   /route        → NO agrupa (la ruta es física y cronológica); cada parada
--                   lleva un chip con el nombre de su empresa.
--   /profile      → una tarjeta de disponibilidad por empresa.
--
-- Ojo: la ficha de oficio (`installers`: zonas, base, radio) es única por
-- persona, no por empresa. Si la persona nunca fue instaladora puede no tener
-- fila ahí, y entonces la bolsa (`/jobs`) no le va a ofrecer nada. Eso es
-- correcto, no un bug: `company_installers` es la pertenencia, `installers` es
-- el oficio. (Rogelio sí tiene ficha, así que este caso no aplica.)
--
-- LO QUE ESTO **NO** CUBRE
--
-- La empresa nueva queda vacía: sin proyectos, locaciones ni órdenes. Alcanza
-- para probar que el home arma N bloques y que `/route` pone el chip de
-- empresa, que es el grueso de la Fase 5. Pero deja afuera la agrupación de
-- `/tasks` y `/coordination`, que dependen de que HAYA datos de dos empresas.
--
-- Para cubrir eso hace falta, en la empresa nueva: un proyecto, una locación y
-- una orden asignada a la persona. Es un fixture bastante más invasivo en
-- producción — conviene decidirlo aparte, después de ver si los bloques del
-- home salen bien, que es el riesgo principal.

-- ---------------------------------------------------------------------------
-- PASO 3 — Deshacer, cuando la prueba termine
-- ---------------------------------------------------------------------------
-- Sacar la membresía de prueba. Usar los MISMOS dos UUID del paso 2.
--
-- Se borra la fila en vez de marcarla 'removed' porque nunca fue una relación
-- real: dejarla como 'removed' ensuciaría el historial del roster con algo que
-- no pasó.

/*
delete from public.company_installers
where company_id = '22222222-2222-2222-2222-222222222222'
  and installer_id = '39c8d038-a6fb-417c-af03-941a4082dd7c';

delete from public.companies
where id = '22222222-2222-2222-2222-222222222222';
*/
