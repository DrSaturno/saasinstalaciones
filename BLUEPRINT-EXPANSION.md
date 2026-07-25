# Instala Pro — Blueprint de Expansión (lote 2026-07-25)

> Generado con la metodología **The Architect** sobre el proyecto ya desplegado.
> Este documento es autocontenido: una instancia de Claude Code sin contexto
> previo debe poder ejecutar cada paso leyendo esto + `AGENTS.md` + el código.
> Idioma de trabajo: español (es-AR). Paridad i18n es/pt obligatoria.

---

## 0. Contexto y alcance

Instala Pro ya está en producción (`saasinstalaciones.vercel.app`), rama `main`.
Stack fijo (no se cambia): **Next.js 16 App Router (Turbopack) · TypeScript strict ·
Tailwind v4 · shadcn/ui · Supabase (Postgres/RLS/Auth/Storage/Realtime) ·
next-intl (es/pt) · Dexie+SW (offline) · Vitest · pnpm · Vercel**.

Este blueprint cubre **16 modificaciones/agregados** enfocados en las áreas
**Empresa/gerente** e **Instalador (PWA)**, agrupados en 4 fases por dependencia.

### Decisiones de arquitectura confirmadas por el usuario
1. **Geografía:** provincia de lista fija (AR: 24) + ciudad de texto libre con
   autocompletado + afinado opcional por radio (lat/lng). Reemplaza AMBA/Interior.
2. **Vista lista/tablero:** toggle simple **tarjetas ↔ tabla** en todos los
   módulos de listado. Sin kanban por estado.
3. **Mensajería:** máxima fidelidad WhatsApp — burbujas, avatares, separadores
   por día, hora, tildes de leído (✓✓), responder-citando, preview de adjuntos,
   presencia (en línea / escribiendo…) y buscador dentro de la conversación.

### Decisiones resueltas por el usuario (2026-07-25)
- **Foco geográfico: solo Argentina por ahora.** La taxonomía se implementa como
  constante por país (AR: 24; BR: 27 estados quedan definidos como estructura),
  pero **solo se siembran/cargan ciudades AR**. BR se difiere.
- **Aceptación de órdenes (item 13): TODAS las órdenes asignadas requieren
  aceptación del instalador** (no solo las de la bolsa), porque puede tener algo
  que le impida realizar el trabajo asignado. Columna `installer_accepted_at`
  nullable; "por aceptar" = asignada y sin aceptar. Al asignar, notifica; el
  instalador acepta (o podría rechazar/avisar) desde "Mis órdenes".
- **"Mis órdenes" (item 13): se mantiene la URL `/tasks`**, solo cambia el label
  visible a "Mis órdenes" (recomendación: no rompe el `start_url` de la PWA ni
  bookmarks de instaladores ya instalados).
- **Tipografía: se mantiene Inter** (no se suma Plus Jakarta Sans).
- **Anuncios (item 1): disparan SIEMPRE email + Web Push** (ambos canales), sobre
  la infra existente de `notifications` + Resend.
- **Persistencia de la vista lista/tablero:** por `localStorage` (no toca DB).

---

## 1. Convenciones y reglas heredadas (NO negociables)

Además de las de `AGENTS.md`:
1. Tipos de DB solo desde `types/database.ts` **regenerado tras cada migración**
   (`supabase gen types typescript --linked > types/database.ts`).
2. `lib/supabase/admin.ts` (service_role) SOLO en `app/api/master/**` y
   `lib/actions/invite-signup.ts`. Nada más.
3. Transiciones de estado de órdenes SOLO por `transitionOrder` (server valida).
4. Mutaciones del área installer siempre idempotentes (uuid cliente).
5. Todo string visible via next-intl; paridad exacta es/pt (testeada).
6. **Migraciones:** las corre el usuario a mano en el SQL Editor de Supabase.
   El editor **confirma cada sentencia por separado** (no es transaccional), así
   que **toda migración nueva debe ser idempotente**: `add column if not exists`,
   `drop policy if exists` antes de `create policy`, `create table if not exists`,
   guardas `do $$ ... if not exists ... $$`. Nunca un `ADD CONSTRAINT` pelado sin
   `drop constraint if exists` previo. (Lección del lote anterior.)
7. Un componente por archivo, máx ~300 líneas. Imports con `@/`. Server
   Components por defecto.

