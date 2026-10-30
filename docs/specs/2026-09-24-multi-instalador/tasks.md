# Tareas

Orden estricto. Nada llega a producción sin autorización explícita y sin
haberse probado en Demo. Diseño aditivo (ver `design.md`): cada fase se
puede probar sin romper el camino de una sola persona por orden, que sigue
siendo el caso común.

## Fase 0 — Pruebas primero (pgTAP)

- [x] **MULTIINST-T-01** — `supabase/tests/work_order_team.test.sql`: agregar
  un ayudante corre los mismos chequeos que asignar hoy (elegibilidad,
  ausencia, solapamiento, traslado con override); no se puede agregar al
  mismo responsable como ayudante; tope de 15; quitar un ayudante no requiere
  el gate; el responsable no se puede quitar por esta vía; un ayudante ve la
  orden y puede avanzar su estado; alguien fuera del plantel no ve nada;
  dinero por ayudante independiente del responsable y de otros ayudantes; un
  instalador no ve el monto de otro en la misma orden. → MULTIINST-R1..R5.
  27 assertions, verificadas una por una contra Demo con el arnés manual de
  diagnóstico (no sólo `finish()`). Encontró y corrigió dos bugs reales antes
  de cerrar la fase: `assignment_command_receipts.assignment_id` esperaba un
  `work_assignments.id`, no un `work_order_team_members.id` (violaba la FK); y
  `installer_earnings` filtraba por la RLS de `work_orders` de fondo, que
  ahora también deja pasar a los ayudantes — sin el filtro explícito
  `assigned_installer_id = auth.uid()` en su primera mitad, un ayudante veía
  el monto del responsable con sólo poder leer la orden.
  `required_installers` (MULTIINST-R6) validado por inspección de la migración,
  sin caso de prueba dedicado — pendiente si se quiere blindar antes de Fase 4.

## Fase 1 — Migración (Demo)

- [x] **MULTIINST-T-02** — Relajado `work_assignments_one_current_idx` a
  `(activity_id, installer_id)`.
- [x] **MULTIINST-T-03** — Tabla `work_order_team_members` + índice único +
  RLS (lectura: dueño de la fila o quien opera la orden; sin insert/update/delete
  directo, sólo vía funciones `security definer`).
- [x] **MULTIINST-T-04** — `add_order_team_member(...)` y
  `remove_order_team_member(...)`.
- [x] **MULTIINST-T-05** — `auth_is_order_helper(order_id)`.
- [x] **MULTIINST-T-06** — Extendido con OR: `work_orders_installer_read`,
  `work_orders_installer_progress`, `order_incidents_installer_read`,
  `order_incidents_installer_insert`, `order_payment_events_installer_read`.
- [x] **MULTIINST-T-07** — `order_payment_events` ganó `installer_id`
  nullable; `set_team_member_amount`, `set_team_member_payment_status`.
- [x] **MULTIINST-T-08** — `installer_earnings`: `union all` con la mitad de
  ayudantes (columna renombrada `assigned_installer_id` → `installer_id`,
  ver T-16 para los llamadores actualizados).
- [x] **MULTIINST-T-09** — `validate_order_transition` (trigger): responsable
  O ayudante activo, en vez de sólo responsable.
- [x] **MULTIINST-T-10** — `work_orders.required_installers`
  (`smallint`, 1-15, default 1).
- [x] **MULTIINST-T-11** — Chat grupal, migración `20260925000004_order_team_chat.sql`
  (aplicada a Demo): tabla `order_chat_messages` (la orden ES el hilo: sin tabla
  de hilos, sin membresía guardada — se deriva del plantel activo y de quien
  opera la orden vía `auth_can_use_order_chat`), append-only (privilegios de
  update/delete revocados además de sin policy), `sender_name` copiado por
  trigger (un instalador no puede leer perfiles de la empresa), aviso in-app a
  responsable, ayudantes, gerentes y coordinador del proyecto (nunca al
  remitente), publicación en Realtime, y `order_team_size()` para que el
  responsable —que por RLS no ve las filas del plantel— sepa que el chat existe.
  pgTAP `order_team_chat.test.sql` (19 chequeos; corridos en Demo con el arnés
  manual: 17 pasaron a la primera y los 2 restantes —update/delete— destaparon
  que los privilegios por defecto de Supabase le dan todo a `authenticated`;
  se revocaron y se verificó `42501`).
- [x] **Hallazgo de seguridad, fuera de la lista original** — `revoke all on
  function ... from public` NO alcanza para bloquear `anon` en este proyecto
  (comprobado con el advisor de seguridad de Supabase): las cuatro funciones
  de escritura quedaban ejecutables por `anon` pese al revoke de siempre.
  Corregido con `revoke ... from public, anon` explícito. Se flaggeó una
  auditoría aparte (`task_cd4a4476`) para revisar si funciones viejas del
  proyecto tienen el mismo agujero — no se tocó nada de eso acá, sólo lo nuevo
  de este bloque.

