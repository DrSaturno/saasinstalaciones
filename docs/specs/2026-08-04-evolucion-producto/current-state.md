# Auditoría del estado actual

Fecha de corte: 05-08-2026  
Repositorio analizado: `saasinstalaciones`  
Rama/estado al auditar: `main`, alineada con `origin/main`, worktree limpio antes de crear esta documentación  
Último commit observado: `d4a5e7c` (30-07-2026)

## Resumen

La aplicación ya tiene una base funcional considerable: roles operativos, proyectos/OTs, bolsa, mensajería, PWA con outbox, fotos, dashboard, clima, notificaciones, importación y una primera vista financiera. Por eso no se recomienda reescribirla.

La brecha está en la semántica de dominio. Los pedidos nuevos exigen que identidad, locaciones, actividades, asignaciones y eventos sean fuentes confiables. Las implementaciones actuales resuelven versiones más simples de esos conceptos y deben migrarse de forma aditiva.

## Evidencia por frente

### 1. Offline y sincronización — parcial, con riesgo

Existe:

- Service Worker `network-first` para `/home`, `/tasks`, `/jobs` y `/profile` en `public/sw.js`.
- Dexie con outbox, fotos y una tabla declarada de tareas en `lib/offline/db.ts`.
- Sincronización al reconectar/cada 20 segundos en `lib/offline/use-sync.ts`.
- Cola para avances, transiciones, chat, leído y fotos en `lib/offline/sync.ts`.
- Indicador de red/cantidad pendiente y acciones de campo offline.

Brechas:

- La tabla `CachedTask` no tiene consumidores; la consulta offline depende de haber cacheado HTML.
- Aceptar OT y adjuntos de chat requieren red.
- Fotos completas, sin compresión, chunks/reanudación ni preferencia de red.
- `tries`/`lastError` no tienen bandeja por elemento.
- La transición offline actual actualiza `work_orders.status` directamente (`lib/offline/sync.ts:90`), a diferencia del action online.
- La limpieza cross-account no cubre de forma segura todos los escenarios.

Reutilizar: Dexie, IDs UUID, hooks de sync, experiencia PWA, Storage. Rehacer: contrato de comandos, cache estructurada, UI de conflictos y pipeline de medios.

### 2. Finanzas — parcial y semánticamente distinta

Existe:

- Ruta de empresa `/finance` y datos de contrato en proyectos/OTs.
- Cálculo de contratado, completado y pendiente por proyecto, zona e instalador en `lib/domain/finance.ts`.

Brechas:

- “Completado” es el valor de OTs finalizadas; “pendiente” es contratado menos completado. No representa cobro ni deuda.
- El desglose por instalador usa el mismo valor facturable, no un costo/honorario real.
- No hay pagos, parciales, gastos, ajustes, disputas, reversas ni vista financiera del instalador.

Reutilizar: UI/queries como referencia y campos monetarios como origen etiquetado. No reinterpretar `work_orders.amount` como honorario.

### 3. Chat y multimedia por OT — parcial

Existe:

- Chat realtime empresa–instalador, presencia, leído, respuesta y hasta cinco adjuntos.
- Previews de imagen/archivo y búsqueda textual en `components/messages/chat-panel.tsx`.

Brechas:

- `chat_threads` es único por `(company_id, installer_id)`, sin OT.
- La consulta carga como máximo 300 mensajes (`lib/data/messages.ts:104`).
- La búsqueda sólo mira `body`; no archivos, links, captions ni historial paginado.
- No hay galería/filtros por tipo ni modelo normalizado de adjuntos.

Reutilizar: UI WhatsApp-like, Realtime, reads, Storage y componentes de preview. Extender esquema y búsqueda.

### 4. Locación canónica — corrección estructural

Existe:

- `sites` contiene dirección, contacto, acceso, riesgos y notas.
- “Reutilizar” busca locaciones del cliente y las copia a otro proyecto (`lib/actions/projects.ts`).
- La galería cruza copias por referencia externa o nombre + dirección (`lib/data/site-gallery.ts`).

Brechas:

- `sites.project_id` es obligatorio y con cascade; cada proyecto tiene otra identidad física.
- También se copian adjuntos; las copias pueden divergir.
- Sólo la galería intenta reconstruir historia; la ficha/OT normal sigue el `site_id` copiado.
- No hay vigencia/estado/auditoría de permisos y requisitos.

