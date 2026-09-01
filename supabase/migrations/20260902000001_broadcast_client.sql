-- La convocatoria sabe para qué cliente es, aunque todavía no haya proyecto.
--
-- Hasta acá el cliente se heredaba del proyecto (`broadcasts.project_id` →
-- `projects.client_id`). Con convocatorias que nacen ANTES del proyecto ese
-- camino no existe, y una oportunidad sin cliente no se puede formalizar
-- después: al crear el proyecto no habría a quién facturarle.
--
-- Va como migración aparte de `broadcast_quotes` a propósito: cotizar y
-- publicar-sin-proyecto son dos pasos distintos del mismo flujo, y separarlos
-- deja claro qué habilita cada uno si alguna vez hay que revisarlo.
--
-- Nullable: las convocatorias que ya existen nacieron de un proyecto y siguen
-- heredando el cliente de ahí. Sólo las que nacen sin proyecto lo llevan
-- propio; la aplicación exige exactamente uno de los dos.
--
-- La FK compuesta contra `(id, company_id)` es lo que impide apuntar a un
-- cliente de OTRA empresa: sin ella, un `client_id` cualquiera pasaría la
-- validación de la aplicación y quedaría escrito. Se apoya en
-- `clients_id_company_key`, que ya existía — mismo patrón que usan
-- `order_attachments` y `order_payment_events` contra `work_orders`.

alter table public.broadcasts
  add column client_id uuid,
  add constraint broadcasts_client_company_fk
    foreign key (client_id, company_id)
    references public.clients (id, company_id) on delete set null;

comment on column public.broadcasts.client_id is
  'Cliente de la oportunidad cuando nace sin proyecto. Con proyecto queda null y se hereda de projects.client_id.';

create index broadcasts_client_idx
  on public.broadcasts (client_id)
  where client_id is not null;