## Fase 2 — Código

- [x] **MULTIINST-T-14** — `lib/domain/order-rules.ts`: `OrderRuleContext`
  ganó `helperInstallerIds`; las tres comparaciones de identidad
  (`onlyInstallerStarts`, `onlyInstallerReviews`, `noSelfApproval`) revisan
  responsable y ayudantes vía `isTeamMember()`. Espejo exacto de
  MULTIINST-T-09. 5 tests nuevos en `order-rules.test.ts`.
- [x] **MULTIINST-T-15 (parcial)** — `lib/actions/tasks.ts`: los tres guardas
  reales (`installerTransition`, `addUpdate`, `reportBlocker`) pasan a aceptar
  responsable O ayudante activo, vía el helper compartido
  `fetchOrderHelperIds`. `acceptOrder` queda **a propósito** sólo para el
  responsable: `installer_accepted_at` es una columna por orden, no por
  persona, y no hay todavía un concepto de "aceptación" individual por
  ayudante. **Sin tocar todavía**: `lib/actions/incidents.ts`,
  `lib/data/tasks.ts`, `app/(installer)/route/page.tsx`,
  `lib/data/installer-home.ts`, `lib/data/agenda.ts` (mitad instalador),
  `lib/data/reschedules.ts` — cada uno tiene su propio filtro explícito
  `assigned_installer_id = user.id`, documentado como deliberado (no
  delegado a RLS) en su propio comentario; extenderlos es mecánico pero no
  se hizo todavía.
- [x] **MULTIINST-T-16 (parcial)** — `lib/data/installer-finance.ts`: filtro
  actualizado a `installer_id` (el nombre de columna que ahora usa la vista).
  `app/api/orders/[id]/pdf/route.tsx`: el PDF de un ayudante muestra su propio
  monto (`work_order_team_members.installer_amount`), nunca el del
  responsable. **Sin tocar todavía**: `lib/data/finance.ts`,
  `lib/data/dashboard.ts`, `app/(company)/projects/[id]/page.tsx`,
  `app/(company)/orders/[id]/page.tsx` — el tablero financiero de la empresa
  todavía no suma el costo de los ayudantes al costo de instalador por orden.
- [x] **MULTIINST-T-13 / T-17** — `lib/actions/orders/team.ts`
  (`addOrderTeamMember`, `removeOrderTeamMember`, `setTeamMemberAmount`,
  `setTeamMemberPaymentStatus`; traducen los errores `TEAM_FULL`,
  `TEAM_ALREADY_LEAD`, `ORDER_NEEDS_LEAD_FIRST` y reusan los códigos del gate),
  `lib/data/order-team.ts` y `components/company/order-team-panel.tsx`, montado
  en la ficha de orden (`/orders/[id]`) para quien opera la orden y sólo con un
  responsable ya asignado. El gerente ve y edita monto y cobro por ayudante; el
  coordinador ve el plantel sin plata. **Sin override de traslado en la UI**
  (igual que el «asignar» rápido de hoy): si el gate bloquea por traslado, el
  error se muestra y no se ofrece forzarlo.
- [x] **MULTIINST-T-15** — Extendidos a «responsable o ayudante activo»:
  `lib/actions/incidents.ts`, `lib/data/tasks.ts` (mis tareas),
  `lib/data/installer-home.ts`, `app/(installer)/route/page.tsx`,
  `lib/data/agenda.ts` (mitad instalador) y `lib/data/reschedules.ts`, vía el
  helper `orderScopeFilter` (arma un `.or()` con las órdenes propias más las
  del plantel). Los filtros siguen explícitos, no delegados a RLS, por el mismo
  motivo que ya documentaba cada archivo.
- [x] **MULTIINST-T-16** — Costo de ayudantes sumado en `/finance`
  (`FinanceOrderInput.teamCost`, sólo al costo y al margen — **no** a «pendientes
  de pago», que sigue siendo por responsable) y en la ficha de proyecto
  (embed `work_order_team_members` en la consulta de órdenes que ya existía).
  **Cerrado en la tanda 3:** `FinanceOrderInput.team` (por ayudante). El
  desglose «por instalador» atribuye a cada persona SU costo (el ingreso va sólo
  al responsable, así que sumando personas `orders` puede superar el total de
  órdenes), y «Pendientes de pago» lista la deuda de cada ayudante en su propia
  fila (`memberInstallerId`), que se salda con `set_team_member_payment_status`.
  **Además, un hueco cerrado:** `set_team_member_amount` y
  `set_team_member_payment_status` (security definer) dejaban a un coordinador
  fijar montos y cobros llamando la RPC directo; ahora exigen gerente
  (`auth_is_company_manager`), como `installer_amount` del responsable. Aplicado
  a Demo; sin pgTAP de coordinador todavía.
