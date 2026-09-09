# Tareas

Trazan a `R3-AG-06` de la spec madre.

## Fase 0 — La conexión pasa a ser de la empresa

- [x] **GCAL-CON-01** — Migración: `calendar_connections` cambia
  `unique (user_id)` por `unique (company_id)`; la RLS deja de exigir
  `user_id = auth.uid()` y mira empresa + rol. Ídem la de
  `calendar_order_events`. → GCAL-R1.7, DEC-GCAL-06
- [x] **GCAL-CON-02** — El callback hace upsert por `company_id`; la lectura
  del tablero y el sync buscan por empresa, no por usuario. → GCAL-R1.7
- [ ] **GCAL-CON-03** — Test pgTAP: un segundo gerente de la misma empresa ve
  la conexión existente; un gerente de otra empresa no la ve. → GCAL-R1.7

## Fase 1 — Calendario dedicado de la empresa

- [x] **GCAL-CAL-01** — Ampliar el scope a
  `https://www.googleapis.com/auth/calendar` en `connect/route.ts`.
  → GCAL-R1.2, DEC-GCAL-02
- [x] **GCAL-CAL-02** — `ensureCompanyCalendar()`: busca el calendario por el
  `calendar_id` guardado y, si no existe o no responde, crea uno nuevo
  «Se Instala — {empresa}». → GCAL-R1.2, GCAL-R1.3, DEC-GCAL-01
- [x] **GCAL-CAL-03** — El callback deja de escribir `"primary"` y guarda el
  id del calendario dedicado. → GCAL-R1.2
- [x] **GCAL-CAL-04** — Tests de `ensureCompanyCalendar`: reutiliza el
  existente, crea cuando el id murió, no duplica al reconectar.
  → AC-GCAL-B

## Fase 2 — Calendarizar una orden suelta, sin conectar nada

- [x] **GCAL-LNK-01** — `googleCalendarEventUrl(order, site, project)`:
  arma la URL de Google Calendar con el evento precargado. Fin exclusivo
  (`+1 día`) para que un trabajo de un día no se vea de dos.
  → GCAL-R3.1, GCAL-R3.2
- [x] **GCAL-LNK-02** — Tests: cruce de mes y de año, orden sin fecha de fin,
  escape de caracteres en dirección y título. → GCAL-R3.2
- [x] **GCAL-LNK-03** — Botón «Calendarizar» en la orden del instalador, al
  lado de «Aceptar», tamaño `field` como el resto del flujo de campo.
  → GCAL-R3.4, AC-GCAL-C
- [x] **GCAL-LNK-04** — El botón no se renderiza si la orden no tiene fecha.
  → GCAL-R3.5
- [x] **GCAL-LNK-05** — Mismo botón en la orden del lado empresa.
  → GCAL-R3.1

## Fase 3 — Control fino desde la empresa

- [x] **GCAL-EMP-01** — `syncOrderToCalendar(orderId)`: manda una orden
  puntual al calendario de la empresa, reutilizando `upsertEvent`.
  → GCAL-R2.3
- [x] **GCAL-EMP-02** — Botón «Mandar al calendario de la empresa» en la orden,
  visible sólo con conexión activa. → GCAL-R2.3
- [x] **GCAL-EMP-03** — Link «Abrir en Google Calendar» en el tablero, al
  calendario dedicado. → GCAL-R1.4

## Fase 4 — Cierre

- [x] **GCAL-QA-01** — `type-check`, `lint`, `test`.
- [ ] **GCAL-QA-02** — Verificar contra Demo en navegador real, con las
  credenciales de Google cargadas: conectar, ver el calendario creado,
  sincronizar, calendarizar una orden desde el celular.

## Fuera de alcance, a propósito

- **Compartir el calendario con el equipo.** Ver `DEC-GCAL-04`: Google comparte
  todo o nada y eso contradice el aislamiento por instalador que sostiene la
  RLS. Se comparte a mano desde Google si hace falta. **No es un olvido.**
- **Eventos horarios.** `R3-AG-06` sigue abierto; hoy las órdenes tienen fecha
  y no hora, y decidir la hora es dominio, no calendario.
- **Importar desde Google hacia la app.** Es `FUT-05`. La app es la fuente de
  verdad.
- **Tocar `/agenda` y `/schedule`.** Ya resuelven ver el trabajo adentro del
  producto, respetando permisos.

## Gaps reales, documentados y no cerrados

- **El evento del instalador es una copia que se desactualiza.** Si reprograman
  la orden, su calendario queda con la fecha vieja. Cerrarlo es la fase 2 de
  `DEC-GCAL-03` (OAuth por instalador) y está bloqueado por la verificación de
  Google, no por trabajo pendiente.
- **En modo Testing los tokens caducan a los 7 días.** La conexión de la
  empresa se va a cortar sola cada semana hasta que la app esté verificada. No
  es un bug: es cómo trata Google a las apps sin publicar.
- **La integración sigue sin poder probarse de punta a punta** hasta que estén
  cargadas `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y
  `GOOGLE_TOKEN_ENCRYPTION_KEY`. Es lo primero que hay que destrabar.

## Verificación

- `type-check`, `lint` y **504 tests** en verde (20 nuevos sobre el armado de
  la URL de Google y sobre no duplicar el calendario al reconectar).
- **Sin verificar en navegador todavía**: hace falta que estén cargadas las
  credenciales de Google y aplicar la migración a producción. Es lo que queda.
