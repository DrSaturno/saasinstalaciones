# Google Calendar: calendario de empresa y calendarizar desde la orden

## Contexto

Traza a `R3-AG-06` de `docs/specs/2026-08-04-evolucion-producto/`
("Adaptar Google Calendar a eventos horarios opt-in sin convertirlo en fuente
de verdad"), que sigue sin marcar, y corrige lo que `current-state.md:183`
describe hoy: *"Google Calendar opcional, actualmente con eventos all-day del
manager"*.

## Auditoría previa: qué existe de verdad

Contra la intuición inicial —que había que traer código del proyecto legacy
`proyecto1`— **la integración ya está construida y es más completa que la del
legacy**. Lo verificado antes de escribir nada:

| Pieza | Estado |
|---|---|
| Flujo OAuth (connect + callback + state anti-CSRF) | Existe |
| Tokens cifrados en la base (AES-256-GCM) | Existe |
| Refresh automático del token | Existe |
| Sincronización de todas las órdenes con fecha | Existe |
| Borrado del evento al cancelar la orden | Existe |
| Tablas `calendar_connections` y `calendar_order_events` con RLS | Existe |
| Controles en el tablero (conectar / sincronizar / desconectar) | Existe |

Lo que el legacy tenía y acá no falta nada: `proyecto1` sólo llegaba a
crear/editar/borrar un evento, sin cifrado, sin refresh, sin mapeo orden↔evento
y sin aislamiento por empresa. **No se porta código de ahí.**

Lo que falta es de otra naturaleza:

1. **Configuración.** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y
   `GOOGLE_TOKEN_ENCRYPTION_KEY` están vacías, así que la app muestra
   "necesita configuración" y nunca ofrece conectar. Es tarea de Nicolás, no
   de código.
2. **Las órdenes van a la agenda personal** de quien conecta
   (`calendar_id: "primary"`), mezcladas con su vida privada.
3. **No hay forma de calendarizar una orden suelta.** La sincronización es
   todo o nada, y el instalador —que no tiene ni va a tener la cuenta
   conectada— no tiene ninguna.

## Los tres documentos

- [requirements.md](requirements.md) — qué tiene que poder hacer cada actor.
- [design.md](design.md) — las decisiones y por qué, incluidas las dos que se
  tomaron en contra de lo pedido inicialmente.
- [tasks.md](tasks.md) — el plan por fases, con lo que queda fuera de alcance.

## Frontera: qué NO toca esta spec

- **No comparte el calendario con el equipo.** Se decidió que el calendario es
  de quien administra la cuenta; compartirlo se hace a mano desde Google
  cuando haga falta. El motivo está en `DEC-GCAL-04` y no es de comodidad.
- **No conecta la cuenta de Google del instalador.** Queda especificado como
  fase 2 en `tasks.md`, bloqueado por la verificación de Google.
- **No cambia los eventos all-day a eventos horarios.** `R3-AG-06` sigue
  abierto en la spec madre; esta spec no lo cierra.
- **No importa nada desde Google hacia la app.** La app es la fuente de
  verdad; la importación bidireccional es `FUT-05`.
- **No toca el módulo Agenda de la app** (`/agenda` y `/schedule`), que ya
  resuelve ver las órdenes adentro del producto y es independiente de Google.
