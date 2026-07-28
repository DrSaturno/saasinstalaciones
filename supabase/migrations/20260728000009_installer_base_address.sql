-- Dirección base del instalador: el punto de partida de su recorrido diario.
--
-- Las coordenadas ya existían (`base_lat`/`base_lng`, migración de geografía)
-- pero no había dónde cargarlas ni la dirección escrita que las respalda. Sin
-- base, "Mi ruta" arrancaba en la primera parada, que rara vez es de donde sale
-- la persona.
--
-- Idempotente: se puede re-ejecutar sin daño.

alter table public.installers
  add column if not exists base_address text,
  add column if not exists base_city text;

comment on column public.installers.base_address is
  'Dirección desde la que arranca el recorrido (casa o depósito). Respaldo escrito de base_lat/base_lng.';
comment on column public.installers.base_city is
  'Ciudad de la dirección base, para desambiguar al abrir en Maps.';
