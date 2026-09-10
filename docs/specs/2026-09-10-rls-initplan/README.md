# RLS: dejar de recalcular la identidad en cada fila

## Contexto

Nicolás reportó que la app "se siente lenta en cada acción, al pasar de módulo
a módulo". No era una sensación: el asesor de rendimiento de Supabase reporta
**60 políticas** con el patrón `auth_rls_initplan`.

## Qué pasa hoy

Una política escrita así:

```sql
using (assigned_installer_id = auth.uid())
```

hace que Postgres evalúe `auth.uid()` **una vez por cada fila** que filtra, en
vez de una vez por consulta. Con `auth.uid()` solo el costo es parsear el JWT;
el problema real son las funciones propias del proyecto, que hacen una
**consulta a otra tabla**:

```sql
create function auth_role() ... as $$
  select role from public.profiles where id = auth.uid()
$$;
```

`work_orders_company_all` la llama en su `using`. Traer 50 órdenes al tablero
son **50 búsquedas repetidas en `profiles`** para responder siempre lo mismo.
Multiplicado por `auth_company()`, que hace otra consulta con un join a
`companies`, y por cada tabla que se toca en una pantalla.

## El arreglo

Envolver la llamada en una subconsulta escalar:

```sql
using (assigned_installer_id = (select auth.uid()))
```

Postgres reconoce eso como un **InitPlan**: lo calcula una vez, guarda el
resultado y lo reusa para todas las filas. Es la remediación que documenta
Supabase para este lint.

**No cambia quién ve qué.** Una subconsulta escalar sobre una función sin
argumentos devuelve exactamente el mismo valor que la llamada directa. Cambia
*cuántas veces* se calcula, no *qué* se calcula.

## Los tres documentos

- [requirements.md](requirements.md)
- [design.md](design.md)
- [tasks.md](tasks.md)

## Frontera: qué NO toca

- **No fusiona políticas superpuestas.** El asesor también reporta
  `multiple_permissive_policies` (302 casos; 24 en `work_orders`, `sites` y
  `projects`). Eso NO es duplicación por descuido: es el modelo de actores
  —gerente ve todo, coordinador lo suyo, instalador lo asignado— y fusionarlo
  toca la lógica de acceso de verdad. Queda para una spec propia.
- **No toca `can_operate_project()` ni `company_is_active()`.** Reciben un
  argumento que depende de la fila, así que no se pueden cachear por consulta.
  Optimizarlas es rediseñarlas.
- **No agrega índices.** El asesor reporta 111 claves foráneas sin índice
  (nivel INFO). Es otro tema, con otro criterio.
- **No toca las consultas repetidas del layout** (middleware y layout piden el
  mismo perfil dos veces por navegación). Es real pero mucho menor, y es
  código de aplicación, no de base.
