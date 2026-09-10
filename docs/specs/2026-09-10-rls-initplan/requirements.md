# Requisitos

## RLS-R1 — Que la identidad se calcule una vez por consulta

- **RLS-R1.1** — Ninguna política de `public` llama a `auth.uid()`,
  `auth_role()` ni `auth_company()` de forma directa: todas las envuelven en
  una subconsulta escalar.
- **RLS-R1.2** — El lint `auth_rls_initplan` del asesor de Supabase pasa de
  **60 a 0**.

## RLS-R2 — Que NO cambie quién ve qué

Es el requisito que manda: esto es una optimización, y una optimización que
altere el acceso es un incidente de seguridad.

- **RLS-R2.1** — Para cada política modificada, la expresión nueva es
  **lógicamente equivalente** a la vieja: sólo se envuelven llamadas a
  funciones sin argumentos.
- **RLS-R2.2** — Un gerente sigue viendo exactamente las mismas filas que
  antes, en todas las tablas.
- **RLS-R2.3** — Un instalador sigue viendo sólo lo suyo, y ninguna fila de
  otra empresa.
- **RLS-R2.4** — El aislamiento entre empresas se mantiene: ninguna consulta
  cruza tenants.

## RLS-R3 — Que no se vuelva a introducir

- **RLS-R3.1** — Hay un test que falla si alguien agrega una política nueva
  con una llamada directa. Sin esto, el arreglo se degrada solo con la próxima
  migración que agregue una tabla.

## Criterios de aceptación

- **AC-RLS-A** — `get_advisors(performance)` reporta `auth_rls_initplan` en 0.
- **AC-RLS-B** — Antes y después de la migración, la misma sesión de gerente y
  la misma de instalador devuelven **idéntica cantidad de filas** en las
  tablas centrales (`work_orders`, `sites`, `projects`, `profiles`).
- **AC-RLS-C** — Los tests pgTAP de RLS que ya existen siguen pasando sin
  modificarse. Si alguno hubiera que ablandarlo, la migración está mal.
