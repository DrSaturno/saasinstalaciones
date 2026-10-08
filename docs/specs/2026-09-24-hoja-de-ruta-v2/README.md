# Hoja de ruta v2 — nueve bloques pedidos el 24-09-2026

Documento paraguas. **No es una spec de implementación**: ordena nueve pedidos
(los siete numerados 1–7, más el 0 y el 8 que llegaron después),
mide su impacto real en el código y deja las decisiones abiertas por escrito.
Cada bloque pasa a tener su propia carpeta `docs/specs/<fecha>-<slug>/` con
`README.md`, `requirements.md`, `design.md` y `tasks.md` **antes** de tocar
código, y ninguna implementación arranca sin el «listo, dale» de Nicolás sobre
ese bloque. Diseñado para que Codex pueda tomar cualquier bloque sin depender
de la conversación que lo originó.

Estado (24-09-2026): las **8 decisiones de abajo se aceptan con sus defaults**
(Nicolás: «vamos con las decisiones»). **Bloque 0 (Vercel) pausado** por
decisión de Nicolás: no puede ver la cuenta ahora. Bloque 8 (`../2026-09-24-privacidad-de-importes/`): spec escrita e **implementado en
Demo** (producción pendiente). Bloque 1 (`../2026-09-24-alta-rapida-de-cliente/`): spec escrita e **implementado**
(código solamente; sin verificación visual). Bloque 2 (`../2026-09-24-sin-latitud-longitud/`): spec escrita e **implementado**
(falta la clave de Google y verificación visual). Bloque 3 (`../2026-09-24-locaciones-compartidas/`): spec escrita e **implementado en Demo**
(producción pendiente). Bloque 4 (`../2026-09-24-subcuentas-permisos/`): spec escrita e **implementado en
Demo** — migración aplicada, código completo, 22 assertions pgTAP propias más 47 de regresión
(`installer_finance`, `order_pricing_privacy`, `rpc_execute_hardening`) verificadas contra Demo sin
fallas, `type-check`/`lint`/`test` (643)/`build` en verde (producción y verificación visual
pendientes). Bloque 5 (`../2026-09-24-multi-instalador/`): spec escrita y **capa de servidor
implementada en Demo** (schema, RLS, gate para ayudantes, reglas de transición) — la UI, el chat
grupal y la suma de costos en el tablero financiero todavía no existen, ver el propio `tasks.md`
del bloque para el detalle exacto de qué falta. Bloque 6 (`../2026-09-24-resultado-economico/`):
**implementado en Demo** — otros costos por proyecto, ganancia/pérdida corregida en la ficha del
proyecto y en `/finance`, torta de avance. De paso corrigió un hallazgo real: la ficha de proyecto
pasaba `canManageFinance` fijo en `true` desde antes del bloque 4, así que cualquier subcuenta sin
permiso de finanzas editaba igual el monto de contrato del proyecto. Bloque 7
(`../2026-09-24-link-cliente/`): **implementado en Demo y verificado en vivo con navegador real**
(la primera pantalla de todo el paquete que no necesita login, así que sí se pudo probar de
punta a punta) — link público de seguimiento por proyecto, con torta de avance, hitos y fotos
aprobadas, sin importes ni datos de instaladores; revocable, un solo link activo por proyecto.
Las demás se escriben bloque por bloque; ninguna implementación arranca sin el «listo, dale» de
ese bloque.

## Dos bloques agregados el mismo día

### Bloque 0 — Mover el hosting a una cuenta de Vercel dedicada a seinstala.com.ar

Pedido: Vercel Pro ya está contratado, pero en la cuenta donde viven todos los
demás proyectos de Nicolás; tiene que pasar a una cuenta propia del producto.

**Estado verificado por el conector de Vercel (24-09-2026):**
- La cuenta actual es el team `DrSaturno's projects`
  (`team_NmBalRdOwPmIbOGjhSLvXP2o`) con **30 proyectos**. El de este producto es
  `saasinstalaciones` (`prj_xAs4rFWUsZxPAAgshyg29fcH3QnE`), último deploy de
  producción `READY`. Hay otro, `seinstalapro`, que parece el legado.
- Dominios del proyecto: `seinstala.com.ar` (redirige 308 a
  `www.seinstala.com.ar`), `www.seinstala.com.ar` y `saasinstalaciones.vercel.app`,
  los tres verificados.
