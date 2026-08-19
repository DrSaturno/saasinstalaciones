-- Permisos de tabla para los roles de Supabase, declarados en el repositorio.
--
-- **Por qué hacía falta.** Las migraciones otorgaban `execute` sobre funciones
-- pero nunca permisos sobre tablas. En un proyecto hosteado eso no se notaba:
-- la plataforma aplica sus privilegios por defecto al crearlo, y de hecho el
-- entorno de staging tiene 330 permisos de tabla para `authenticated` que
-- ninguna migración pidió. Una base levantada desde cero con
-- `supabase db start` no los tiene, así que toda consulta hecha como
-- `authenticated` moría con «permission denied for table».
--
-- Eso es lo que tenía en rojo la mitad de la suite pgTAP la primera vez que
-- llegó a ejecutarse (14-08-2026), y significa algo más incómodo que un test
-- rojo: **el esquema no era reproducible desde las migraciones.** Los entornos
-- funcionaban por lo que la plataforma les había hecho, no por lo que el
-- repositorio declara.
--
-- **Por qué es seguro otorgar tan ancho.** Es el modelo de Supabase: el permiso
-- de tabla es el portón y RLS es la cerradura. Verificado antes de escribir
-- esto: las 49 tablas de `public` tienen RLS activa, ninguna queda expuesta por
-- este grant. Sin RLS esto sería un agujero; con RLS es lo que ya hace el
-- entorno hosteado.
--
-- **Alcance deliberado:** no se otorga `execute` masivo sobre funciones. Varias
-- migraciones hacen `revoke all on function ... from public` a propósito, y un
-- grant general volvería a abrir justamente lo que quisieron cerrar. Las
-- funciones que la aplicación necesita ya tienen su `grant execute` explícito.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- Para que las tablas que creen las próximas migraciones nazcan con los mismos
-- permisos y no haya que acordarse de repetir esto.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