---

## 2. Cambios al modelo de datos (migraciones)

Se agrupan en **3 migraciones nuevas**, idempotentes, numeradas a partir de
`20260725000001`. El builder las escribe, el usuario las aplica en orden.

### 2.1 — `20260725000001_geography.sql` (Fase 0)
- **Constante de provincias en código** (`lib/domain/geography.ts`): AR (24: 23
  provincias + CABA), BR (27 estados). No va a DB (no cambian).
- `sites`: ya tiene `state`, `city`, `zone`, `lat`, `lng`. Redefinir semántica:
  - `state` = provincia (uno de la lista fija del país del proyecto).
  - `city` = ciudad (texto libre).
  - `zone` = **se sigue usando como clave de agrupación**; pasa a contener la
    provincia (para que todo el código que agrupa "por zona" siga funcionando,
    ahora con 24 valores en vez de 2). Backfill: `zone := state` cuando `state`
    esté cargado; para el demo viejo (AMBA/Interior) mapear AMBA→'Buenos Aires',
    Interior→coalesce(nullif(state,''),'Córdoba') como aproximación.
- `installers`: `zones text[]` pasa a ser **provincias que cubre**. Agregar
  `base_lat numeric`, `base_lng numeric`, `service_radius_km integer` (nullable,
  para el afinado por radio).
- `broadcasts.zone` = provincia del trabajo (ya existe). Nada nuevo salvo el
  backfill de valores.
- Tabla opcional `geo_city_suggestions (country text, province text, city text,
  primary key(country,province,city))` sembrada por trigger/insert desde
  `sites.city` distinct, para alimentar el autocompletado. (Alternativa liviana:
  autocompletar con `select distinct city from sites where company_id=...`.)

### 2.2 — `20260725000002_announcements_unavailability_acceptance.sql` (Fases 1-2)
- **Anuncios (item 1):** tabla `announcements`:
  `id, company_id, created_by, title, body, severity('info'|'warning'|'critical'),
  audience_type('all'|'zone'|'project'), audience_ref text (zona o project_id),
  created_at`. RLS: manager/coordinator de la empresa escriben; instaladores del
  público leen. RPC `publish_announcement(...)` (SECURITY DEFINER) que inserta el
  anuncio y hace fan-out a `notifications` de los instaladores del público
  (todos / por provincia via `installers.zones` / por proyecto via roster del
  proyecto). **Dispara siempre ambos canales: email (Resend) + Web Push**, sobre
  el pipeline existente.
- **Aprobación de inactividad (item 7):** a `installer_unavailability` agregar
  `status('pending'|'approved'|'rejected') default 'pending'`, `reviewed_by uuid`,
  `review_note text`, `reviewed_at timestamptz`. El cálculo de disponibilidad
  (`lib/domain/availability.ts` + `lib/data/dashboard.ts`) solo cuenta las
  `approved`. Política RLS: el instalador inserta las propias (pending) y lee las
  propias; el manager/coordinator lee y actualiza (aprobar/rechazar) las de su
  empresa.
- **Aceptación de orden (item 13):** a `work_orders` agregar
  `installer_accepted_at timestamptz` nullable. Aplica a **toda** asignación (no
  solo bolsa): al asignar/reasignar instalador se limpia (queda "por aceptar") y
  se notifica; la acción `acceptOrder(orderId)` del instalador lo setea. "Por
  aceptar" = `assigned_installer_id is not null and installer_accepted_at is null`.

### 2.3 — `20260725000003_ascender_coordinador.sql` (Fase 1)
- RPC `promote_installer_to_coordinator(p_installer_id uuid)` SECURITY DEFINER,
  callable solo por `company_manager` de la empresa: valida que el target sea
  installer del roster activo, cambia `profiles.role` a 'coordinator' y setea
  `company_id`. Respeta el trigger anti-escalación (por eso va por RPC vetada).
- La invitación directa de coordinador ya está soportada: `invitations.role`
  existe (migración 00002). Solo requiere UI (selector de rol en el diálogo).

> Tras cada migración: regenerar `types/database.ts` y actualizar los tipos que
> el código consume.

---

## 3. Sistema visual (item 15) — "estética proyecto2, paleta nuestra"

**Mantener** los tokens de `app/globals.css` (primary `#2597d0`, primary-soft
`#c0eaff`, success `#43a047`, etc.). **Adoptar** el *lenguaje* de proyecto2:

