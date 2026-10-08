# Diseño

## PRIV-DEC-01 — Tablas de precios aparte, no ocultar columnas

Los importes comerciales salen de `work_orders` y `projects` y pasan a tablas
propias con RLS **sólo para quien puede ver lo comercial**:

- `work_order_pricing (order_id pk → work_orders, company_id, amount)`
- `project_pricing (project_id pk → projects, company_id, contract_amount)`

**Por qué no revocar el permiso de columna:** Supabase entrega el mismo rol
`authenticated` a gerentes e instaladores. Un `REVOKE SELECT (amount)` se lo
quitaría también al gerente. Las políticas RLS deciden **filas**, nunca columnas.
La única forma de que la base distinga entre ambos es que el dato viva en una
fila que sólo una policy deja pasar.

**Costo asumido:** ~27 archivos leen o escriben `amount`/`contract_amount`. Es la
parte grande del trabajo, pero es mecánica y el compilador (tipos generados) ayuda
a no dejar ninguno.

**Alternativa descartada:** vistas con permisos de dueño para el gerente y
revocación de columna para el resto. Menos código, pero cada lectura de gerente
pasa a depender de una vista con `security definer` semántico: más superficie
donde un error filtra datos de otra empresa.

## PRIV-DEC-02 — Un único punto de decisión: `auth_can_see_commercials(company_id)`

Toda policy de las tablas de precios se apoya en esta función, hoy equivalente a
«es gerente de esa empresa» (más plataforma). El bloque 4 (subcuentas) la
extiende para el permiso «finanzas» sin tocar otra vez las tablas.

**O1 — RESUELTA por Nicolás (24-09-2026):** el **coordinador NO ve** lo que se le
cobra al cliente; «es un instalador con un poco más de rol». Lo ve **el gerente
y quienes el gerente habilite** con un permiso explícito. Hoy
`work_orders_coordinator_all` le da acceso a toda la fila de la orden: al mover
el importe a `work_order_pricing`, el coordinador queda **afuera por defecto**
(la policy de esa tabla no lo incluye) sin tocar sus demás permisos.

**Alcance con respecto al bloque 4:** en este bloque `auth_can_see_commercials`
devuelve verdadero sólo para el **gerente de la empresa** (y la plataforma). El
«permiso que el gerente le da a otra persona» necesita subcuentas y un modelo de
permisos, que es el bloque 4; ese bloque agrega la concesión **dentro de esta
misma función** sin volver a tocar las tablas de precios. Consecuencia
temporal: hasta que exista el bloque 4, nadie más que el gerente ve importes.

## PRIV-DEC-03 — Lista blanca de columnas para el instalador, por trigger

`work_orders_installer_progress` autoriza el `UPDATE` de la fila entera. Como el
rol es compartido, tampoco acá sirve el permiso de columna. Se agrega un trigger
`BEFORE UPDATE` que, cuando quien actúa es el instalador asignado y **no** es
gerente ni coordinador de la empresa, **rechaza** cambios en cualquier columna que
no esté en la lista blanca.

La lista **no se inventa**: se deriva inventariando qué columnas escribe hoy el
área instalador (`transitionOrder`, `atomic_order_status_change`, aceptación de
orden, cola offline en `lib/offline/sync.ts`) y se congela en la prueba pgTAP. Se
prefiere lista blanca a lista negra para que una columna nueva sea **prohibida por
defecto**.

**Implementación:** el trigger es `security invoker` (no `definer`, a diferencia del
patrón habitual del proyecto) porque necesita `current_user` para distinguir una
escritura directa de la API (`authenticated`) de una hecha dentro de una RPC
`security definer` (que corre como el dueño y ya trae sus propias validaciones), de
migraciones o del `service_role`. Lleva `search_path` fijo y corre primero entre los
`BEFORE UPDATE` (nombre `work_orders_00_…`) para comparar lo que mandó el cliente y no
lo que otros triggers reescriben después. Sólo dos funciones `invoker` actualizan
`work_orders` (`apply_order_status_change`, que toca `status`, y
`set_order_payment_status`, del lado de la empresa), y ambas quedan cubiertas.

## PRIV-DEC-04 — Migración expand / contract en dos pasos

Producción y despliegue no son atómicos: si se borra la columna antes de que el
código nuevo esté publicado, la app vieja rompe.

1. **Expand** (migración A, ya escrita): crea las tablas de precios, RLS y la
   función de permiso, **mueve los datos y vacía las columnas viejas** (que siguen
   existiendo, siempre en NULL). Un trigger **desvía** a las tablas nuevas lo que
   el código anterior escriba en ellas, así que la versión desplegada no rompe en
   la ventana entre migrar y publicar, y la fuga queda cerrada desde este paso
   (versión original de este documento: se cerraba recién en la contracción).
   Costo asumido: en esa ventana la versión vieja leerá el importe como «sin
   cargar». Con una sola empresa en producción y una ventana de minutos, es
   preferible a dejar la fuga abierta.
2. **Código:** todas las lecturas y escrituras pasan a las tablas nuevas.
3. **Contract** (migración B, **todavía no está en el repo a propósito**): quitar
   `work_orders.amount`, `projects.contract_amount`, los dos desvíos y la
   referencia en `formalize_project_from_broadcast`. Es limpieza, no seguridad. Si
   viajara junto con A en un `db push`, rompería el código desplegado.

## PRIV-DEC-05 — El PDF se arma según el rol

`app/api/orders/[id]/pdf/route.tsx` deja de pedir el importe comercial por
defecto. Si el usuario pasa `auth_can_see_commercials`, lo pide de
`work_order_pricing`; si no, imprime `installer_amount` como «Tu paga». Con la
tabla aparte, un instalador que intente pedirlo obtiene vacío por RLS: el arreglo
del PDF es una comodidad de presentación, la garantía está en la base.

## PRIV-DEC-06 — Realtime y Storage

Se verifica que las tablas de precios **no** estén en la publicación de Realtime
y que ninguna exportación o adjunto de orden incluya el importe comercial. Si
alguna lo hace, se corrige en este mismo bloque.

## Riesgos

- **Migrar datos reales.** Producción ya tiene órdenes con importes: el backfill
  se verifica con conteo y suma antes/después (`AC-PRIV-E`) y, ahora que
  Supabase es Pro, **después de confirmar que existe un backup diario** (ver
  `docs/BACKUP_AND_RESTORE.md`).
- **Consultas que unen `work_orders` con el importe** (finanzas, dashboard) pasan
  a hacer un `join` a `work_order_pricing`: revisar rendimiento con el volumen
  esperado (miles de órdenes por proyecto).
- **Tipos generados:** tras cada migración, `supabase gen types` y
  `node scripts/narrow-database-types.mjs` (obligatorio, ver `AGENTS.md`), con el
  CLI apuntando a **Demo** (verificar el `project-ref`).