- [x] **MULTIINST-T-19** — Avisos al equipo, migración
  `20260925000003_team_notification_fanout.sql` (aplicada a Demo):
  (a) `notify_team_member_added` (trigger): sumar o reactivar a un ayudante crea
  la notificación «orden asignada» — antes **no existía**, y el push que la app
  disparaba al sumarlo no tenía nada que entregar; (b)
  `reschedule_order_with_notice` y `notify_review_decision` avisan también a los
  ayudantes activos (fecha nueva; entrega devuelta/aprobada). **Sin cambio a
  propósito:** la pregunta de reprogramación, su plazo, el recordatorio y la
  penalización siguen siendo sólo del responsable; el aviso de baja también
  (sólo lo pide el responsable). Verificado en Demo con transacciones que se
  revierten (review: responsable y ayudante reciben 1 c/u; alta: 1 aviso).
  pgTAP: 2 chequeos nuevos en `work_order_team.test.sql`.
- [x] **MULTIINST-T-12** — `send-event-push`: el evento `order_assigned` acepta
  como destinatario a un ayudante activo (antes daba 403 si `subjectId` no era
  el responsable). **Cambio en el código fuente; falta redesplegar la función**
  (lo hace Nicolás, ver `PENDIENTES_NICOLAS.md`).
- [x] **MULTIINST-T-18** — Chat grupal en la app: `components/shared/order-chat-panel.tsx`
  (Realtime + envío optimista idempotente por uuid del cliente),
  `lib/actions/order-chat.ts`, `lib/data/order-chat.ts`; montado en
  `/orders/[id]` y `/tasks/[id]` sólo cuando la orden tiene al menos un ayudante
  activo. **Límites de esta versión:** sólo texto (sin adjuntos ni respuestas
  citadas), sin tildes de leído, sin paginación (últimos 200), sin aviso de
  «escribiendo». El hilo 1:1 de siempre no se toca.
- [x] **MULTIINST-T-20 (parcial)** — Regla única en `lib/domain/order-staffing.ts`
  (`orderStaffing`: incompleta = sin responsable, o `1 + ayudantes activos <
  required_installers`; con tests). La usan `lib/data/coordination-home.ts`
  (contador «sin cubrir» del coordinador) y el panel «Equipo de la orden»
  («Incompleta: faltan N…»). **Decisión: NO se cambió** `lib/data/broadcasts.ts`
  ni la alerta «sin asignar» del tablero (`lib/data/dashboard.ts`): ambas
  terminan en «asignar responsable», y un responsable ya asignado no debe
  reemplazarse sólo porque falten ayudantes. Las convocatorias siguen cubriendo
  el puesto de responsable.
- [x] **MULTIINST-T-21** — Campo «Instaladores necesarios» (1 a 15, default 1)
  en el alta y en la edición de orden (`requiredInstallers` en
  `lib/domain/order-intake.ts`, `createOrder`/`updateOrder`). Vacío o ausente no
  toca el valor (el alta por lote no lo manda: queda 1). Con tests de esquema.
- [x] **MULTIINST-T-22** — Tipos de base (a mano hasta poder regenerar):
  `work_order_team_members`, `work_orders.required_installers`,
  `order_payment_events.installer_id`, `installer_earnings` (columna
  renombrada), las 5 funciones nuevas. Cadenas es/pt: `OrderTeam` y
  `Errors.team*`.

## Fase 3 — Verificación

- [x] **MULTIINST-T-23** — `pnpm type-check`, `pnpm lint`, `pnpm test` (648
  tests), `pnpm build` — los cuatro en verde.
- [x] **MULTIINST-T-24 (parcial)** — pgTAP relacionado verificado en Demo con
  el arnés manual: `assignment_gate` (6 chequeos clave: update directo
  rechazado, alta limpia, proyección legacy, reintento idempotente sin
  duplicar, NOT_ELIGIBLE), `order_payment_events_installer_read` (evento
  legacy del responsable, `installer_id is null`, sigue visible). Ninguno
  cambió de comportamiento para una orden sin ayudantes. **Sin correr
  todavía**: `schedule_conflicts`, `installer_finance` completo,
  `order_pricing_privacy`, `field_flow_states`, `no_self_approval`,
  `order_incidents_rls`, `company_staff` — ninguno de estos toca las tablas
  que cambió este bloque de forma directa, pero no se corrieron para
  confirmarlo.
- [ ] **MULTIINST-T-25** — Verificación visual (Nicolás): ya hay pantalla nueva
  (panel «Equipo de la orden»); anotada en `docs/PENDIENTES_NICOLAS.md`.

## Fase 4 — Producción (requiere autorización explícita)

- [ ] **MULTIINST-T-26** — Backup confirmado, aplicar la migración,
  desplegar.