Reutilizar: campos existentes, ficha, galería, importador y adjuntos. Migrar a `locations` + asociación de proyecto.

### 5. Oportunidad → cotización → proyecto — nuevo dominio

Existe:

- `broadcasts.project_id` es nullable en DB, pero Zod/action/UI exigen proyecto.
- Postulaciones, matching, roster y asignación de OTs existentes.

Brechas:

- `broadcast_applications` sólo guarda mensaje/estado; no precio, términos, revisión o vencimiento.
- Aceptar una postulación no crea proyecto; agrega equipo y puede asignar OTs ya existentes.
- Proyecto permite coordinador nulo, contrario al nuevo requisito.

Reutilizar: publicación/matching/notificaciones y parte de UI. Mantener staffing existente y crear oportunidad/cotización preproyecto separada.

### 6. Cancelación, reprogramación y confiabilidad — mayormente nuevo

Existe:

- Aceptación, fecha original, contador de reprogramaciones y visitas.
- Trigger que conserva fecha original y action que cambia fechas.

Brechas:

- No hay motivo, revisión, nueva aceptación, prueba de notificación, deadline ni recordatorio.
- `cancelada` es sólo estado terminal; no existe solicitud/revisión.
- No hay eventos/reglas/score de confiabilidad ni apelación.
- La minuta deja ambiguo desde qué instante corre la ventana de dos días de una baja común.

Reutilizar: campos como proyección temporal y notificaciones. Crear revisiones/asignaciones/eventos inmutables.

### 7. Relevamiento versus trabajo — parcial, modelo insuficiente

Existe:

- Estado `relevamiento` y `order_update.type = survey`; se exige acta antes de planificar.

Brechas:

- Se mezcla tipo de servicio con estado.
- No hay relevamiento independiente, versiones, mediciones, aprobación/cambios o agenda propia.
- El action de acta y las acciones permitidas al instalador no están completamente alineados.

Reutilizar: actas/evidencias legacy como backfill. Crear actividades hijas y submissions.

### 8. Importar/exportar — parcial con quick wins

Existe:

- Importación `.xlsx`/`.csv` hasta 20 MB, aliases de columnas y lotes.
- Plantilla Excel formateada y botón visible.
- Resultado de insertadas/omitidas y contratado/cargado/restante.

Brechas:

- No hay exportación, preview antes de escribir ni reporte de error descargable.
- `external_ref` no impide duplicados; el import hace inserts por lote.
- Un lote puede fallar después de que otros ya se escribieron.
- PDF/Word/Excel variable no están soportados.

Reutilizar: parser, plantilla, aliases y UI base. Reemplazar escritura por preflight + import idempotente sobre locación canónica.

### 9. Rol dual — incompatible con el modelo actual

Existe:

- `company_installers` con PK empresa/persona y un único `role`.
- Helpers RLS comparan el rol escalar.
- Promover reemplaza el rol y asignación exige exactamente `installer`.

Brechas:

- La migración vigente declara roles excluyentes dentro de una empresa.
- Un cambio sólo de UI rompería policies, auth, invitaciones, roster y asignaciones.
- No hay segregación explícita para autoaprobación.

Reutilizar: membresías/datos actuales mediante backfill. Normalizar roles/capacidades y migrar RLS antes de features dependientes.

### 10. Reputación — base simple

Existe:

- Rating 1–5 por OT finalizada, promedio, conteo, reviews, zonas y habilidades.

Brechas:

- No hay dificultad, urgencia, racha, puntos, score versionado, reversa ni recuperación.
- Ratings y confiabilidad no están separados.
- Faltan eventos suficientemente confiables para calcularlo justamente.

Reutilizar: reviews/rating como una señal. Construir scores sólo después de asignaciones, campo y cancelaciones.

### 11. Agenda — parcial, no preventiva

Existe:

- Disponibilidad semanal y ausencias aprobadas con horas, pero por empresa.
- Resumen de 15 días y ruta diaria.
- Google Calendar opcional, actualmente con eventos all-day del manager.

Brechas:

- OTs usan fechas sin hora/duración.
- `assignInstaller` no valida disponibilidad/conflicto.
- No existe `/agenda`, historial de mes previo ni filtros pedidos.
- No hay conflicto cross-company opaco, lock concurrente o traslado.

