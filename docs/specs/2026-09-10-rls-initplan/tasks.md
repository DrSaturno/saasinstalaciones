# Tareas

## Fase 0 — Fotografía previa (antes de tocar nada)

- [x] **RLS-PRE-01** — Registrar, por tabla central, cuántas filas ve hoy una
  sesión de gerente y una de instalador. Es la línea de base contra la que se
  compara después. → AC-RLS-B
- [x] **RLS-PRE-02** — Registrar el conteo del lint `auth_rls_initplan` (60).

## Fase 1 — El barrido

- [x] **RLS-MIG-01** — Migración con el bloque `DO` que envuelve `auth.uid()`,
  `auth_role()` y `auth_company()` en las políticas de `public`.
  → RLS-R1.1, DEC-RLS-01, DEC-RLS-02
- [x] **RLS-MIG-02** — Aplicar a **Demo** y comparar contra la fotografía
  previa. → AC-RLS-B
- [x] **RLS-MIG-03** — Confirmar en Demo que el lint da 0. → AC-RLS-A
- [x] **RLS-MIG-04** — Aplicar a **Producción** (con autorización explícita) y
  repetir las dos verificaciones.

## Fase 2 — Que no vuelva

- [x] **RLS-QA-01** — Test pgTAP: ninguna política de `public` llama directo a
  `auth.uid()`, `auth_role()` ni `auth_company()`. → RLS-R3.1, DEC-RLS-05
- [x] **RLS-QA-02** — Los pgTAP de RLS existentes pasan **sin modificarse**.
  → AC-RLS-C
- [x] **RLS-QA-03** — `type-check`, `lint`, `test`, `build`.

## Fuera de alcance, a propósito

- **Fusionar políticas superpuestas** (`multiple_permissive_policies`, 302
  casos). Toca la lógica de acceso, no sólo su forma. Spec aparte.
- **Índices en claves foráneas** (111 casos, nivel INFO).
- **Las consultas repetidas entre middleware y layout.** Real pero menor, y es
  código de aplicación.

## Gaps reales, documentados y no cerrados

- **No se puede medir la mejora localmente.** No hay Docker en esta máquina,
  así que no hay forma de correr un `explain analyze` comparativo contra una
  base con volumen. Con 30 órdenes en Producción la diferencia va a ser
  chica; el patrón importa cuando un proyecto tenga 2000 puntos, que es el
  caso de uso que el producto declara.
- **El barrido es un corte en el tiempo.** No arregla políticas que se agreguen
  después; para eso está `RLS-QA-01`.

## Verificación

**El lint pasó de 60 a 0** en Demo y en Producción, confirmado con el asesor de
Supabase después de aplicar.

**El acceso no cambió, y eso se probó midiendo, no razonando.** Antes de tocar
nada se fotografió cuántas filas ve cada actor bajo RLS real (impersonando por
`set_config('request.jwt.claims')` + `set local role authenticated`), y después
se repitió idéntica:

- **Demo** — 4 actores x 8 tablas = 32 números. Los 32 iguales. El gerente de
  la otra empresa sigue viendo 0 de las 20 órdenes ajenas; el instalador sigue
  viendo sus 10.
- **Producción** — 4 actores x 9 tablas = 36 números. Los 36 iguales.

**El test de regresión se probó en los dos sentidos.** Correrlo sobre la base
sana da 0 detecciones; rompiendo una política a propósito
(`work_orders_installer_read`) da 1. Un assert que no puede fallar no es un
test, así que se verificó que este sí puede. La rotura deliberada se revirtió
sola: iba dentro de una transacción que termina en `raise exception`.

**CI en verde en los tres jobs**, incluido pgTAP: el test nuevo pasa y los de
RLS que ya existían pasan **sin modificarse**. Ese era el criterio de
`AC-RLS-C` — si alguno hubiera necesitado ablandarse, la migración habría
cambiado permisos.

**Lo que NO se pudo medir:** la mejora en milisegundos. Sin Docker no hay forma
de correr un `explain analyze` comparativo, y con 60 órdenes en Producción la
diferencia es chica igual. El patrón importa cuando un proyecto tenga 2000
puntos — que es el caso de uso que el producto declara.