| Aspecto | proyecto2 (referencia) | Cómo lo aplicamos (con nuestra paleta) |
|--------|------------------------|-----------------------------------------|
| Tarjetas | `rounded-3xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-all` | `rounded-2xl` sutil, borde `border`, sombra en capas con leve *lift* al hover |
| Headers | `font-extrabold text-slate-800` | `font-bold/extrabold` sobre `text-foreground` |
| Labels | uppercase, `tracking-wider`, `text-slate-400`, con ícono lucide | igual, con `text-muted-foreground` y `font-mono` donde ya usamos mono |
| Estados | pills de color por estado + ícono | reusar `status-*` (ya definidos) como pills redondeadas con ícono |
| Acentos | glow indigo/emerald, `shadow-glow` | glow suave en `primary` para CTAs y foco; verde `success` para completar |
| Motion | `fade-in-up`, `pulse-slow` | animación de entrada sutil en listas/cards (respetar `prefers-reduced-motion`) |
| Tipografía | Plus Jakarta Sans | **mantener Inter** (decisión tomada; no se suma otra fuente) |

**Entregable de Fase 0:** primitivos compartidos en `components/shared/`:
- `StatusStepper` (línea de progreso, item 3) — mapea la máquina de 7 estados.
- `StatusPill` (pill de estado con ícono y color).
- `ViewToggle` + `DataViews` (lista/tabla, item 9).
- Ajuste de `Card`/superficies a la nueva sombra/rounded.

---

## 4. Especificación por feature (los 16 items)

### Fase 0 — Cimientos
- **F0.1 Geografía (item 2):** migración 2.1 + `lib/domain/geography.ts`
  (constantes país→provincias, helper de distancia haversine para el radio) +
  selector Provincia (dropdown fijo) y Ciudad (input con autocomplete) en todos
  los formularios que hoy piden zona: `create/edit-site`, `import-sites` (CSV con
  columnas provincia/ciudad/lat/lng), `create-order`, `create-broadcast`,
  perfil/cobertura del instalador. Filtros por provincia donde hoy filtran por
  zona (órdenes, bolsa, dashboard "desempeño por zona").
- **F0.2 Sistema visual (item 15):** sección 3. Se aplica progresivamente pero
  los primitivos se crean acá.
- **F0.3 Vista lista/tablero (item 9):** `ViewToggle` + patrón `DataViews`
  reutilizable; se aplica a cada listado a medida que se toca, con barrido final.

### Fase 1 — Empresa / gerente
- **F1.1 Config / contraseña (item 5):** nueva ruta `/settings` (o extender
  `/profile` de empresa) con cambio de contraseña vía
  `supabase.auth.updateUser({ password })`, validación de fuerza y reautenticación.
- **F1.2 Equipo — coordinadores (item 6):** en `/team`, botón "Ascender a
  coordinador" por fila (RPC 2.3, con confirmación). En "Invitar", selector de rol
  (instalador | coordinador) que setea `invitations.role`.
- **F1.3 Equipo — aprobar inactividad (item 7 lado admin):** panel de
  "Solicitudes de inactividad" en `/team`: lista los `installer_unavailability`
  `pending` de la empresa; aprobar/rechazar con nota (`review_note`). Solo las
  `approved` afectan disponibilidad/agenda.
- **F1.4 Anuncios (item 1):** bloque "Publicar anuncio" en el dashboard de
  empresa (reemplaza/porta la idea del tablero admin de proyecto1) con: título,
  mensaje, severidad (info/alerta/crítico) y **filtro de público**: todos / por
  provincia / por proyecto. Usa RPC `publish_announcement`. Feedback de a cuántos
  instaladores llegó.
- **F1.5 Clientes editables + ubicaciones (item 16):** en `/clients/[id]` mostrar
  los datos con que se dio de alta la empresa-cliente; listar sus ubicaciones
  (sites); click en una → ficha del site (`/projects/[id]/sites/[siteId]`).
  Hacer **editables** ficha de cliente, de orden y de ubicación (acciones
  `editClient`, `editSite` ya parcialmente existen; completar y exponer UI).
- **F1.6 Botonera inicio (item 10):** sumar a Acciones rápidas del dashboard de
  empresa: "Publicar trabajo" (→ nueva búsqueda en bolsa), "Mis trabajos" (→
  bolsa, búsquedas abiertas), "Ofertas recibidas" (→ postulaciones pendientes).
