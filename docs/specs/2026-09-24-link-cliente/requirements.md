# Requisitos — LINKCLI-*

## El link

- **LINKCLI-R1.1** — Quien puede operar el proyecto (`can_operate_project`:
  el gerente de la empresa, o el coordinador asignado a ese proyecto — mismo
  criterio que ya decide quién le escribe al cliente) puede generar un link
  de seguimiento para ese proyecto.
- **LINKCLI-R1.2** — Sólo hay un link **activo** por proyecto a la vez.
  Generar uno nuevo revoca el anterior (regenerar = revocar + crear).
- **LINKCLI-R1.3** — Quien puede operar el proyecto puede revocarlo en
  cualquier momento, sin que eso borre el historial (fila con
  `revoked_at`, no un `delete`).
- **LINKCLI-R1.4** — El token es un `uuid` de `gen_random_uuid()` (128 bits),
  mismo estándar que `invitations.token` — no hay necesidad de más entropía.

## Lo que ve el cliente

- **LINKCLI-R2.1** — Sin login. La página resuelve sólo con el token de la
  URL.
- **LINKCLI-R2.2** — Muestra: nombre del proyecto, nombre del cliente (el
  suyo propio), estado, porcentaje de avance
  (`finalizadas ÷ (total − canceladas)`, el mismo cálculo del bloque 6),
  hitos, fotos aprobadas.
- **LINKCLI-R2.3** — Un "hito" es una orden no cancelada del proyecto:
  nombre del sitio (sin dirección ni teléfono de contacto), título de la
  orden, estado traducido a lenguaje de cliente, y fecha (de cierre si está
  finalizada, comprometida si no). Sin nombre de instalador.
- **LINKCLI-R2.4** — Una "foto aprobada" es una foto de `order_updates.photos`
  perteneciente a una orden en estado `finalizada` — es la única aprobación
  que existe hoy en el dominio para el ciclo de una orden completa
  (`reviewOrderDelivery` → `approve` → `finalizada`). No existe aprobación
  foto por foto; no se inventa una para este bloque.
- **LINKCLI-R2.5** — Nunca: `amount`, `installer_amount`,
  `contract_amount`, ningún nombre ni teléfono de instalador, dirección
  exacta ni contacto del sitio.
- **LINKCLI-R2.6** — Un token inexistente o revocado muestra un estado de
  "link no disponible", nunca un error que distinga "no existe" de
  "revocado" (mismo motivo que `invitation_preview`: no convertir el
  endpoint en un oráculo).

## Seguridad de la superficie nueva

- **LINKCLI-R3.1** — La página pública está limitada por IP
  (`enforceRateLimit`, mismo mecanismo que `/login` y el reset de
  contraseña) — no es una defensa contra fuerza bruta del token (128 bits lo
  hace inviable), es una defensa contra scraping/abuso.
- **LINKCLI-R3.2** — Ninguna función nueva de este bloque se ejecuta por
  `anon` sin que el revoke explícito lo confirme (ver la trampa del bloque 5:
  `revoke ... from public` no alcanza en este proyecto, hace falta
  `from public, anon` explícito).
- **LINKCLI-R3.3** — La política de storage nueva se prueba contra Demo
  antes de darla por buena: que un link activo deje firmar las fotos de sus
  órdenes finalizadas, que un link revocado no deje firmar nada, y que las
  fotos de OTRO proyecto (sin link, o con link revocado) sigan inaccesibles.

## Trazabilidad

Traza a `supabase/tests/project_tracking_links.test.sql`.
