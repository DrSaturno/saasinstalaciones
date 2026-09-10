-- Identifica el lote que creó un grupo de órdenes, para que reenviar la misma
-- confirmación no las cree dos veces.
--
-- El alta en lote puede crear cientos de órdenes de un saque. Deshabilitar el
-- botón en la pantalla cubre el doble clic y nada más: no cubre dos pestañas,
-- ni un reintento del navegador, ni dos peticiones que llegan en paralelo. Con
-- 200 órdenes por lote, el modo de fallo es crear 400 y borrarlas a mano.
--
-- La pantalla genera el uuid ANTES de enviar; el índice hace el resto. Es el
-- mismo patrón que la cola offline del instalador —idempotencia por uuid
-- generado en cliente—, así que no introduce una idea nueva.
--
-- Ver docs/specs/2026-09-10-ordenes-en-lote-segunda-vuelta/ (DEC-LOTE-02).

alter table public.work_orders
  add column if not exists batch_id uuid;

comment on column public.work_orders.batch_id is
  'Lote de alta masiva que creó la orden. Nulo en las órdenes creadas de a una.';

-- Parcial: sólo las órdenes que nacieron de un lote se protegen entre sí. Las
-- de a una tienen `batch_id` nulo y pueden repetir locación cuantas veces haga
-- falta — volver a un sitio es normal.
create unique index if not exists work_orders_batch_site_key
  on public.work_orders (batch_id, site_id)
  where batch_id is not null;