- **F1.7 Bolsa de trabajo (item 8):** fusionar el formulario actual de búsqueda
  con el de proyecto2 (fechas, requisitos, logística, paga con toggle, moneda —
  varias columnas ya existen en `broadcasts` desde migración 00002). **Matching
  geográfico:** una búsqueda se muestra a instaladores cuya cobertura
  (`installers.zones` = provincias) incluya la provincia del trabajo, **y** (si
  hay lat/lng y radio) estén dentro del radio, **y** que **no** formen ya parte
  del roster activo de la empresa. Ordenar por cercanía.

### Fase 2 — Instalador (PWA)
- **F2.1 Inicio del instalador (items 11-12):** nueva ruta `/inicio` (home),
  portando conceptualmente `InstallerDashboard` + `InstallerWorkday` de proyecto1
  (re-skinned a paleta clara + estilo F0.2): saludo, stats (asignadas, en curso,
  completadas), próximo destino, bitácora de campo, clima por zona, anuncios de la
  empresa, y acceso a "avisar inactividad". Jornada = vista agenda semana/día.
- **F2.2 Mis órdenes (item 13):** **se mantiene la URL `/tasks`**, solo cambia el
  label a "Mis órdenes" (no rompe el `start_url` de la PWA). Dos secciones:
  **Asignadas** (aceptadas, en curso) y **Por aceptar** (`assigned_installer_id
  is not null and installer_accepted_at is null`). Acción `acceptOrder`
  idempotente; aplica a toda orden asignada (directa o de bolsa).
- **F2.3 Aviso de inactividad (item 7 lado instalador):** desde `/inicio` o
  `/profile`, formulario para declarar fechas de ausencia con motivo → crea
  `installer_unavailability` en `pending`. Muestra estado (pendiente/aprobada/
  rechazada + nota).
- **F2.4 Ruta (item 14):** nueva ruta `/route` portando `InstallerRoute` de
  proyecto1: lista ordenada de paradas del día, "abrir ruta completa en Google
  Maps" con waypoints, y "cómo llegar" por parada. Usa lat/lng de los sites.

### Fase 3 — Transversal / detalle
- **F3.1 Ficha de orden: stepper + botones (item 3):** `StatusStepper` mapeando
  pendiente→relevamiento→planificada→en_proceso→en_revision→finalizada (y estado
  `cancelada` como rama), + fila de botones contextuales por estado (Mensajes,
  Aprobar, Ver evidencia, Calificar, etc.) en el detalle de orden y en las cards.
- **F3.2 Mensajería WhatsApp (item 4):** rediseño de `components/messages/
  chat-panel.tsx`: burbujas izq/der con avatar, separadores por día, hora, tildes
  de entregado/leído (usa `chat_message_reads`), responder-citando
  (`reply_to_id` ya existe en `chat_messages`), preview de adjuntos (bucket
  `chat`), **presencia** (en línea/escribiendo vía Realtime Presence) y
  **buscador** dentro de la conversación. Mantener el envío offline idempotente
  del instalador.
- **F3.3 Barrido lista/tablero (item 9):** aplicar `ViewToggle` a todos los
  listados restantes (proyectos, clientes, equipo, órdenes, bolsa).

---

## 5. Build Order (sección crítica — ejecutar en este orden)

> Cada paso: implementar → `pnpm lint` + `pnpm test` + `pnpm build` → verificación
> E2E en el browser (logueado con el rol pertinente) → commit en rama de trabajo.
> No pushear a `main` ni deployar sin pedido explícito del usuario.

**Paso 1 — Geografía (F0.1).** Migración `20260725000001`; regenerar tipos;
`lib/domain/geography.ts`; actualizar formularios (site/order/broadcast/perfil) y
filtros; backfill de datos demo. Test: alta de site con provincia+ciudad, filtros
por provincia, distancia haversine.

**Paso 2 — Sistema visual base (F0.2) + primitivos.** `StatusPill`,
`StatusStepper`, `ViewToggle`/`DataViews`, ajuste de `Card`. Sin cambiar aún cada
pantalla; dejar los building blocks listos.

**Paso 3 — Config/contraseña (F1.1).** Ruta aislada, quick win. Verificar cambio
real de password y re-login.

