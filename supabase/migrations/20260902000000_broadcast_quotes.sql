-- Bolsa de trabajo: el instalador cotiza, no sólo se postula.
--
-- **El problema.** Hasta acá una postulación era `status` + `message`: un
-- texto libre. El precio lo fijaba únicamente la empresa al publicar
-- (`broadcasts.pay_amount`), así que el instalador no tenía dónde proponer
-- el suyo. El flujo real es al revés: la empresa sale a buscar, y quien está
-- afuera del equipo responde con su número.
--
-- **Por qué es nullable.** Cotizar tiene que seguir siendo opcional. Cuando
-- la empresa ya publicó `pay_amount` y lo único que falta es confirmar
-- disponibilidad, obligar a repetir el monto sería fricción sin sentido —
-- y rompería todas las postulaciones que hoy funcionan sin él.
--
-- **No lleva moneda propia.** La hereda de `broadcasts.currency`, que ya
-- existe y ya está atada al país de la empresa. Dos monedas para el mismo
-- trato serían dos fuentes de verdad.
--
-- Sin cambios de RLS: las políticas de esta tabla son por fila, no por
-- columna. `broadcast_apps_installer_insert` ya deja al instalador escribir
-- su propia postulación, y `broadcast_apps_manager_read` ya deja al gerente
-- leer las de sus búsquedas.

alter table public.broadcast_applications
  add column quoted_amount numeric(14, 2)
    check (quoted_amount is null or quoted_amount >= 0);

comment on column public.broadcast_applications.quoted_amount is
  'Lo que el instalador pide por el trabajo, en la moneda de la búsqueda. Null = se postuló sin cotizar, tomando el pago publicado por la empresa.';