- El conector **sólo ve la cuenta actual**: la cuenta nueva no está conectada.
  No puedo crearla, ni contratarle Pro, ni operar en ella hasta que se conecte.
- El proyecto corre en **Node 24.x** en Vercel, pero el repo fija `22.14.0`
  (`.nvmrc`, `engines`). Es una discrepancia a decidir, no algo que se haya
  roto: conviene igualarlas al mover.

**Mecanismo:** la API de Vercel tiene transferencia de proyecto entre teams:
el team de origen genera un **código de transferencia con validez de 24 horas**
y el team de destino lo acepta. La respuesta de aceptación informa
`resourceTransferErrors` y `transferredStoreIds`, o sea que los recursos
asociados (stores) pueden fallar y hay que revisarlos uno por uno. La doc
consultada **no detalla** qué se conserva (dominios, variables, integración con
GitHub, integración de Upstash): esos puntos se **verifican en el momento** y se
dejan como lista de comprobación, no como promesa.

**Lo que hace falta de Nicolás:** crear la cuenta/team nuevo y contratarle Pro
(compra: sólo él), y avisar cuando exista. **Riesgos a cubrir en la spec:**
1. **Dominio:** el orden importa; sin un plan, `seinstala.com.ar` puede quedar
   unos minutos sin servir. Hay que saber dónde están los DNS (no está
   documentado en el repo; el correo está en SiteGround).
2. **Variables de entorno:** exportar la lista de **nombres** antes de mover
   (nunca los valores en el repo) y compararla contra la del destino después.
3. **Upstash** (limitador de tasa): es una integración de Vercel; sin ella el
   limitador **degrada a no-op sin avisar**. Verificar `/api/health`
   (`checks.redis`) al terminar.
4. **GitHub:** la cuenta nueva necesita acceso al repositorio para que el
   deploy automático siga andando.
5. **Supabase:** las Redirect URLs de Auth y la URL del sitio no cambian si el
   dominio se conserva; si aparece un dominio `*.vercel.app` nuevo, hay que
   revisarlas.
6. **Rollback:** mientras no se borre nada del team viejo, el camino de vuelta
   es reasignar el dominio.

### Bloque 8 — Los instaladores no deben ver lo que la empresa le cobra al cliente

Pedido: en su tablero personal, el instalador sólo ve **cuánto va a ganar él**.

**Hallazgo: hoy sí se puede ver, y por dos caminos distintos** (verificado
contra Demo el 24-09-2026; producción comparte las mismas migraciones y **no se
consultó**):

1. **Filtración real en la aplicación.** El botón «Descargar PDF» está en la
   pantalla de tarea del instalador (`app/(installer)/tasks/[id]/page.tsx`) y en
   la de coordinación. La ruta `app/api/orders/[id]/pdf/route.tsx` pide
   `work_orders.amount` —lo que la empresa cobra— y lo imprime en el PDF. **Un
   instalador que baja el PDF de su orden ve el precio al cliente.**
2. **Filtración a nivel base de datos.** `work_orders_installer_read` autoriza
   la **fila entera**; en Postgres el rol `authenticated` (el mismo de gerentes
   e instaladores) tiene `SELECT` sobre `work_orders.amount` y
   `projects.contract_amount`. Cualquier instalador con su sesión puede pedir
   esas columnas directo a la API REST, sin pasar por la interfaz.
   (*Corrección:* una versión anterior de este párrafo listaba también
   `broadcasts.pay_amount`; es lo que la empresa **ofrece** al instalador y es
   legítimo que lo vea.)
3. **Integridad de pagos — hallazgo agregado, más grave que la fuga.** Con la
   sesión de un instalador de Demo, `UPDATE work_orders SET installer_amount =
   999999, payment_status = 'paid'` afectó 10 de 10 de sus órdenes sin error (la
   prueba corrió en una transacción abortada a propósito; no quedó ningún
   cambio). Un instalador puede fijarse su propia paga y marcarse como pagado.
   Detalle y arreglo en [`../2026-09-24-privacidad-de-importes/`](../2026-09-24-privacidad-de-importes/README.md). La vista `installer_earnings` (que sí expone sólo
   `installer_amount`) protege únicamente al código de la app, no a la API.
   Su propio comentario lo admite: es «convención de código, no una garantía».