**Paso 4 — Equipo: coordinadores (F1.2).** Migración `20260725000003` (RPC
ascender); selector de rol en invitar; botón ascender. Verificar alta directa de
coordinador y ascenso de un installer.

**Paso 5 — Inactividad: schema + aprobación admin (F1.3) + migración 2.2 (parte
unavailability).** Panel en `/team`. (El lado instalador llega en Paso 12.)

**Paso 6 — Anuncios (F1.4) + migración 2.2 (parte announcements).** Bloque en
dashboard + RPC fan-out + i18n. Verificar entrega a "todos / por provincia / por
proyecto".

**Paso 7 — Clientes editables + ubicaciones (F1.5).** Datos de alta, lista de
ubicaciones enlazada a la ficha, edición de cliente/orden/site.

**Paso 8 — Botonera inicio (F1.6).** Tres accesos a bolsa en Acciones rápidas.

**Paso 9 — Bolsa de trabajo + matching (F1.7).** Formulario fusionado + matching
por provincia/radio/no-roster. Depende del Paso 1. Verificar que un trabajo en
provincia X se ve solo a instaladores que la cubren y no están en el equipo.

**Paso 10 — Inicio del instalador (F2.1).** Home + jornada, re-skinned.

**Paso 11 — Mis órdenes (F2.2) + migración 2.2 (parte acceptance).** Asignadas +
por aceptar; acción aceptar.

**Paso 12 — Aviso de inactividad, lado instalador (F2.3).** Cierra el ciclo con
el Paso 5.

**Paso 13 — Ruta (F2.4).** Paradas + Google Maps waypoints.

**Paso 14 — Stepper + botones de orden (F3.1).** Aplicar en detalle y cards.

**Paso 15 — Mensajería WhatsApp (F3.2).** Rediseño completo del chat.

**Paso 16 — Barrido lista/tablero (F3.3).** Aplicar `ViewToggle` a todos los
listados. Sweep estético final para uniformar F0.2 en todo.

**Paso 17 — Auditoría Cyber Neo + preparación de deploy.** `/cyber-neo .`,
corregir hallazgos medios/altos, luego (con OK del usuario) push a `main` y deploy.

---

## 6. Testing

- **Unit (Vitest):** geografía (haversine, mapeo país→provincias), matching de
  bolsa (provincia+radio+exclusión de roster), fan-out de anuncios por público,
  cálculo de disponibilidad contando solo inactividades aprobadas, transición de
  aceptación de orden.
- **RLS (pgtap donde aplique):** announcements (público lee, empresa escribe),
  unavailability (installer propias / manager de su empresa), promote RPC solo
  manager, chat sin cambios de acceso.
- **E2E (browser):** cada paso del build order, con el rol correspondiente y a
  375px para el área installer. Sin errores de consola.
- **i18n:** paridad es/pt tras cada paso que agregue strings.

---

## 7. Decisiones cerradas (2026-07-25)

Todas resueltas por el usuario; el blueprint ya las incorpora:
1. **Geografía:** foco **solo Argentina** por ahora. BR queda como estructura
   (27 estados) pero sin sembrar ciudades. Diferido.
2. **Aceptación de órdenes:** **todas** las asignadas requieren aceptación del
   instalador (puede tener algo que le impida el trabajo). No solo bolsa.
3. **"Mis órdenes":** se mantiene la URL `/tasks`, solo cambia el label.
4. **Tipografía:** se mantiene **Inter**.
5. **Anuncios:** disparan **siempre email + Web Push** (ambos canales).

---

## 8. Notas de ejecución para el builder

- Trabajar en rama (no `main`). Commits chicos por paso.
- Toda migración: **idempotente** (ver regla 6 de la sección 1).
- Regenerar `types/database.ts` tras cada migración y ajustar consumidores.
- El MCP de Supabase de la sesión suele estar en otra cuenta: las migraciones las
  aplica el usuario a mano; el builder entrega el `.sql` listo y las instrucciones.
- Reusar infra existente: `notifications` + Web Push + Resend (anuncios), bucket
  `chat` (adjuntos de mensajería), `installer_unavailability`/`_weekly_availability`
  (disponibilidad), `broadcasts`/`broadcast_applications` + RPCs (bolsa).
- Mantener el offline idempotente del instalador en todo lo que sea mutación de campo.
