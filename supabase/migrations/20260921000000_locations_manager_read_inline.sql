-- El alta manual de una instalación no funcionó nunca en producción.
--
-- Reportado por GF Instalaciones el 21-09-2026: «No se pudo completar la
-- operación» cada vez que cargaba un local desde el formulario. Postgres lo
-- registró como
--
--   new row violates row-level security policy for table "locations"
--
-- y los datos lo confirman: desde que existe esta tabla, producción tiene
-- locales cargados por importación de Excel y NINGUNO manual.
--
-- ## Por qué
--
-- `createSite` inserta el local y lo pide de vuelta en la misma sentencia
-- (`insert().select()`, o sea `INSERT … RETURNING`). Para devolverlo, Postgres
-- exige que la fila nueva pase la política de LECTURA, además de la de
-- inserción. La lectura era `can_read_location(id)`: una función `stable` que
-- vuelve a buscar el local en `locations` por su id. Esa búsqueda ve la base
-- como estaba antes de la sentencia, así que no encuentra la fila que se está
-- insertando, devuelve falso, y la inserción entera se rechaza — aunque la
-- política de inserción sí se cumpla. Reproducido como el gerente de GF: el
-- mismo insert sin `RETURNING` pasa; con `RETURNING`, 42501.
--
-- La importación nunca lo sufrió porque inserta sin pedir la fila de vuelta.
-- Y el CI no lo vio porque ningún test insertaba un local como gerente: el
-- pgTAP de locaciones las crea como superusuario, y ningún E2E cubre el alta
-- manual.
--
-- ## El arreglo
--
-- El gerente lee los locales de su empresa mirando las columnas de la propia
-- fila, sin volver a buscarla. Es exactamente la primera condición de
-- `can_read_location` —gerente, de esta empresa, empresa activa—, así que NO
-- cambia quién ve qué: sólo deja de depender de encontrarse a sí misma. El
-- resto de los actores (coordinación, instaladores) sigue pasando por
-- `can_read_location`, sin cambios; ninguno de ellos inserta locales.
--
-- `auth_role()` y `auth_company()` van envueltos en `(select …)` por lo mismo
-- que en `20260910000001_rls_initplan`: se calculan una vez por consulta, no
-- una por fila. De paso, las lecturas del gerente se ahorran una búsqueda por
-- fila en `locations`.

drop policy if exists locations_actor_read on public.locations;

create policy locations_actor_read on public.locations
  for select
  to authenticated
  using (
    (
      (select public.auth_role()) = 'company_manager'
      and company_id = (select public.auth_company())
      and public.company_is_active(company_id)
    )
    or public.can_read_location(id)
  );
