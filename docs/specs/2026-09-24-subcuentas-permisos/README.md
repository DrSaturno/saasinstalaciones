# Subcuentas y permisos del gerente

Bloque 4 de [`../2026-09-24-hoja-de-ruta-v2/`](../2026-09-24-hoja-de-ruta-v2/README.md).
Estado (24-09-2026): **implementación en curso, sólo en Demo** (ver [tasks.md](tasks.md)).

## Contexto

Pedido: GF Instalaciones tiene 3 personas usando la misma cuenta de gerente. Hace falta un
usuario **gerente** (dueño) que pueda crear **subcuentas** para el personal administrativo de su
empresa, con permisos, y seguir controlando todo desde la suya.

Este bloque es la base que los bloques 8 (importes) y el resto asumían: block 8 dejó
`auth_can_see_commercials` con un punto de extensión explícito «para cuando exista el permiso que
el gerente le da a otra persona». Éste es ese bloque.

## Auditoría: qué ya existe y qué hay que evitar romper

- **`profiles.role`** es texto con sólo tres valores (`platform_admin`, `company_manager`,
  `installer`) — no es un enum de Postgres, así que sumar un valor no exige migrar tipos.
- **~30 políticas RLS y ~27 acciones de servidor** verifican `auth_role() = 'company_manager'` (o
  su equivalente `user.role === "company_manager"`) para dar acceso operativo completo: proyectos,
  órdenes, agenda, locaciones, clientes, convocatorias, equipo. Ninguna hoy distingue «el dueño» de
  «alguien de su empresa» — es un cubo, no una capacidad.
- **`handle_new_user`** (el trigger que crea el perfil al registrarse, endurecido por SEC-16) sólo
  lee `role`/`company_id` de `raw_app_meta_data`, nunca de lo que manda el cliente. Es el único
  lugar donde nace un `company_manager`.
- **`lib/supabase/admin.ts` (service_role) sólo se puede importar en `app/api/master/**` y en
  `lib/actions/invite-signup.ts`** (regla no negociable de `AGENTS.md`). Sólo hay dos caminos hoy
  para crear una cuenta: el alta de empresa por el tablero maestro, y `invite-signup.ts` (alta de
  **instalador** por invitación, con el rol fijado en el servidor). Una subcuenta de gerente
  **tiene** que nacer por ese segundo camino, generalizándolo — no por uno nuevo.
- **`accept_invitation`** (la RPC que acepta una invitación) exige `auth_role() in ('installer',
  'coordinator')` y hace inserts específicos de instalador (`company_installers`, `chat_threads`):
  no sirve para un alta de gerente y no conviene forzarla. Se agrega una RPC paralela.
- **`invitations.role`** ya es una columna (hoy sólo `installer`/`coordinator`): se extiende su
  `check` en vez de agregar una columna «kind» nueva.
- **Ganador ya existente:** `auth_is_company_manager(company_id)` seguirá dando `true` para el
  dueño y para las subcuentas por igual — es exactamente lo que el pedido quiere para «todo lo
  operativo». El trabajo de este bloque es acotado a las tres excepciones.

## Los tres documentos

- [requirements.md](requirements.md)
- [design.md](design.md)
- [tasks.md](tasks.md)

## Frontera: qué NO toca

- **No re-escribe ninguna de las ~30 políticas operativas.** Es la decisión de diseño central: se
  aprovecha que ya conceden acceso a «cualquier `company_manager` de la empresa».
- **No permite borrar ni desactivar una subcuenta.** Ninguna cuenta de ningún rol se puede borrar
  hoy en el código (ni instalador, ni gerente); no se inventa esa capacidad para éste. Se puede
  crear y ajustar permisos; revocar el acceso completo queda para otro pedido.
- **No cambia quién gestiona el equipo de instaladores** (invitar, promover a coordinador): eso ya
  es operativo y una subcuenta lo sigue haciendo igual que el dueño.
- **No aplica nada a producción** sin autorización explícita; primero Demo.