Reutilizar: componentes/calendario, disponibilidad, ausencias, geografía y Google sync. Crear tiempo real y gate transaccional.

### 12. Dashboard y clima — mayormente existente, necesita corrección

Existe:

- KPIs, agenda, capacidad, regiones, instaladores, calidad, incidentes, mapa y clima.
- Resolución en primera visita y desempeño por región/instalador.

Brechas:

- No hay filtros globales consistentes.
- Forecast solicita un día, no 48 horas, y limita zonas.
- Una provincia argentina sin coordenadas puede caer en Brasilia por fallback incompleto (`lib/weather/forecast.ts`).
- La alerta no cuantifica/navega OTs afectadas.

Reutilizar casi toda la presentación. Corregir geografía/clima y cambiar fuentes después de estabilizar eventos.

### 13. Notificaciones y masivos — parcial

Existe:

- Leído, marcar todas, realtime, push y menú.
- Anuncios por todos/zona/proyecto con severidad y email best-effort.

Brechas:

- No hay archivo/descarte; el menú no representa prioridad almacenada.
- Bandeja limitada y sin historial/filtros completos.
- No hay localidad, servicio, equipo o disponibilidad, preview de destinatarios ni delivery durable.

Reutilizar: notifications, push, Resend y anuncios. Añadir estado por destinatario y outbox de deliveries.

### 14. Campo — buen esqueleto, contrato incompleto

Existe:

- Aceptación, check-in/inicio, progreso, bloqueo, envío a revisión, aprobación y reapertura.
- Reglas server y trigger DB para varias transiciones.

Brechas:

- No distingue en camino, llegada e inicio.
- No hay checklist/incidente estructurado ni evidencia mínima; finalizar admite cero fotos.
- Reabrir no exige motivo ni “pedir evidencia/corrección” como resultados distintos.
- `order_updates` no registra bien a todo actor; offline puede omitir historial.

Reutilizar: UI/timeline/fotos y reglas conocidas. Centralizar en evento/comando atómico y proyectar al modelo legacy.

### 15. Cliente final — ya cumple

No hay rol, layout ni portal cliente; `/clients` pertenece a empresa y RLS protege datos. Debe formalizarse como non-goal y registrar la aprobación externa a través de la agencia.

### 16. Dominio, email, pt-BR, manual y QA — parcial

Existe:

- Callback/recuperación, invitaciones Resend con fallback y catálogos es/pt con test de claves.

Brechas:

- Dominio/SMTP/redirect y recepción real siguen pendientes.
- Invitaciones/alta master usan `email_confirm: true`; “verificación” requiere definición de producto, no sólo DNS.
- Paridad técnica no valida calidad lingüística pt-BR.
- No hay manual/tutorial/video y falta el smoke manual móvil autenticado.

Reutilizar: flujos auth/email e i18n. Configurar temprano; revisar idioma/manual cuando la UX esté estable.

## Riesgos actuales fuera de la minuta

Estos puntos se incorporan a R0:

- **Suspensión cosmética:** la API master cambia `companies.status`, pero proxy/auth/RLS no lo aplican como bloqueo general.
- **Conteo master incorrecto:** agrupa por `profiles.company_id` y omite membresías multiempresa.
- **Cache de sesión:** páginas autenticadas en SW pueden sobrevivir al contexto esperado.
- **Integridad offline:** transición directa sin el mismo evento/auditoría del servidor.
- **QA no reproducible:** no existe `.github/workflows`, Playwright/E2E ni pipeline de pgTAP.
- **Runtime no fijado:** Node/pnpm y overrides no tienen contrato reproducible probado.
- **Entornos:** el checklist vigente advierte uso de la misma base para local/producción; staging aislado es prerrequisito.
- **Observabilidad:** no hay integración visible para errores, jobs, fan-out o sync.
- **Headers:** CSP está pendiente.
- **Alta no atómica:** invitación puede crear Auth user antes de fallar un paso posterior.

## Estado de validación

Esta auditoría fue read-only. No se ejecutaron tests/build para elaborar el plan: la documentación histórica reporta 130 tests, type-check, lint y build verdes, pero el gestor local mostró deriva de configuración y esa evidencia no está automatizada en CI. R0 exige recrear un baseline verificable antes de implementar.