**Diseño a evaluar (en la spec):** las políticas RLS no pueden ocultar columnas.
Las salidas reales son (a) mover los importes comerciales a una tabla aparte
con RLS sólo para gerente/administrativo, o (b) revocar el permiso de columna y
dar a gerentes una vista o función con permisos propios. (a) es más robusta y
más invasiva; (b) es menor pero exige tocar cada lectura de gerente. Además hay
que corregir el PDF (un PDF para instalador sin `amount`, con
`installer_amount`) y cubrirlo con una prueba pgTAP que falle si un instalador
puede leer las columnas comerciales.

**Prioridad propuesta: primero de todo el paquete.** No es una mejora sino una
exposición de información comercial de terceros que ya está viva. El arreglo
del PDF es chico y se puede adelantar como corrección puntual.

## Orden propuesto y por qué

| # | Bloque | Tamaño | Depende de | Toca esquema | Toca RLS |
|---|---|:--:|---|:--:|:--:|
| 8 | **Ocultar al instalador el precio al cliente** (ver arriba) | M | — | Sí | **Sí** |
| 0 | Mover el hosting a una cuenta de Vercel propia (ver arriba) | S–M | cuenta nueva creada por Nicolás | No | No |
| 1 | Alta rápida de cliente desde «Nuevo proyecto» | S | — | No | No |
| 2 | Quitar latitud/longitud del uso manual | M | decisión de geocodificación | Sí (menor) | No |
| 3 | Locaciones reutilizables entre clientes | L | 2 | **Sí (mayor)** | **Sí** |
| 4 | Subcuentas y permisos del gerente | L | — | Sí | **Sí (todas)** |
| 5 | Varios instaladores por trabajo (hasta 15) | XL | 4 (permisos) | **Sí (mayor)** | **Sí** |
| 6 | Resultado económico del proyecto + torta de avance | M | 5 (costos por instalador) | Posible | Sí |
| 7 | Link público de seguimiento para el cliente final | L | 6 (el avance que se muestra) | Sí | **Sí (superficie nueva)** |

Razón del orden: el 8 va primero porque es una exposición viva; el 0 no
depende del código y se hace cuando Nicolás tenga la cuenta nueva; el 1 es un ganador rápido e independiente; el 2 va antes que
el 3 porque ambos reescriben el formulario y el modelo de locación y conviene
no hacerlo dos veces; el 4 va antes que el 5 porque «quién puede asignar
gente» pasa a ser una pregunta de permisos; el 6 necesita saber cuánto cuesta
cada instalador cuando son varios; el 7 muestra lo que calcula el 6.

## Hallazgos del código que condicionan el diseño

Verificado el 24-09-2026 (lectura de `supabase/migrations/` y `app/`).

**Locaciones (bloque 3).** Hoy una locación pertenece a **un** cliente por
diseño duro: `locations.client_id NOT NULL`, índice único
`(company_id, client_id, normalized_external_ref)` y claves foráneas
compuestas `(location_id, company_id, client_id)` en `project_locations`,
`location_attachments`, `location_requirements` y `location_change_events`.
Reutilizar una locación en otro cliente **no se resuelve con una vista ni con un
permiso**: exige mover el vínculo cliente↔locación a una relación propia y
reescribir esas cuatro claves compuestas. Es una migración de datos sobre una
base que ya tiene información real.

**Varios instaladores (bloque 5).** El modelo es de **un** instalador por
trabajo en tres lugares: `work_orders.assigned_installer_id` (columna simple),
`work_assignments` con índice único parcial `work_assignments_one_current_idx`
(una asignación vigente por actividad) y el `assignment_gate`. `assigned_installer_id`
aparece en **69 archivos** entre acciones, lecturas, páginas y migraciones, y
en las policies RLS del área instalador. Es el cambio de mayor superficie del
paquete. La cifra 15 es un límite de producto, no técnico.

**Roles (bloque 4).** `company_membership_roles` sólo admite
`installer | coordinator`. El gerente vive en `profiles.role`. Ya existen
`grant_company_member_role` / `revoke_company_member_role`, así que hay un
mecanismo de concesión de roles que se puede extender, pero **no hay noción de
permiso granular**: los roles son cubos, no capacidades.

