# Bloque 7 — Link público de seguimiento para el cliente final

Pedido original (24-09-2026): que el cliente de la empresa pueda seguir el
estado de su proyecto sin que la empresa tenga que actualizarlo a mano. Ver
`../2026-09-24-hoja-de-ruta-v2/README.md` para el paquete completo.

## Por qué es distinto a todos los bloques anteriores

Ningún bloque anterior expone datos sin sesión. Este sí: es la primera
**superficie pública** real del producto (aparte de `/invite/[token]`, que no
muestra datos operativos, sólo confirma una invitación). Todo el diseño gira
alrededor de una pregunta: ¿qué puede ver alguien que tiene el link pero no
tiene cuenta, y qué pasa si el link se filtra?

## Decisión ya tomada (24-09-2026, hoja de ruta)

Sin login, con token difícil de adivinar y revocable, sin expiración salvo
revocación. Muestra: % de avance, estado, hitos y fotos aprobadas. Nunca:
importes, nombres de instaladores, teléfonos.

## Precedente que se reutiliza

`invitation_preview(p_token uuid)` — la única función `security definer` que
el propio proyecto ya dejó a propósito ejecutable por `anon`, revisada y
aprobada por la auditoría de seguridad (SEC-01/02/03,
`supabase/migrations/20260904123451_rpc_execute_hardening.sql`). Es keyed por
un `uuid` de `gen_random_uuid()` (128 bits, no adivinable) y sólo expone lo
mínimo. Este bloque calca ese patrón: una función nueva,
`project_tracking_snapshot(p_token uuid)`, con el mismo criterio.

## Lo que NO se reutiliza de `invitations`

`invitations.expires_at` expira por diseño (7 días). Este link es al revés:
**no expira solo, sólo por revocación explícita**. Por eso es una tabla
nueva (`project_tracking_links`) con `revoked_at`, no una reutilización de
`invitations`.

## El problema real: mostrar fotos sin sesión

Las fotos de avance (`order_updates.photos`) son rutas dentro del bucket
**privado** `evidence`; mostrarlas exige una URL firmada
(`supabase.storage.createSignedUrls`), y firmar exige que la RLS de
`storage.objects` autorice al rol que pide la firma. La página pública corre
sin sesión — es decir, como `anon` — y hoy `anon` no tiene ningún permiso
sobre ese bucket.

**Se descartó** resolverlo con `lib/supabase/admin.ts` (service_role): ese
archivo tiene una restricción dura y documentada en `AGENTS.md` — sólo se
importa en `app/api/master/**` y en `lib/actions/invite-signup.ts`.
Ampliarla para este caso sería debilitar una regla de seguridad explícita
por conveniencia, cuando hay una salida que no la toca.

**Solución elegida:** una política de RLS nueva sobre `storage.objects`,
acotada al bucket `evidence`, que deja leer (para firmar) sólo fotos de
órdenes `finalizada` cuyo proyecto tenga **un link de seguimiento activo**.
No sabe cuál token específico está mirando la página — RLS no puede leer un
valor arbitrario de la request— pero como **sólo existe un link activo por
proyecto a la vez** (ver diseño), "el proyecto tiene un link activo" y "este
token es el válido" son la misma pregunta en la práctica: revocar el único
link activo de un proyecto corta el acceso a sus fotos igual que si la
policy conociera el token.

**Límite conocido, documentado a propósito:** alguien que ya tenga una URL
firmada (30 minutos de vida, igual que el resto del código) la conserva
hasta que expira, aunque el link se revoque en el medio. Es el mismo
comportamiento que ya tiene toda URL firmada del proyecto; no es nuevo de
este bloque.

## Documentos

- `requirements.md` — requisitos trazables (`LINKCLI-*`).
- `design.md` — esquema, la RPC pública, la política de storage, el rate
  limiting y qué cuenta como "hito" y "foto aprobada" (ninguno de los dos
  tiene una definición previa en el dominio; se definen acá).
- `tasks.md` — fases de implementación.
