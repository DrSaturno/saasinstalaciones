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

/*
insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values (
  'PEGAR-AQUI-EL-COMPANY-ID',   -- empresa donde va a ser instalador
  'PEGAR-AQUI-EL-PERSONA-ID',   -- la misma persona del paso 1
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
--   /tasks        → agrupa por empresa, pero los grupos "para aceptar /
--                   activas / cerradas" quedan ARRIBA: la decisión urgente
--                   trasciende empresas.
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
-- el oficio.

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
where company_id = 'PEGAR-AQUI-EL-COMPANY-ID'
  and installer_id = 'PEGAR-AQUI-EL-PERSONA-ID';
*/