**Latitud/longitud (bloque 2).** Las coordenadas están en 40+ archivos:
formularios de sitio, importación, exportación, mapa operativo, clima,
matching de difusiones por distancia, viabilidad de traslado en la agenda
(`installer_travel_feasibility`), ruta del instalador. **Quitar el dato
rompería todo eso** salvo que se reemplace. Además, la spec
`2026-09-10-mapa-operativo-real` descartó explícitamente geocodificar
direcciones por costo y por sumar una API. **Este pedido revierte esa
decisión** y hay que asumirlo como tal.

**Finanzas (bloque 6).** Ya existe la separación correcta:
`work_orders.amount` (ingreso) vs `work_orders.installer_amount` (costo), más
`finance-projects.tsx` y `project-performance-panel.tsx`. La fórmula ingreso −
costo existe en parte; falta el «otros costos», que hoy no tiene dónde vivir.

**Página del cliente (bloque 7).** No existe ninguna ruta pública con datos:
todo está detrás de login y RLS. Un link compartible es una **superficie de
ataque nueva** y hay que diseñarla como tal (token, alcance mínimo, revocación,
sin datos personales, sin importes).

## Decisiones abiertas

Cada una con la recomendación por defecto; si Nicolás responde «defaults», eso
es lo que se especifica.

1. **Link del cliente (7).** ¿Sólo lectura, sin login, con token difícil de
   adivinar y revocable? ¿Muestra fotos de evidencia? ¿Muestra importes?
   *Default:* sin login, token, revocable, expira sólo si se revoca; muestra
   % de avance, estado, hitos y fotos aprobadas; **nunca** importes, nombres
   de instaladores ni teléfonos.
2. **Cuándo cuenta como avance (6/7).** ¿Porcentaje = órdenes finalizadas /
   órdenes totales del proyecto, ponderado o no? *Default:* finalizadas ÷ (total
   − canceladas), sin ponderar. Sale de datos que ya existen.
3. **Otros costos (6).** ¿Son manuales por proyecto (materiales, viáticos,
   transporte), cargados por gerente/administrativo? *Default:* tabla de gastos
   por proyecto con concepto, monto, fecha y quién lo cargó.
4. **Pago a instaladores cuando van varios (5/6).** ¿Monto fijo por orden para
   cada uno, o un total que se reparte? *Default:* monto propio por instalador
   dentro de la orden, que es lo que ya hace `installer_amount` uno a uno.
5. **Qué es «un trabajo con 15 instaladores» (5).** ¿Una orden con equipo, o
   una orden por instalador dentro de un mismo proyecto? *Default:* una orden
   con un **equipo asignado** (con un responsable), porque el instalador ve y
   reporta una sola orden, y la evidencia queda unificada.
6. **Permisos de subcuentas (4).** ¿Qué puede y qué no puede hacer una persona
   administrativa? *Default:* todo lo operativo (proyectos, órdenes, agenda,
   equipo) **menos** finanzas, gestión de usuarios y ajustes de empresa, que
   quedan sólo para el gerente; permisos activables por persona.
7. **Latitud/longitud (2).** ¿Se conserva la coordenada **internamente** pero se
   completa sola desde la dirección (geocodificación), y se deja de pedir en el
   formulario? *Default:* sí; es la única forma de no perder mapa, clima, ruta
   ni matching. Implica costo por consulta de la API de Google.
8. **Locaciones compartidas (3).** Al reutilizar, ¿el historial, documentos y
   requisitos de la locación se comparten entre clientes o quedan separados por
   cliente? *Default:* la **identidad** (dirección, nombre, datos físicos) es
   compartida; los **documentos y requisitos** quedan por cliente, porque
   pueden ser confidenciales entre ellos.

## Fuera de alcance de este paquete

- Optimización de rutas, facturación electrónica, portal completo del cliente
  con login (el bloque 7 es un link de lectura, no un portal).
- Pagos reales a instaladores.
- Cualquier cambio a producción sin autorización explícita: todo esquema pasa
  primero por Demo (ver memoria del proyecto: orden demo → producción).

## Trazabilidad

Los IDs de requisito de cada bloque usarán el prefijo del bloque
(`CLIALTA-`, `LATLNG-`, `LOCSHARE-`, `SUBCTA-`, `MULTIINST-`, `RESULT-`,
`LINKCLI-`) y trazarán a los requisitos existentes que modifican.
