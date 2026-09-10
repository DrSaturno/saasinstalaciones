# Diseño

## DEC-RLS-01 — Un barrido programático, no 107 sentencias transcriptas

Son **107 de 140 políticas** las que hay que reescribir. La migración usa un
bloque `DO` que recorre `pg_policies`, aplica la sustitución sobre la
definición **real** y ejecuta `ALTER POLICY`.

**Por qué no escribir las 107 a mano:** habría que copiar 107 expresiones
—algunas de 6 líneas con joins y subconsultas anidadas— desde el deparse de
Postgres a un archivo. Cada una es una oportunidad de equivocarse en un
paréntesis, y un paréntesis mal puesto en una política de RLS no rompe: deja
pasar o deja afuera. El barrido no puede equivocarse al transcribir porque no
transcribe.

**Lo que se pierde:** leyendo la migración no se ve el texto resultante de cada
política. Se compensa con la verificación de `tasks.md`, que compara el estado
real de la base antes y después.

## DEC-RLS-02 — Sólo funciones SIN argumentos

Se envuelven exactamente tres: `auth.uid()`, `auth_role()`, `auth_company()`.

**Por qué sólo esas:** una subconsulta escalar se puede izar a InitPlan sólo si
su resultado no depende de la fila. `can_operate_project(project_id)` y
`company_is_active(company_id)` reciben una columna, así que su valor cambia
fila a fila — envolverlas no ganaría nada y el planificador no podría cachearlas
igual.

`auth_companies('coordinator')` tampoco se toca: **ya** aparece dentro de un
`IN ( SELECT ... )`, que es la misma optimización escrita de otra forma. El
barrido la deja intacta, verificado sobre `work_orders_coordinator_all`.

## DEC-RLS-03 — Idempotente por construcción

El barrido reescribe sólo si el texto cambia (`is distinct from`). Corriéndolo
dos veces, la segunda no hace nada: después de la primera pasada ya no hay
llamadas directas que sustituir.

Importante: Postgres **normaliza** el deparse. Lo que se escribe como
`(select auth.uid())` vuelve como `( SELECT auth.uid() AS uid)`. Por eso la
verificación NO se hace con una expresión regular sobre el texto —que se
rompería con esa normalización— sino corriendo de nuevo el asesor de Supabase,
que es quien define el criterio.

## DEC-RLS-04 — La verificación es funcional, no sintáctica

Que el lint dé cero prueba que el patrón desapareció. **No prueba que el acceso
no cambió**, que es lo único que realmente importa acá.

Por eso `tasks.md` exige comparar, antes y después, cuántas filas ve una sesión
de gerente y una de instalador en las tablas centrales. Si un número se mueve,
la migración se revierte: significa que una política cambió de significado.

## DEC-RLS-05 — El test de regresión mira `pg_policies`, no el código

Una política nueva puede entrar por cualquier migración futura. El test pgTAP
consulta el catálogo de Postgres y falla si aparece una llamada directa, sin
importar en qué archivo se haya escrito.

Sin esto, el arreglo se degrada solo: la próxima tabla que alguien agregue va a
copiar el patrón viejo de la tabla de al lado.
