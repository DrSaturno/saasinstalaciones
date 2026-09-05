# Auditoría UX integral — Se Instala

**Fecha:** 2026-09-05  
**Alcance:** aplicación activa `saasinstalaciones`, branch `docs-security-audit-estado-final`  
**Estado:** fase de riesgo operativo implementada; pendiente cierre E2E autenticado  
**Objetivo:** detectar fricción, riesgo operativo y brechas de accesibilidad antes de aprobar una etapa de implementación.

## Resumen ejecutivo

Se Instala ya tiene una base de producto coherente: separa bien las áreas de plataforma, empresa e instalador; conserva el idioma por perfil; protege acciones por rol; usa skeletons por área; ofrece importación con preflight; modela estados operativos detallados y dispone de una cola idempotente para mutaciones de campo. Las rutas públicas observadas refluían sin desborde horizontal en 320, 375, 768, 1024, 1366 y 1920 px.

La línea de base encontró riesgos de continuidad durante `en_camino` y `en_sitio`, reapertura sin red, conflictos offline invisibles, errores mostrados como vacíos, acciones de alto impacto, MFA y cálculo de “hoy”. La primera fase ya corrige esos puntos en código y suma recuperación visible y pruebas unitarias específicas. La experiencia todavía no debe declararse completamente cerrada hasta ejecutar el recorrido E2E autenticado/offline y resolver los P1 restantes: semántica y teclado en listados, drawer y zoom móvil, contraste, navegación contextual, historial alcanzable, errores de formularios y agenda responsive.

### Resultado por prioridad

| Prioridad | Cantidad | Lectura ejecutiva |
|---|---:|---|
| P0 | 0 | No se demostró un bloqueo total, pérdida de datos o riesgo de seguridad desde el alcance disponible. No se puede descartar un P0 sin cuentas de prueba por rol y datos representativos. |
| P1 | 16 | Deben resolverse antes de escalar uso operativo o declarar conformidad WCAG 2.2 AA. Afectan trabajo de campo, navegación, accesibilidad, recuperación y confianza. |
| P2 | 9 | Mejoras importantes para comprensión, orientación, eficiencia y consistencia. |
| P3 | 3 | Pulido y mantenibilidad; no bloquean la tarea primaria. |

### Avance de implementación — 2026-09-05

La primera fase aprobada ya está aplicada en el producto. Se mantuvieron los findings originales como línea de base y se registra acá su estado posterior a la implementación.

| Finding | Estado | Resolución aplicada | Validación disponible |
|---|---|---|---|
| UX-001 | Implementado | Inicio y Ruta incluyen `en_camino` y `en_sitio`; los tres estados de ejecución se priorizan y cuentan como trabajo en curso. | TypeScript, lint, build y suite unitaria. |
| UX-002 | Implementado; falta prueba real de reapertura | Service worker `network-first` con fallback privado para rutas de campo visitadas; calentamiento de la ruta actual; limpieza por cambio de identidad/logout; restauración del último estado optimista pendiente después de validar el propietario del almacenamiento local. | Tests de caché, fallback exacto/por ruta y limpieza de cuenta; falta E2E con navegador cerrado y red cortada. |
| UX-003 | Implementado | Indicador diferencia pendiente de bloqueado; bandeja persistente con orden, momento, motivo, reintento, descarte confirmado y reapertura de tarea; reconciliación tras cada sync. | Tests de snapshot, reintento, descarte en cascada y transición pendiente; falta lector de pantalla y conflicto real contra Supabase local. |
| UX-010 | Implementado en las lecturas críticas inventariadas | Proyectos, Tareas, Ruta, Coordinación, Mensajes, Notificaciones, clientes, equipo, agenda, cancelaciones, encuestas, evidencia, órdenes paginadas y datos del Inicio dejan de convertir errores en vacíos; registran el fallo y activan el error boundary recuperable. | TypeScript, lint, build y suite unitaria. |
| UX-012 | Implementado en el alcance inventariado | Confirmación contextual para cancelar/reasignar/desasignar, quitar miembros, cancelar invitaciones, descartar notificaciones y suspender empresas. | TypeScript, lint, build y validación de mensajes ES/PT. |
| UX-014 | Implementado | Setup y verificación MFA conservan AAL2 obligatorio, muestran cuenta activa, salida de sesión y orientación de recuperación. | TypeScript, lint y build; falta recorrido TOTP autenticado. |
| UX-015 | Implementado | La zona operativa se deriva del país de la membresía y prioriza el idioma en usuarios multiempresa; Inicio, Ruta y el conteo de trabajos finalizados hoy comparten esa regla. | Test unitario AR/BR/multiempresa, TypeScript y build. |

La validación automatizada cerró con **62 archivos / 453 tests**, lint completo sin errores y build de producción exitoso. Docker, la CLI de Supabase y el stack local no están disponibles en este equipo, por lo que los escenarios E2E autenticados/offline siguen siendo el criterio pendiente antes de declarar la fase completamente cerrada.

### Cierre de la fase E2E — 2026-09-05

Los recorridos que faltaban se ejecutaron contra el **Supabase local de CI** con
un build de producción (el service worker sólo se registra ahí). Resultado:
**51 pruebas E2E en verde, sin skips ni reintentos**.

| Recorrido | Estado | Qué cubre |
|---|---|---|
| E2E-01 continuidad de estados | ✅ | Aceptar → en camino → llegué → iniciar; tras cada transición la orden sigue listada y el estado sobrevive a recargar |
| E2E-02 reapertura sin red | ✅ | `/home` y `/tasks` ya visitadas reabren con la red cortada |
| E2E-03 mutación offline | ✅ | Un avance sin red se encola, se avisa como «sin enviar» y sincroniza al volver |
| E2E-06 MFA sin callejón | ✅ | Salida, orientación de recuperación, cuenta visible, target ≥44 px, código inválido |
| E2E-04 conflicto forzado | ⬜ | Requiere manipular el servidor a mitad del flujo |
| E2E-05 aislamiento entre cuentas | ⬜ | Falta la verificación completa de Cache Storage/IndexedDB entre dos identidades |
| E2E-07 bordes de medianoche | ⬜ | Cubierto por unit tests AR/BR; falta el E2E con reloj sintético |

> **Hallazgo de la fase (abierto): la cola no se recupera sola tras un corte de
> red prolongado.** Al volver la señal, `flush()` aborta en
> `supabase.auth.getUser()` con `TypeError: Failed to fetch` usando el cliente
> que quedó del corte. Como la excepción salta **antes** de tocar la cola, el
> ítem ni siquiera suma un intento fallido: queda pendiente indefinidamente y
> **no aparece en la bandeja de conflictos**, que es justo el mecanismo que
> UX-003 agregó para que nada quede invisible. Se recupera al reabrir la
> pantalla (remonta el hook con un cliente nuevo), que es lo que hace la mayoría
> al salir de un sótano — por eso no es un P0, pero sí conviene cerrarlo:
> reintentar `getUser()` o recrear el cliente dentro de `flush()` cuando la
> llamada falla por red.

### P1 restantes después de esta fase

1. Reemplazar filas sólo clickeables por enlaces/controles semánticos y operables por teclado.
2. Corregir el drawer móvil, el zoom y los contrastes globales.
3. Unificar la navegación por audiencia y conservar filtros/retorno en URL.
4. Habilitar acceso real al historial completo de notificaciones y conversaciones.
5. Localizar errores de formularios críticos y proteger trabajo sin guardar.
6. Convertir la agenda de campo en una experiencia responsive sin ancho mínimo forzado.

## Método, evidencia y límites

La auditoría combinó:

- inventario completo de las 38 rutas de página actuales;
- inspección de layouts, navegación, componentes, formularios, lecturas Supabase, flujos de estados y almacenamiento offline;
- recorrido local en navegador de portada, login, error de autenticación, recuperación y redirección a ruta protegida;
- verificación de reflow en 320, 375, 768, 1024, 1366 y 1920 px para la portada y en 320–375 px para autenticación pública;
- contraste calculado a partir de los tokens reales de `app/globals.css`;
- contraste con WCAG 2.2 AA y las Web Interface Guidelines vigentes.

No se usaron producción, secretos ni datos reales. Las credenciales disponibles en el entorno local no permitieron entrar a las áreas autenticadas; por eso las observaciones visuales de esas rutas están sustentadas en el DOM/JSX y deben cerrarse con una ronda manual por rol. No se evaluaron métricas analíticas, sesiones grabadas ni entrevistas, por lo que las recomendaciones de eficiencia marcadas como hipótesis requieren validación de uso.

Referencias normativas:

- [W3C WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)
- [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)

## Tipos de usuario y objetivos

| Usuario | Alcance real | Objetivos principales | Acciones críticas | Riesgos UX dominantes |
|---|---|---|---|---|
| Visitante / prospecto | Portada y contacto comercial | Entender la propuesta y acceder | Ingresar, contactar ventas, cambiar idioma | Bajo; recorrido público corto y responsive |
| Usuario invitado | Invitación y alta de cuenta | Validar invitación, crear cuenta, empezar | Definir contraseña, aceptar invitación | Token vencido, error de formulario, retorno insuficiente |
| `company_manager` | Un tenant completo | Coordinar proyectos, locaciones, órdenes, equipo y finanzas | Crear/importar, asignar, reprogramar, cancelar, aprobar, pagar, gestionar roles | Acciones de alto impacto poco protegidas, tablas no accesibles, errores disfrazados de vacío |
| Instalador | Sus membresías y órdenes asignadas | Aceptar trabajo, llegar, ejecutar, documentar y cerrar | Aceptar, navegar, marcar hitos, adjuntar evidencia, reportar bloqueo | Red intermitente, estados que desaparecen, targets pequeños, datos no disponibles al reabrir offline |
| Coordinador | Proyectos/empresas donde tiene membresía de coordinación; puede conservar rol instalador | Validar relevamientos, mover órdenes y coordinar equipo | Aceptar/planificar/cancelar, revisar evidencia, comunicarse | Cambio de contexto entre empresa/instalador, navegación condicional y falta de recuperación |
| `platform_admin` | Todas las empresas desde APIs administrativas | Crear, suspender, reactivar y eliminar empresas | Cambiar estado del tenant, entregar credenciales, borrar | Alto impacto y dependencia de MFA; suspensión necesita confirmación explícita |

**Aclaración de modelo:** “cliente” es una entidad administrada por la empresa, no un usuario externo con acceso propio en las rutas actuales.

## Inventario de pantallas y rutas

### Públicas, acceso y seguridad

| Ruta | Pantalla / usuario | Objetivo y acciones | Datos clave | Estado actual y problemas detectados |
|---|---|---|---|---|
| `/` | Portada / visitante | Entender producto; ingresar; contactar ventas; ES/PT | Propuesta, beneficios, planes, FAQ | Reflow verificado sin overflow en seis anchos; falta metadata específica por página (UX-018) |
| `/login` | Ingreso / todos | Autenticarse; ver/ocultar clave; recuperar contraseña | Email, contraseña, `next`, motivo de bloqueo | Labels, autocomplete, `aria-invalid` y alerta correctos; el contexto de filtros se pierde tras login (UX-021) |
| `/forgot-password` | Recuperación / todos | Solicitar enlace; volver a login | Email | Confirmación anti-enumeración correcta; error sólo global y sin foco dirigido (UX-012) |
| `/reset-password` | Nueva clave / todos | Definir y confirmar contraseña | Token/sesión de recuperación, contraseña | Contempla enlace inválido; error sólo global y sin vínculo a campos (UX-012) |
| `/invite/[token]` | Alta por invitación / invitado | Validar invitación y crear cuenta | Token, email, rol, nombre, contraseña | Contempla token inválido/vencido; falta auditoría visual autenticada completa y marcación consistente de obligatorios (UX-020) |
| `/two-factor/setup` | Enrolamiento MFA / manager y admin | Escanear secreto, validar TOTP | QR/secreto, código | Cuando es obligatorio no ofrece salir/cambiar cuenta/ayuda (UX-014) |
| `/two-factor/verify` | Verificación MFA / manager y admin | Subir a AAL2 | Código TOTP | Mismo callejón sin salida ante dispositivo perdido o fallo (UX-014) |

### Empresa

| Ruta | Pantalla / usuario | Objetivo y acciones | Datos clave | Estado actual y problemas detectados |
|---|---|---|---|---|
| `/dashboard` | Inicio empresa / manager | Ver salud operativa, accesos rápidos y anuncios | KPIs, clima, agenda, actividad, pendientes | Loading de área disponible; revisar error/partial por widget (UX-009) |
| `/projects` | Proyectos / manager | Buscar/filtrar, cambiar vista, crear | Cliente, fechas, estado, avance por sitios | Error de consulta se presenta como “sin proyectos”; filtros sólo locales (UX-008, UX-009) |
| `/projects/[id]` | Detalle proyecto / manager | Entender alcance; importar/crear sitios y órdenes; archivar | Proyecto, sitios, coordinador, montos, progreso | Profundidad sin breadcrumb y retorno sin contexto (UX-023); formularios largos (UX-012) |
| `/projects/[id]/sites/[siteId]` | Sitio operativo / manager | Ver requisitos, archivos, galería e historial; editar/archivar/eliminar | Dirección, geolocalización, estado, evidencia | Galería con enlace sin nombre y borrado oculto en touch (UX-019) |
| `/orders` | Órdenes / manager | Buscar, filtrar, ordenar, crear | Número, sitio, proyecto, instalador, fecha, monto, estado | Filas no semánticas/teclado, filtros sin URL y tabla ancha (UX-003, UX-008, UX-016) |
| `/orders/[id]` | Detalle de orden / manager | Revisar evidencia, asignar, reprogramar, cambiar estado, aprobar | Estado, sitio, instalador, presupuesto, evidencia, incidencias | Cancelación y asignación inmediatas; retorno pierde lista filtrada (UX-011, UX-008) |
| `/agenda` | Agenda / manager | Cruzar trabajos por fecha, proyecto, zona, instalador y tipo | Fechas, orden, proyecto, instalador, estado | Grid ancho sólo clickeable; filtros locales y sin labels (UX-003, UX-008, UX-015, UX-016) |
| `/clients` | Clientes / manager | Crear, buscar y abrir cuentas cliente | Contacto, identificación, proyecto(s) | Error/vacío deben separarse; validar enlace social (UX-009, UX-026) |
| `/clients/[id]` | Detalle cliente / manager | Editar contacto, ver proyectos, abrir canales | Email, teléfono, social, proyectos | URL social arbitraria se convierte en enlace externo sin prevalidación (UX-026) |
| `/team` | Equipo / manager | Invitar, cambiar capacidades, remover/reactivar | Perfil, roles, zonas, rating, carga, invitaciones | Tabla ancha y remoción/cancelación de invitación sin prevención uniforme (UX-011, UX-024) |
| `/team/[installerId]` | Perfil operativo / manager | Ver carga, desempeño, disponibilidad y asignaciones | Roles, rating, órdenes, zonas, ausencias | Profundidad sin breadcrumb; revisar partial/error de datasets (UX-009, UX-023) |
| `/broadcasts` | Comunicados / manager | Componer, segmentar, consultar historial | Audiencia, severidad, contenido, envío | Filtro en URL es positivo; confirmar estados parciales de envío y reintento (matriz) |
| `/finance` | Finanzas / manager | Analizar período, exportar y registrar pagos | Ingreso, costo, margen, pendientes, moneda | URL de período bien modelada; tablas anchas y acciones financieras requieren pruebas de prevención (UX-016) |
| `/settings` | Configuración / manager | Ver cuenta, política de evidencia, contraseña y MFA | Perfil, mínimo de fotos, seguridad | Datos de empresa sin error explícito; formularios con error global (UX-009, UX-012) |
| `/locations/[id]` | Locación canónica / manager | Revisar identidad y sitios vinculados | Dirección canónica, geolocalización, divergencias | Ruta profunda sin orientación jerárquica (UX-023) |
| `/locations/review` | Cola de normalización / manager | Resolver incidencias y vínculos de locaciones | Conflictos, coincidencias, sitios | Ítem aparece/desaparece del nav según conteo; fuente de nav debe ser única (UX-007) |

### Compartidas

| Ruta | Pantalla / usuario | Objetivo y acciones | Datos clave | Estado actual y problemas detectados |
|---|---|---|---|---|
| `/messages` | Conversaciones / manager, coordinador, instalador | Abrir conversación | Par, empresa, última actividad | Vacío sin acción contextual; el nav cambia al entrar (UX-007) |
| `/messages/[installerId]` | Chat / usuarios habilitados | Leer, responder, adjuntar y marcar leído | Mensajes, adjuntos, presencia, lecturas | Sólo carga los últimos 300 sin acceso a anteriores; offline depende de cola (UX-010) |
| `/notifications` | Bandeja / manager, coordinador, instalador | Filtrar, abrir, archivar, restaurar, descartar | Severidad, leído, archivado, fecha | Más de 50 sólo muestra aviso, sin “cargar más”; descarte irreversible sin undo (UX-010, UX-011) |

### Instalador y coordinación

| Ruta | Pantalla / usuario | Objetivo y acciones | Datos clave | Estado actual y problemas detectados |
|---|---|---|---|---|
| `/home` | Inicio campo / instalador/coordinador | Ver próxima tarea, semana, avisos, clima y ausencias | Órdenes abiertas, empresas, zonas, fecha local | Oculta `en_camino`/`en_sitio`; fecha siempre Argentina (UX-001, UX-013) |
| `/tasks` | Mis tareas / instalador | Aceptar, buscar, filtrar y abrir | Estado, fecha, sitio, empresa, aceptación | Filtros locales; fecha ISO cruda; error de lectura parece vacío (UX-008, UX-009, UX-022) |
| `/tasks/[id]` | Ejecución de orden / instalador | Aceptar, salir, llegar, iniciar, evidenciar, bloquear, finalizar | Estado, ubicación, condiciones, fotos, updates | Mutación offline optimista sin resolución visible; lectura no reabre offline (UX-002) |
| `/schedule` | Agenda / instalador | Consultar trabajo por fecha/zona/proyecto/empresa | Actividad y estado | Tabla mínima 980 px en área diseñada a 375 px; fila no teclado; filtros sin labels (UX-003, UX-015, UX-016) |
| `/route` | Ruta de hoy / instalador | Ver paradas y abrir navegación | Fecha local, base, coordenadas, estado | Excluye `en_camino`/`en_sitio` y usa huso argentino fijo (UX-001, UX-013) |
| `/jobs` | Oportunidades / instalador | Explorar y tomar trabajo disponible | Empresa, sitio, fecha, condiciones | Verificar error/vacío y elegibilidad en prueba por roles (UX-009) |
| `/earnings` | Ingresos / instalador | Consultar períodos e importes | Período, pagos, moneda | Filtros en URL son positivos; validar tabla/reflow con datos reales |
| `/profile` | Perfil y disponibilidad / instalador | Editar identidad, cobertura, base, disponibilidad, seguridad | Avatar, zonas, ubicación, agenda, ausencias, MFA | Pantalla larga y densa en móvil (UX-027) |
| `/coordination` | Tablero / coordinador | Filtrar, aceptar/validar y mover órdenes | Empresas, proyectos, instaladores, relevamientos | Error de proyectos/órdenes se confunde con “sin proyectos”; filtros locales (UX-008, UX-009) |
| `/coordination/[id]` | Orden coordinada / coordinador | Revisar detalle, evidencia y decidir | Orden, proyecto, asignación, evidencia | Confirmación de cancelación existe; orientación/retorno sigue perdiendo contexto (UX-023) |

### Plataforma

| Ruta | Pantalla / usuario | Objetivo y acciones | Datos clave | Estado actual y problemas detectados |
|---|---|---|---|---|
| `/master` | Resumen / admin | Monitorear compañías y métricas | Empresas, estados, volumen | Loading disponible; validar estados parciales de widgets (UX-009) |
| `/master/companies` | Empresas / admin | Crear, suspender/reactivar, borrar | Tenant, manager, estado, credenciales iniciales | Borrado exige escribir nombre; suspensión/reactivación es inmediata (UX-011) |

## Flujos principales y puntos de decisión

| Flujo | Secuencia actual | Decisiones / bifurcaciones | Riesgo o fricción | Criterio de éxito UX |
|---|---|---|---|---|
| Acceso e invitación | Invitación → alta → login → MFA si corresponde → home por rol | Token válido; rol fijado; MFA enrolado/verificado; empresa activa | Error global, `next` parcial, MFA sin salida | Siempre hay explicación, recuperación y destino conservado; foco va al problema |
| Alta masiva de operación | Proyecto → importación de sitios → preflight → confirmar → crear órdenes | Cantidades coinciden; filas inválidas/duplicadas; asignación común | El preflight es fuerte; cerrar formularios borra trabajo sin advertencia | Ningún dato se pierde sin aviso; errores se vinculan a campo/fila; resultado descargable |
| Planificación de orden | Crear/editar → asignar → calendarizar → notificar | Instalador elegible; fechas válidas; conflictos; monto visible por rol | Reasignación ocurre al cambiar select; filtros/retorno se pierden | Resumen de impacto antes de cambios sensibles; vuelta exacta al contexto previo |
| Ejecución en campo | Aceptar → salir → llegar → iniciar → progreso/bloqueo → evidencia → revisión | Red disponible; ubicación; mínimo de fotos; conflicto de estado | La tarea desaparece en tránsito; offline sólo cubre escritura y esconde rechazos | La tarea activa permanece prominente; cada acción tiene estado confirmado/pendiente/fallido y recuperación |
| Revisión y cierre | Instalador envía → manager/coordinador revisa → aprueba/corrige/reabre → rating/pago | Evidencia suficiente; corrección; cancelación; reapertura | Confirmaciones inconsistentes; feedback basado en toast | Decisión, consecuencia y siguiente estado son inequívocos; historial conserva trazabilidad |
| Coordinación multiempresa | Entrar como coordinador → agrupar → filtrar → abrir orden → decidir | Empresa/proyecto; coordinación vs ejecución propia | Nav condicional y contexto ambiguo; error parece falta de asignación | Rol y empresa activos siempre visibles; retorno conserva agrupación y filtros |
| Comunicación | Bandeja → conversación/notificación → actuar → archivar/descartar | Leído; severidad; acción pendiente; offline | Historial truncado y descarte sin recuperación | Todo el historial es alcanzable; alertas críticas no desaparecen accidentalmente |
| Administración de tenant | Crear → entregar acceso → activar/suspender/reactivar/eliminar | Identidad exacta; empresa con dependencias; MFA | Suspensión inmediata; MFA puede dejar al admin atrapado | Confirmación proporcional al impacto y vía segura para salir/recuperar acceso |

## Findings P0

No se encontró un P0 reproducible en el alcance disponible. Esta conclusión es provisional hasta ejecutar pruebas autenticadas con los cinco perfiles funcionales, datos volumétricos y escenarios offline reales.

## Findings P1

### UX-001 — La orden activa desaparece durante traslado y llegada

- **Pantalla o flujo:** `/home`, `/route`, ejecución de `/tasks/[id]`.
- **Usuario afectado:** instalador y coordinador que también instala.
- **Problema:** `en_camino` y `en_sitio` son estados válidos del flujo de campo, pero no forman parte de las órdenes abiertas del Inicio ni de la consulta de Ruta.
- **Evidencia:** `lib/data/installer-home.ts:63-65` define `OPEN` sin esos dos estados y lo usa para próxima tarea, semana, KPIs y zonas (`:121-174`). `app/(installer)/route/page.tsx:55-64` filtra sólo `planificada`, `en_proceso` y `relevamiento`. `components/installer/task-actions.tsx:74-161` sí transiciona a `en_camino`, `en_sitio` y luego `en_proceso`.
- **Consecuencia:** apenas el instalador confirma que salió o llegó, el trabajo en curso deja de ser su “próxima tarea” y puede desaparecer de su ruta. Esto genera dudas, navegación extra y riesgo de omitir el inicio/finalización.
- **Severidad:** **P1** — rompe continuidad en la tarea principal de campo.
- **Recomendación:** usar una única definición de “trabajo activo” para Inicio, Tareas y Ruta; priorizar `en_sitio`, `en_camino` y `en_proceso`; mantener visible el CTA siguiente.
- **Criterio de aceptación:** una orden permanece visible y destacada en Inicio, Ruta y Tareas desde que se acepta hasta que entra en revisión/finaliza/cancela; cada estado muestra exactamente una acción siguiente válida.
- **Prueba necesaria:** test unitario de cada transición y E2E mobile `planificada → en_camino → en_sitio → en_proceso → en_revision`, verificando presencia y CTA en las tres pantallas.

### UX-002 — La promesa offline no incluye volver a abrir ni navegar datos privados

- **Pantalla o flujo:** PWA del instalador, especialmente Inicio, Tareas, detalle y Ruta.
- **Usuario afectado:** instalador en calle con señal intermitente.
- **Problema:** la cola permite escribir desde una pantalla ya cargada, pero las navegaciones autenticadas son siempre de red. Existe una tabla Dexie `tasks`, pero no se escribe ni se lee en la aplicación.
- **Evidencia:** `public/sw.js:7-14` declara explícitamente que la navegación autenticada va siempre a red y que la lectura privada offline queda para una implementación futura. `lib/offline/db.ts:53-68` define `CachedTask`; la búsqueda de `db.tasks` sólo encuentra su limpieza en `:79-84`.
- **Consecuencia:** si el instalador recarga, cierra/reabre la PWA o cambia de ruta sin señal, no puede consultar la dirección, condiciones ni evidencia de la tarea, aunque la interfaz diga que puede seguir trabajando.
- **Severidad:** **P1** — riesgo directo para continuidad operativa fuera de cobertura.
- **Recomendación:** guardar snapshots mínimos por usuario/empresa, encriptados o aislados por identidad; ofrecer una shell offline explícita, “última actualización” y límites claros de lo disponible.
- **Criterio de aceptación:** tras sincronizar y cortar red, el usuario puede reabrir la PWA, ver sus tareas asignadas, abrir un detalle previamente sincronizado y seguir agregando hitos/evidencia sin mezclar cuentas.
- **Prueba necesaria:** E2E PWA con cierre/reapertura offline, cambio de ruta, logout/login de otra cuenta, caducidad de snapshot y vuelta a online.

### UX-003 — Los conflictos definitivos de la cola offline son invisibles

- **Pantalla o flujo:** cualquier transición, evidencia o chat encolado; indicador global.
- **Usuario afectado:** instalador y coordinador móvil.
- **Problema:** el motor marca operaciones como `blocked` con `lastError`, pero el indicador sólo conoce online/offline, sincronizando y cantidad pendiente. La UI optimista puede quedar mostrando éxito sin comunicar el rechazo del servidor.
- **Evidencia:** `lib/offline/sync.ts:104-138` conserva transiciones inválidas o rechazadas como bloqueadas. `components/installer/sync-indicator.tsx:11-37` sólo renderiza `online`, `pending` y `syncing`. `components/installer/task-actions.tsx:74-210` cambia estado local y notifica que quedó en cola antes de la aceptación del servidor.
- **Consecuencia:** el usuario cree que informó llegada, progreso o cierre; la acción permanece pendiente indefinidamente y no sabe si reintentar, corregir o contactar soporte.
- **Severidad:** **P1** — falsa confirmación sobre hechos operativos críticos.
- **Recomendación:** separar “pendiente”, “sincronizando” y “requiere atención”; agregar bandeja de conflictos con orden, acción, hora, motivo comprensible y opciones seguras de reintentar, descartar o abrir la tarea.
- **Criterio de aceptación:** todo item bloqueado cambia el indicador a error, se anuncia, aparece en una bandeja persistente y ofrece al menos una salida segura; el estado optimista se reconcilia con el servidor.
- **Prueba necesaria:** simular conflicto de estado, permiso revocado, archivo rechazado y error transitorio; validar reintento, descarte, reconciliación y lector de pantalla.

### UX-004 — Listados críticos no son operables por teclado ni tablas semánticas

- **Pantalla o flujo:** Órdenes, locaciones y agendas de empresa/instalador.
- **Usuario afectado:** manager, instalador y coordinador; especialmente usuarios de teclado o lector de pantalla.
- **Problema:** encabezados y filas se renderizan como `div`; la fila completa navega sólo con `onClick`, sin enlace, rol, `tabIndex` ni evento de teclado.
- **Evidencia:** `components/company/orders-table.tsx:95-100`, `components/company/sites-table.tsx:77-89`, `components/company/agenda-table.tsx:170-189` y `components/installer/agenda-table.tsx:159-178`.
- **Consecuencia:** las filas no entran al orden de tabulación, no se activan con teclado y los encabezados no quedan asociados a celdas. Incumple WCAG 1.3.1, 2.1.1 y 4.1.2.
- **Severidad:** **P1** — bloquea navegación y comprensión de superficies centrales.
- **Recomendación:** usar tabla semántica cuando los datos son tabulares y un `<Link>` con foco visible por fila/celda primaria; si se conserva virtualización, implementar patrón grid completo con roles y teclado, no sólo `role` decorativo.
- **Criterio de aceptación:** toda fila es alcanzable, identificable y activable con teclado; el lector anuncia encabezados y valores; el click en controles internos no dispara navegación accidental.
- **Prueba necesaria:** recorrido sólo teclado, NVDA/Chrome y VoiceOver/Safari, axe y tests de Enter/Space/foco con virtualización.

### UX-005 — El drawer móvil mantiene controles ocultos en el foco y no gestiona el foco

- **Pantalla o flujo:** shell autenticada en móvil.
- **Usuario afectado:** todos los roles autenticados que navegan con teclado, switch control o lector.
- **Problema:** el `<aside>` queda montado y sólo se traslada fuera de pantalla cuando está cerrado. No usa `inert`/`aria-hidden`, no mueve/restaura foco, no atrapa foco al abrir, no responde a Escape y no hay enlace “Saltar al contenido”.
- **Evidencia:** `components/shared/app-shell-frame.tsx:59-99` y `:126-149`; los enlaces siguen presentes en `components/shared/sidebar-nav.tsx:57-84`.
- **Consecuencia:** el foco puede recorrer navegación invisible o escapar detrás del overlay; el usuario pierde ubicación. Falta un mecanismo de bypass para un menú largo. Afecta WCAG 2.4.1, 2.4.3 y 2.4.11.
- **Severidad:** **P1** — navegación transversal defectuosa en el área móvil prioritaria.
- **Recomendación:** usar Dialog/Sheet accesible o implementar `inert`, foco inicial/cíclico, Escape y retorno al trigger; agregar skip link a un `main` con id estable.
- **Criterio de aceptación:** cerrado, ningún elemento del menú recibe foco; abierto, foco entra al menú, no escapa, Escape cierra y el trigger recupera foco; skip link salta al contenido.
- **Prueba necesaria:** teclado a 320/375 px, NVDA, VoiceOver iOS y test automatizado de orden de foco.

### UX-006 — El viewport impide ampliar contenido

- **Pantalla o flujo:** toda la aplicación móvil.
- **Usuario afectado:** personas con baja visión y usuarios que necesitan zoom puntual.
- **Problema:** se fija `maximumScale: 1` para evitar zoom accidental.
- **Evidencia:** `app/layout.tsx:40-46`.
- **Consecuencia:** se elimina una ayuda fundamental para leer y operar; la intención de evitar un gesto accidental perjudica acceso intencional. Afecta WCAG 1.4.4.
- **Severidad:** **P1** — barrera global de accesibilidad.
- **Recomendación:** quitar el límite de escala y prevenir zoom no deseado con inputs de al menos 16 px y targets adecuados.
- **Criterio de aceptación:** el usuario puede ampliar al menos 200% y completar tareas sin pérdida de contenido ni funcionalidad.
- **Prueba necesaria:** pinch zoom en iOS/Android, zoom del navegador 200% y reflow a 320 px.

### UX-007 — Tokens de texto y controles no alcanzan contraste AA

- **Pantalla o flujo:** transversal: botones primarios, enlaces azules, texto secundario, warnings e inputs.
- **Usuario afectado:** todos; mayor impacto en baja visión, luz exterior y pantallas de bajo contraste.
- **Problema:** varias combinaciones base quedan por debajo de 4.5:1 para texto normal y de 3:1 para límites de controles.
- **Evidencia:** tokens de `app/globals.css:69-102`. Cálculo sRGB: `#2597d0`/blanco = **3.27:1**; `#868c98`/blanco = **3.38:1** y sobre `#fafafa` = **3.24:1**; `#ff9800`/blanco = **2.16:1**; borde `#ececef`/blanco ≈ **1.18:1**. Se usan con texto de 10–14 px y como único borde de inputs en numerosos componentes.
- **Consecuencia:** etiquetas secundarias, CTAs y advertencias pierden legibilidad; algunos campos son difíciles de distinguir. Afecta WCAG 1.4.3 y potencialmente 1.4.11.
- **Severidad:** **P1** — problema sistémico y de alta superficie.
- **Recomendación:** crear tokens separados para fondo de marca y texto/link; oscurecer foregrounds de texto, mantener pasteles sólo como fondo y reforzar el borde de inputs. No depender de color para estado.
- **Criterio de aceptación:** texto normal ≥4.5:1, texto grande y componentes/estados ≥3:1 en reposo, hover, focus, disabled y dark tokens aunque dark no se exponga.
- **Prueba necesaria:** contraste automático por story/estado más revisión manual en sol/simulaciones de baja visión.

### UX-008 — La navegación cambia al entrar a Mensajes o Notificaciones

- **Pantalla o flujo:** shell empresa/instalador, `/messages*`, `/notifications`.
- **Usuario afectado:** manager, instalador y coordinador.
- **Problema:** cada route group reconstruye su propio array de navegación y omite elementos diferentes.
- **Evidencia:** empresa principal incluye Agenda y Settings (`app/(company)/layout.tsx:41-63`); Mensajes omite ambos (`app/(messaging)/messages/layout.tsx:19-28`); Notificaciones omite Settings (`app/(inbox)/notifications/layout.tsx:28-38`). Instalador principal incluye Agenda e Ingresos (`app/(installer)/layout.tsx:26-38`); Mensajes omite ambos (`messages/layout.tsx:29-39`); Notificaciones omite Ingresos (`notifications/layout.tsx:39-50`).
- **Consecuencia:** opciones conocidas desaparecen al cambiar de sección, deteriorando orientación y confianza; afecta consistencia de navegación WCAG 3.2.3.
- **Severidad:** **P1** — defecto transversal en rutas frecuentes.
- **Recomendación:** generar el nav desde una única función por audiencia y capacidades; inyectar badges/ítems condicionales sin duplicar la lista.
- **Criterio de aceptación:** el mismo usuario ve el mismo orden, etiquetas e ítems en todas sus rutas; sólo cambian elementos por permisos/datos explícitos.
- **Prueba necesaria:** snapshot de navegación por rol/membresía en cada route group y recorrido visual desktop/mobile.

### UX-009 — Filtros, vista y retorno no preservan el contexto de trabajo

- **Pantalla o flujo:** Órdenes, sitios, proyectos, tareas, agendas y coordinación; vuelta desde detalles.
- **Usuario afectado:** manager, instalador y coordinador con listas extensas.
- **Problema:** filtros y búsquedas viven en `useState`; el enlace de vuelta apunta a una ruta fija. Al abrir un detalle y volver se pierden criterios y potencialmente posición.
- **Evidencia:** `components/company/orders-table.tsx:28-34`, `sites-table.tsx:19-23`, `agenda-table.tsx:35-42`, `components/installer/agenda-table.tsx:32-39`, `tasks-view.tsx:58-60`, `projects-view.tsx:50-51` y `coordination-board.tsx:53-57`. `components/shared/back-link.tsx:4-19` documenta el retorno fijo.
- **Consecuencia:** el usuario repite búsqueda/filtros luego de cada inspección, especialmente costoso con miles de puntos u órdenes.
- **Severidad:** **P1** — penaliza el ciclo dominante lista → detalle → lista.
- **Recomendación:** reflejar filtros, orden, vista y página en `searchParams`; conservar un `returnTo` seguro o construir el back link con la URL canónica filtrada; restaurar scroll/foco.
- **Criterio de aceptación:** recargar, compartir, abrir detalle y volver conserva exactamente filtros, vista, página y foco/posición razonable.
- **Prueba necesaria:** E2E por cada listado, historial atrás/adelante, deep link compartido y combinación de filtros.

### UX-010 — Errores de lectura se muestran como estados vacíos válidos

- **Pantalla o flujo:** Proyectos, Tareas, Ruta, Coordinación, Mensajes, Notificaciones y datos auxiliares de formularios.
- **Usuario afectado:** todos los roles autenticados.
- **Problema:** muchas consultas ignoran `error` y convierten `data ?? []` en un vacío normal.
- **Evidencia:** `app/(company)/projects/page.tsx:18-24` seguido de vacío en `:51-58`; `lib/data/tasks.ts:62-83`; `app/(installer)/route/page.tsx:55-84`; `app/(installer)/coordination/page.tsx:25-66`; `lib/data/notifications.ts:90-112`; `lib/data/messages.ts:28-36`; `lib/data/orders.ts:96-100` incluso corta paginación ante error y devuelve lo acumulado.
- **Consecuencia:** una caída, permiso o timeout parece “no hay datos”; se pueden tomar decisiones incorrectas, crear duplicados o no detectar una carga parcial.
- **Severidad:** **P1** — compromete confianza y exactitud operativa.
- **Recomendación:** devolver resultados tipados `success/error/partial`, mostrar error contextual con reintento y conservar datos previos cuando sea seguro; instrumentar observabilidad sin exponer detalles técnicos.
- **Criterio de aceptación:** vacío sólo se muestra tras una lectura exitosa de cero filas; error y parcial tienen mensajes y acciones diferentes; nunca se mezclan sin señal.
- **Prueba necesaria:** inyectar 401/403/500/timeout y fallo en páginas posteriores de paginación; validar copy, retry y no creación accidental.

### UX-011 — Parte del historial no es alcanzable

- **Pantalla o flujo:** `/notifications`, `/messages/[installerId]`.
- **Usuario afectado:** todos los usuarios de comunicación.
- **Problema:** Notificaciones consulta 51 elementos pero, si hay más de 50, sólo informa que existen sin control para acceder. Chat limita a 300 mensajes sin cursor ni carga anterior.
- **Evidencia:** `lib/data/notifications.ts:77-112` y `app/(inbox)/notifications/page.tsx:54-56`; `lib/data/messages.ts:102-110`.
- **Consecuencia:** alertas o decisiones antiguas quedan inaccesibles desde la interfaz; auditoría y recuperación de contexto son incompletas.
- **Severidad:** **P1** — oculta contenido existente y potencialmente crítico.
- **Recomendación:** cursor estable con “Cargar más”/scroll accesible y URL de página; en chat, anclar posición al insertar mensajes anteriores.
- **Criterio de aceptación:** todo ítem autorizado es alcanzable sin saltos ni duplicados; controles anuncian carga y fin del historial.
- **Prueba necesaria:** datasets >50 notificaciones y >300 mensajes, teclado/lector, concurrencia y preservación de scroll.

### UX-012 — Acciones irreversibles o de alto impacto no tienen prevención uniforme

- **Pantalla o flujo:** detalle de orden, equipo, invitaciones, notificaciones y administración master.
- **Usuario afectado:** manager y admin; secundariamente coordinador.
- **Problema:** cancelar una orden se ejecuta al pulsar un botón; reasignar/desasignar ocurre al cambiar el `<select>`; remover un miembro, cancelar una invitación, descartar una notificación o suspender una empresa son inmediatos. En cambio, coordinación sí confirma cancelación y el borrado de empresa exige escribir el nombre.
- **Evidencia:** `components/company/order-actions.tsx:65-85` y `:111-167`; `components/company/roster-table.tsx:30-46`; `pending-invitations.tsx:29-37`; `components/notifications/notification-inbox-list.tsx:131-163`; `components/master/companies-table.tsx:140-153`. Patrón positivo: `components/installer/coordination-order-actions.tsx:56-59` y `components/master/delete-company-dialog.tsx:65-86`.
- **Consecuencia:** cambios de estado, acceso o asignación pueden ocurrir por toque equivocado y algunos no tienen deshacer.
- **Severidad:** **P1** — riesgo de error humano con impacto operativo.
- **Recomendación:** matriz de acción por reversibilidad/impacto: confirmación contextual para cancelar, suspender, remover y reasignar trabajo activo; undo cuando sea realmente reversible; selector con botón Aplicar para asignación sensible.
- **Criterio de aceptación:** ninguna acción terminal o que quite acceso se ejecuta con un solo toque accidental; la confirmación nombra objeto, efecto y siguiente estado; las reversibles ofrecen undo o recuperación clara.
- **Prueba necesaria:** E2E de cancelar/reasignar/remover/suspender/descartar, doble click, navegación durante pending, fallo server y lector de pantalla.

### UX-013 — Formularios críticos no localizan errores ni protegen trabajo sin guardar

- **Pantalla o flujo:** crear/editar orden, crear órdenes masivas, proyecto/sitio, cuenta y seguridad.
- **Usuario afectado:** manager, invitado y usuarios que cambian credenciales.
- **Problema:** las acciones suelen devolver un único error global; no hay `aria-invalid`/`aria-describedby` por campo ni foco al primer error. En 26 archivos con formularios no aparece guard de cambios sin guardar. Cerrar diálogos largos limpia el estado.
- **Evidencia:** `components/company/create-order-dialog.tsx:62-65` y `:113-120`; `edit-order-dialog.tsx:71-89` y `:305-314`; `create-orders-dialog.tsx:66-74`; `components/shared/change-password-form.tsx:26-70`; `app/(auth)/reset-password/reset-password-form.tsx:34-68`. La búsqueda de `beforeunload|unsaved|dirty` en `app` y `components` no devuelve resultados.
- **Consecuencia:** el usuario no sabe qué corregir, repite envíos y puede perder una carga extensa al tocar overlay, Escape o Cancelar.
- **Severidad:** **P1** — afecta tareas de alta inversión y recuperación de errores.
- **Recomendación:** contrato de errores por campo, resumen al inicio, foco al primer inválido, ayuda asociada y confirmación al cerrar sólo si hay cambios; conservar borrador local cuando el costo lo justifique.
- **Criterio de aceptación:** cada error identifica el campo, explica cómo corregirlo y se anuncia; cerrar un formulario modificado pide confirmar; un fallo de red conserva datos/archivos cuando sea técnicamente seguro.
- **Prueba necesaria:** validación vacía/formato/rango/server/network; teclado y lector; cerrar por X, Escape, backdrop, back del navegador y reload.

### UX-014 — MFA obligatoria puede dejar al usuario sin salida

- **Pantalla o flujo:** `/two-factor/setup` y `/two-factor/verify`.
- **Usuario afectado:** `company_manager` y `platform_admin`.
- **Problema:** el layout sólo muestra el contenido de MFA. Cuando el enrolamiento es obligatorio se oculta Cancelar y no se ofrece cerrar sesión, cambiar de cuenta, ayuda o recuperación.
- **Evidencia:** `app/two-factor/layout.tsx:14-20`; `components/security/totp-enroll.tsx:114-122`.
- **Consecuencia:** ante QR inválido, pérdida del autenticador o sesión de cuenta equivocada, el usuario queda atrapado sin una salida explícita.
- **Severidad:** **P1** — bloquea acceso de los roles más críticos.
- **Recomendación:** mantener obligación de MFA, pero añadir cerrar sesión/cambiar cuenta, ayuda y flujo de recuperación administrado; explicar por qué se exige y qué ocurrirá después.
- **Criterio de aceptación:** el usuario nunca entra al producto sin AAL2, pero siempre puede salir de la sesión y encontrar una ruta de recuperación sin loop.
- **Prueba necesaria:** enrolamiento nuevo, código inválido/expirado, dispositivo perdido, cuenta equivocada, back/reload y logout.

### UX-015 — “Hoy” se calcula siempre en Argentina para usuarios de Brasil

- **Pantalla o flujo:** Inicio y Ruta del instalador.
- **Usuario afectado:** instaladores/coordinadores de empresas brasileñas.
- **Problema:** la fecha operativa usa `America/Argentina/Buenos_Aires` aunque el dominio ya contempla `America/Sao_Paulo` según país.
- **Evidencia:** `app/(installer)/home/page.tsx:40-47` y `app/(installer)/route/page.tsx:30-36`; patrón correcto existente en `lib/data/dashboard.ts:97` y `lib/domain/availability.ts:20`.
- **Consecuencia:** cerca de medianoche, Ruta, tareas del día, semana y “finalizadas hoy” pueden pertenecer al día equivocado.
- **Severidad:** **P1** — error de contenido operativo dependiente de región.
- **Recomendación:** resolver timezone desde la empresa/membresía activa; si el usuario trabaja para varias empresas, definir regla visible y consistente por orden o ubicación.
- **Criterio de aceptación:** “hoy” coincide con la zona de la operación y cambia correctamente en bordes de día/DST cuando aplique.
- **Prueba necesaria:** tests con reloj fijo en AR/BR, 23:30–00:30, usuario multiempresa y orden con fecha de cada país.

### UX-016 — La agenda de campo exige una tabla de 980 px en una app diseñada a 375 px

- **Pantalla o flujo:** `/schedule`; también `/agenda`, Órdenes y Sitios.
- **Usuario afectado:** principalmente instalador móvil; también manager en tablet/móvil.
- **Problema:** la agenda usa `min-w-[980px]` y scroll horizontal para seis columnas; Órdenes usa 940/1060 px y Sitios 860 px. La información prioritaria no se adapta ni se fija.
- **Evidencia:** `components/installer/agenda-table.tsx:159-178`, `components/company/agenda-table.tsx:170-189`, `orders-table.tsx:95-100`, `sites-table.tsx:77-89`. El propio `AGENTS.md:62` define el área instalador “a 375 px primero”.
- **Consecuencia:** en calle se ve una fracción de la fila, se requiere barrido horizontal y se pierde asociación entre fecha, sitio, estado y acción.
- **Severidad:** **P1** para Agenda instalador; **P2** para tablas de escritorio usadas ocasionalmente en móvil.
- **Recomendación:** en ≤767 px renderizar lista/tarjeta semántica con fecha, sitio, estado y CTA; dejar detalles secundarios expandibles. En desktop mantener tabla con primera columna sticky si aporta.
- **Criterio de aceptación:** a 320/375 px la tarea se entiende y abre sin scroll horizontal; texto y controles no se solapan; a 768–1920 px la tabla conserva densidad útil.
- **Prueba necesaria:** visual regression en seis breakpoints con textos ES/PT largos, zoom 200%, 1/50/1000 filas y touch.

## Findings P2

### UX-017 — Controles de búsqueda y filtros carecen de nombre accesible estable

- **Pantalla o flujo:** Órdenes, Sitios y agendas.
- **Usuario afectado:** usuarios de lector de pantalla, control por voz y dictado.
- **Problema:** búsquedas se identifican sólo por `placeholder` y varios `<select>` no tienen `<label>` ni `aria-label`.
- **Evidencia:** `components/company/orders-table.tsx:85-91`, `sites-table.tsx:69-74`, `agenda-table.tsx:119-163`, `components/installer/agenda-table.tsx:109-152`. Contraste positivo: Tareas sí incluye `aria-label` en `tasks-view.tsx:118-125`.
- **Consecuencia:** el propósito puede ser ambiguo o desaparecer cuando hay valor; los comandos de voz no tienen etiqueta visible consistente. Afecta WCAG 3.3.2 y 4.1.2.
- **Severidad:** **P2** — no bloquea mouse/touch, sí reduce accesibilidad y comprensión.
- **Recomendación:** label visible cuando haya espacio; `aria-label`/`aria-labelledby` como mínimo; agrupar filtros en `fieldset` y ofrecer “Limpiar filtros”.
- **Criterio de aceptación:** cada control tiene nombre único y visible/asociado; el lector anuncia tipo, nombre, valor y grupo.
- **Prueba necesaria:** axe, Accessibility Tree, Dragon/Voice Control y teclado.

### UX-018 — Todas las rutas comparten el título “Se Instala”

- **Pantalla o flujo:** toda la aplicación.
- **Usuario afectado:** todos, especialmente quienes usan múltiples pestañas o lectores.
- **Problema:** sólo el root genera metadata y ninguna página define título específico.
- **Evidencia:** `app/layout.tsx:20-37`; búsqueda de `generateMetadata|export const metadata` sólo encuentra ese archivo. En navegador, portada, login y recuperación reportaron el mismo título.
- **Consecuencia:** pestañas, historial y anuncios de lector no distinguen la ubicación. Afecta WCAG 2.4.2.
- **Severidad:** **P2**.
- **Recomendación:** template `Se Instala · {pantalla}` y metadata por layout/página, localizada.
- **Criterio de aceptación:** cada ruta primaria y detalle tiene título único, útil y actualizado tras navegación.
- **Prueba necesaria:** unit/snapshot de metadata ES/PT y recorrido con lector/pestañas.

### UX-019 — La galería oculta acciones en touch y ofrece enlaces de foto sin nombre

- **Pantalla o flujo:** galería de sitio.
- **Usuario afectado:** manager en touch y lector de pantalla.
- **Problema:** la imagen dentro del enlace tiene `alt=""`; el enlace queda sin nombre. Borrar es `opacity-0` y sólo aparece con hover/focus.
- **Evidencia:** `components/company/site-gallery.tsx:71-103`.
- **Consecuencia:** el destino no se identifica por voz/lector y la eliminación es indescubrible en dispositivos sin hover.
- **Severidad:** **P2**.
- **Recomendación:** nombrar el enlace con orden/nota/fecha; mostrar acciones en coarse pointer y conservar revelado por hover sólo en desktop; mantener confirmación.
- **Criterio de aceptación:** cada foto anuncia propósito único y Borrar es visible antes de tocar en mobile.
- **Prueba necesaria:** VoiceOver iOS, TalkBack, touch sin hover y teclado.

### UX-020 — Obligatorios y cambios asíncronos no siempre se comunican

- **Pantalla o flujo:** formularios de orden/importación/alta y controles asíncronos.
- **Usuario afectado:** todos; mayor impacto cognitivo y lector de pantalla.
- **Problema:** muchos campos usan `required` sin indicación visible de obligatorio. En importación, “analizando”, resultado y error cambian dinámicamente sin región live; algunos errores sólo aparecen en toast.
- **Evidencia:** `components/company/create-orders-dialog.tsx:114-124` y `:207-210`; `edit-order-dialog.tsx:104-114` y `:278-309`; `import-sites-dialog.tsx:249-254`.
- **Consecuencia:** el usuario descubre requisitos recién al enviar y puede no enterarse de cambios de estado. Afecta WCAG 3.3.2 y 4.1.3.
- **Severidad:** **P2**.
- **Recomendación:** leyenda de obligatorios, marcador textual consistente, ayuda antes del envío y `role=status`/`aria-live` para progreso/resultado.
- **Criterio de aceptación:** antes de enviar se distinguen obligatorios; todo cambio asíncrono importante se anuncia una vez sin mover foco innecesariamente.
- **Prueba necesaria:** lector de pantalla, latencia simulada, error de importación y envío repetido.

### UX-021 — La redirección de login conserva la ruta pero no su query contextual

- **Pantalla o flujo:** deep link protegido → login → retorno.
- **Usuario afectado:** cualquier rol que abre un enlace filtrado o notificación con query.
- **Problema:** el proxy copia el query original en la URL de login, pero `next` contiene sólo el pathname. El formulario usa `next`, por lo que los filtros no vuelven al destino.
- **Evidencia:** prueba local `/orders?status=en_proceso&zone=norte` → `/login?status=en_proceso&zone=norte&next=%2Forders`; `proxy.ts:98-104` construye `next` desde `pathname`; `app/(auth)/login/login-form.tsx:26-28` consume sólo `next`.
- **Consecuencia:** tras autenticarse se pierde el contexto que motivó el acceso.
- **Severidad:** **P2**.
- **Recomendación:** serializar pathname + query en un `next` validado contra origen/rutas internas; mostrar “tu sesión venció” cuando corresponda.
- **Criterio de aceptación:** login retorna a la URL completa segura y nunca permite open redirect.
- **Prueba necesaria:** query múltiple/codificado, hash cuando aplique, sesión vencida y payload de open redirect.

### UX-022 — Fechas del listado de tareas no están localizadas

- **Pantalla o flujo:** `/tasks` en vista lista y tarjetas.
- **Usuario afectado:** instalador ES/PT.
- **Problema:** se muestra `scheduled_date` crudo (`YYYY-MM-DD`) o, si falta, el número de orden en el mismo slot sin etiqueta.
- **Evidencia:** `components/installer/tasks-view.tsx:233-266`.
- **Consecuencia:** formato menos escaneable, semántica ambigua y experiencia inconsistente con otras páginas que usan `next-intl`.
- **Severidad:** **P2**.
- **Recomendación:** formatear por locale y etiquetar explícitamente Fecha/N.º de orden; no usar campos distintos como fallback visual indistinguible.
- **Criterio de aceptación:** fechas siguen locale y zona operativa; un valor ausente se expresa como tal y el número conserva su etiqueta.
- **Prueba necesaria:** snapshots ES/PT, fecha nula y bordes de zona horaria.

### UX-023 — Detalles profundos no muestran jerarquía ni origen

- **Pantalla o flujo:** Proyecto → Sitio, Cliente, Orden, Equipo, Locación y Coordinación.
- **Usuario afectado:** manager y coordinador.
- **Problema:** se ofrece un único “Volver” fijo, aun cuando la orden puede abrirse desde dashboard, agenda, proyecto o notificación. No hay breadcrumb ni indicador persistente de proyecto/cliente/empresa en la cabecera.
- **Evidencia:** contrato de `components/shared/back-link.tsx:4-19`; rutas anidadas del inventario.
- **Consecuencia:** el usuario pierde orientación y debe reconstruir su recorrido, especialmente en multiempresa.
- **Severidad:** **P2**.
- **Recomendación:** breadcrumb corto en desktop y etiqueta contextual en mobile; conservar `returnTo` seguro para la tarea inmediata, manteniendo enlace canónico al listado.
- **Criterio de aceptación:** en todo detalle el usuario puede decir qué empresa/proyecto/objeto ve y volver al contexto exacto o a su padre canónico.
- **Prueba necesaria:** entrada desde cada origen, deep link directo, mobile y lector de pantalla.

### UX-024 — Los targets base son pequeños para uso de campo

- **Pantalla o flujo:** toda la aplicación, con foco en filtros, icon buttons, navegación y acciones de orden.
- **Usuario afectado:** instalador móvil, personas con limitación motriz o uso con guantes.
- **Problema:** el sistema define botones de 24, 28 y 32 px, default de 32 px y navegación de 40 px; chips usan padding reducido.
- **Evidencia:** `components/ui/button.tsx:23-35`, `components/shared/filter-chip.tsx:22-34`, `components/shared/sidebar-nav.tsx:65-83`.
- **Consecuencia:** mayor tasa de toque erróneo en movimiento o exterior. Algunos targets de 24 px cumplen el mínimo AA sólo si el espaciado también cumple, pero quedan lejos de la recomendación táctil de 44–48 px.
- **Severidad:** **P2** — ergonomía transversal; verificar casos puntuales contra WCAG 2.5.8.
- **Recomendación:** variante `field` ≥48 px; mínimo práctico 44 px para acciones móviles; conservar densidad compacta sólo en desktop y con separación suficiente.
- **Criterio de aceptación:** acciones primarias de campo ≥48 px; controles móviles ≥44 px o excepción documentada/espaciada; sin taps ambiguos.
- **Prueba necesaria:** auditoría de rectángulos a 320/375, prueba touch y WCAG 2.5.8 automatizada/manual.

### UX-025 — El enlace social de cliente se valida recién al usarlo

- **Pantalla o flujo:** crear/editar y detalle de cliente.
- **Usuario afectado:** manager.
- **Problema:** texto arbitrario se transforma en enlace externo agregando `https://` si falta, sin validación/normalización previa ni preview.
- **Evidencia:** `app/(company)/clients/[id]/page.tsx:86-109`.
- **Consecuencia:** errores tipográficos o valores que no son URL producen enlaces rotos y sólo se descubren después de guardar.
- **Severidad:** **P2**.
- **Recomendación:** aceptar formatos previstos, normalizar dominio/esquema, validar inline y mostrar preview editable; si el dato puede ser un usuario social, separar plataforma y handle.
- **Criterio de aceptación:** valores inválidos no se guardan como links accionables; el usuario ve el destino normalizado antes de confirmar.
- **Prueba necesaria:** URLs con/sin esquema, handles, espacios, Unicode, protocolos no permitidos y PT/ES.

## Findings P3

### UX-026 — `transition-all` amplía movimiento y costo sin necesidad

- **Pantalla o flujo:** componentes base Button/Badge y tarjetas.
- **Usuario afectado:** transversal; sensibilidad al movimiento y dispositivos modestos.
- **Problema:** componentes base animan “todo”, aunque sólo cambian color/borde/transform.
- **Evidencia:** `components/ui/button.tsx:7-8`, `components/ui/badge.tsx:7-8`; el reduced motion global sólo desactiva `.animate-fade-in-up` en `app/globals.css:165-184`.
- **Consecuencia:** transiciones imprevistas y mantenimiento más difícil; riesgo menor hoy.
- **Severidad:** **P3**.
- **Recomendación:** enumerar propiedades (`color`, `background-color`, `border-color`, `opacity`, `transform`) y extender reduced motion a utilidades interactivas relevantes.
- **Criterio de aceptación:** ninguna propiedad de layout se anima accidentalmente; reduced motion conserva feedback sin desplazamiento.
- **Prueba necesaria:** snapshot de CSS, emulación `prefers-reduced-motion` y performance trace básico.

### UX-027 — Perfil móvil concentra demasiadas decisiones en una sola página

- **Pantalla o flujo:** `/profile`.
- **Usuario afectado:** instalador.
- **Problema:** identidad, reputación, cobertura, base, disponibilidad, ausencias, seguridad y reseñas comparten una página extensa. Es una observación heurística; falta medir uso real.
- **Evidencia:** composición de `app/(installer)/profile/page.tsx` y componentes de perfil/availability; la ruta es parte de una navegación móvil ya extensa.
- **Consecuencia:** encontrar una opción poco frecuente exige scroll y escaneo; el riesgo es moderado-bajo porque no bloquea ejecución.
- **Severidad:** **P3**.
- **Recomendación:** primero instrumentar/entrevistar; si se confirma, mantener una sola ruta pero agregar índice sticky/acordeones accesibles o separar “Perfil” de “Disponibilidad”, sin alterar estética.
- **Criterio de aceptación:** una prueba de búsqueda encuentra base, zonas, ausencia y seguridad en ≤15 s con 80% de éxito.
- **Prueba necesaria:** tree test y prueba moderada con 5–8 instaladores antes de dividir navegación.

### UX-028 — Estados vacíos de comunicación no proponen el siguiente paso

- **Pantalla o flujo:** `/messages` y algunos vacíos de listas.
- **Usuario afectado:** manager e instalador nuevo.
- **Problema:** cuando no hay conversaciones sólo se muestra texto; no hay explicación de cómo se crea un hilo ni CTA contextual. Es una hipótesis porque el negocio puede crear hilos automáticamente.
- **Evidencia:** `app/(messaging)/messages/page.tsx:22-29`.
- **Consecuencia:** el usuario no sabe si debe esperar, invitar/abrir un miembro o si falta permiso.
- **Severidad:** **P3**.
- **Recomendación:** aclarar el mecanismo y ofrecer el siguiente paso permitido por rol; no inventar “nuevo chat” si el modelo no lo admite.
- **Criterio de aceptación:** el vacío responde qué ocurrió, qué puede hacer y por qué quizá no puede iniciar conversación.
- **Prueba necesaria:** validar regla de creación de hilos con producto y test de comprensión de primer uso.

## Fortalezas que conviene preservar

- La separación por rol y el control de acceso son comprensibles en la arquitectura actual.
- Login usa labels reales, tipos/autocomplete correctos, visibilidad de contraseña, `aria-invalid`, `aria-describedby` y `role=alert`.
- La importación de locaciones tiene preflight, conteos, diferencias, detalle de filas omitidas y reporte descargable: es el patrón de prevención más maduro del producto.
- El borrado de empresa exige coincidencia exacta del nombre; roles de miembro y cancelación desde coordinación ya piden confirmación.
- Skeletons de área, error boundary con Reintentar y 404 localizada cubren los estados globales básicos.
- Severidad de notificaciones combina palabra, icono y color; no depende sólo del color.
- Las animaciones propias de portada/login/invitación y `fade-in-up` contemplan `prefers-reduced-motion`.
- Notificaciones, Comunicados, Finanzas y algunos detalles ya usan URL para filtros o contexto; deben servir como referencia para el resto.
- La cola usa IDs de cliente e idempotencia; es una base técnica adecuada para completar la experiencia offline.

## Matriz de estados faltantes

**Leyenda:** ✅ cubierto; ◐ parcial/inconsistente; ❌ ausente; — no aplica. “Error” significa error de datos contextual, no sólo el boundary global.

| Superficie | Loading | Vacío | Error contextual | Parcial/stale | Permiso/rol | Offline | Recuperación recomendada |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| Portada y acceso | ✅ | — | ✅ | — | ◐ | — | Explicar sesión vencida/bloqueada y conservar URL completa |
| Invitación | ◐ | — | ✅ | — | ✅ | — | Foco al campo; reenviar/contactar ante token inválido |
| MFA | ◐ | — | ✅ | — | ✅ | — | Logout, cambio de cuenta y recuperación (UX-014) |
| Dashboard empresa | ✅ | ◐ | ❌ | ❌ | ✅ | ❌ | Estado por widget, retry y “actualizado hace…” |
| Proyectos | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | Separar fallo de vacío; conservar filtros |
| Proyecto / sitios | ✅ | ✅ | ◐ | ❌ | ✅ | ❌ | Error por dataset; retry sin perder formulario/importación |
| Órdenes | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | Error/partial tipado; retry y mantener resultados previos |
| Detalle / edición de orden | ✅ | — | ◐ | ❌ | ✅ | ❌ | Error por campo, dirty guard, conflicto de versión |
| Agenda empresa | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | Error contextual y filtros persistentes |
| Clientes / equipo | ✅ | ✅ | ◐ | ❌ | ✅ | ❌ | Diferenciar sin datos/sin permiso/error; undo contextual |
| Finanzas | ✅ | ✅ | ◐ | ❌ | ✅ | ❌ | Error por panel y confirmación de acciones financieras |
| Mensajes | ◐ | ✅ | ❌ | ❌ | ✅ | ◐ | Reintento, estado de envío/failed y acceso a historial |
| Notificaciones | ◐ | ✅ | ❌ | ❌ | ✅ | ❌ | Cargar más, retry y undo de descarte |
| Inicio instalador | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | Snapshot por identidad, stale timestamp y trabajo activo |
| Tareas | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | Lista cacheada, error/partial y filtros persistentes |
| Detalle de tarea | ✅ | — | ◐ | ◐ | ✅ | ◐ | Snapshot, reconciliación y bandeja de conflictos |
| Ruta | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | Ruta cacheada o límites claros; retry y timezone correcto |
| Coordinación | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | Error por proyectos/órdenes y contexto de empresa |
| Perfil / disponibilidad | ✅ | — | ◐ | ❌ | ✅ | ❌ | Errores inline y confirmación de cambios sin guardar |
| Master | ✅ | ✅ | ◐ | ❌ | ✅ | — | Retry por widget/tabla; confirmación proporcional |

### Estados mínimos comunes

Cada lectura relevante debe resolver una de estas variantes, mutuamente excluyentes:

1. **Loading inicial:** skeleton que representa la estructura real y tiene nombre accesible cuando la espera sea prolongada.
2. **Refreshing:** conservar contenido y señalar actualización sin reemplazarlo por skeleton.
3. **Success:** datos completos y timestamp si pueden quedar obsoletos.
4. **Empty:** lectura exitosa sin filas, explicación y siguiente acción permitida.
5. **No results:** filtros activos sin coincidencias, con “Limpiar filtros”; nunca confundir con empty.
6. **Partial:** conservar lo recuperado, advertir qué falta y permitir reintento.
7. **Error:** mensaje humano, alcance del fallo y Reintentar; detalles técnicos sólo en observabilidad.
8. **Permission:** explicar que la cuenta no tiene acceso y ofrecer destino seguro.
9. **Offline fresh/stale:** contenido cacheado con hora de actualización y límites de edición.
10. **Pending sync / blocked:** acción en cola, sincronizando o requiere intervención; no usar un contador único.

## Accesibilidad práctica WCAG 2.2 AA

| Criterio | Estado | Evidencia / acción prioritaria |
|---|---|---|
| 1.1.1 Alternativas de texto | ◐ | Galería tiene enlaces de imagen sin nombre; nombrar por orden/fecha/nota (UX-019) |
| 1.3.1 Información y relaciones | ❌ | Grids visuales no expresan relación encabezado–celda (UX-004) |
| 1.4.3 Contraste mínimo | ❌ | Tokens primario, muted y warning fallan para texto normal (UX-007) |
| 1.4.4 Redimensionar texto | ❌ | `maximumScale: 1` impide zoom (UX-006) |
| 1.4.10 Reflow | ◐ | Público aprobado; agendas/tablas autenticadas usan 860–1060 px mínimos (UX-016) |
| 1.4.11 Contraste no textual | ◐ | Borde de input ≈1.18:1 sobre blanco; revisar estados de control (UX-007) |
| 2.1.1 Teclado | ❌ | Filas centrales sólo responden a click (UX-004) |
| 2.4.1 Evitar bloques | ❌ | No hay skip link en shell (UX-005) |
| 2.4.2 Título de página | ❌ | Todas las rutas usan “Se Instala” (UX-018) |
| 2.4.3 Orden de foco | ❌ | Drawer cerrado mantiene enlaces enfocables; sin gestión al abrir/cerrar (UX-005) |
| 2.4.7 Foco visible | ◐ | Componentes base tienen ring; falta validar custom rows/links y alto contraste |
| 2.4.11 Foco no oculto | ◐ | Header sticky + drawer requieren prueba manual; drawer puede ocultar contexto |
| 2.5.8 Tamaño mínimo de target | ◐ | Variantes desde 24 px; revisar espaciado caso a caso (UX-024) |
| 3.2.3 Navegación consistente | ❌ | Ítems desaparecen en Mensajes/Notificaciones (UX-008) |
| 3.3.1–3 Identificación/sugerencia de error | ◐ | Login bien; formularios largos sólo muestran error global (UX-013) |
| 3.3.2 Labels/instrucciones | ❌ | Filtros sin nombre y obligatorios no comunicados (UX-017, UX-020) |
| 3.3.4 Prevención de errores | ◐ | Borrado de empresa bien; cancelar/reasignar/remover no es uniforme (UX-012) |
| 4.1.2 Nombre, función, valor | ❌ | Filas y algunos filtros no exponen semántica suficiente (UX-004, UX-017) |
| 4.1.3 Mensajes de estado | ◐ | Hay `role=status` en sync y alerts en formularios; importación/conflictos incompletos (UX-003, UX-020) |

La tabla es una auditoría práctica del código y recorridos disponibles, no una certificación. Para declarar conformidad se necesita test manual con tecnología asistiva y cuentas por rol.

## Quick wins

Cambios de bajo costo relativo que reducen riesgo sin rediseñar:

1. Incluir `en_camino` y `en_sitio` en la fuente compartida de órdenes activas y en Ruta.
2. Quitar `maximumScale: 1` y asegurar inputs móviles de 16 px.
3. Agregar `label`/`aria-label` a búsquedas y selects; `aria-live` a importación.
4. Añadir metadata localizada por página y skip link al shell.
5. Confirmar cancelación de orden, suspensión de empresa, remoción de miembro y cancelación de invitación; agregar undo al descarte si el dominio lo permite.
6. Localizar fechas de Tareas y resolver timezone desde empresa/membresía.
7. Mostrar botón “Cargar más” en Notificaciones y cursor de historial en Chat.
8. Hacer visible Borrar galería en `pointer: coarse` y nombrar cada enlace de foto.
9. Reemplazar `transition-all` por propiedades concretas.
10. Ajustar primero los tokens de contraste, con regresión visual para evitar cambios estéticos no intencionados.

## Cambios estructurales recomendados

1. **Modelo de datos UI explícito:** loaders devuelven `success | empty | partial | error`, no arrays vacíos ambiguos.
2. **Fuente única de navegación:** función por audiencia/capacidades compartida por company, installer, inbox y messaging.
3. **Estado de listado en URL:** query, filtros, sort, vista, cursor y retorno canónico; restauración de scroll/foco.
4. **Patrón semántico responsive de colecciones:** tabla accesible en desktop, lista/tarjeta en mobile, ambos desde el mismo modelo.
5. **Offline por identidad:** snapshots mínimos, sello de actualización, estados pending/failed y centro de resolución de conflictos.
6. **Contrato de formularios:** errores por campo + resumen + foco + dirty guard + preservación segura de archivos/draft.
7. **Matriz de acciones sensibles:** confirmación/undo/razón/reautenticación según impacto y reversibilidad.
8. **Metadatos y contexto:** títulos localizados, breadcrumb/parent context y retorno seguro.

## Propuesta de navegación

La propuesta no cambia identidad visual; ordena la arquitectura y elimina duplicación.

### Empresa

- **Operación:** Inicio, Agenda, Órdenes.
- **Portafolio:** Proyectos, Clientes; Revisión de locaciones aparece como badge/cola contextual, no como ítem que altera el orden del menú.
- **Equipo y comunicación:** Equipo, Mensajes, Comunicados.
- **Administración:** Finanzas, Configuración.

En desktop se mantienen grupos en el sidebar. En móvil, el drawer muestra exactamente los mismos ítems y orden. Los detalles incorporan `Empresa / Proyecto / Objeto` como breadcrumb corto.

### Instalador / coordinador

- **Acceso frecuente móvil:** Inicio, Tareas, Ruta, Agenda y Más.
- **Más:** Trabajos, Ingresos, Mensajes, Perfil.
- **Coordinación:** aparece como destino destacado sólo cuando la membresía lo habilita, con empresa activa visible. Si los datos muestran uso diario superior a Agenda o Ruta, se intercambia mediante validación, no por intuición.

En desktop los mismos destinos viven en el sidebar. Una barra inferior móvil de cinco destinos es una hipótesis de mejora: requiere prueba con instaladores antes de implementación.

### Plataforma

- Resumen y Empresas permanecen como destinos principales.
- Acciones sensibles se mantienen dentro del contexto de la empresa seleccionada, no en el nav global.

### Reglas comunes

- Un único generador recibe `audience`, roles de membresía, flags y contadores.
- Mensajes y Notificaciones no reconstruyen el nav.
- La empresa/proyecto activo se anuncia en cabecera y en el título de página.
- Filtros y retorno viven en URL; breadcrumbs apuntan al padre canónico.
- Badges dinámicos no mueven el orden ni hacen desaparecer destinos conocidos.

## Plan de implementación por pantalla

| Orden | Pantalla / módulo | Cambio de experiencia | Dependencias | Validación de salida |
|---:|---|---|---|---|
| 1 | Inicio, Ruta y Tareas instalador | Unificar estados activos, timezone y CTA siguiente | Dominio de estados y empresa/membresía activa | E2E de ciclo completo AR/BR |
| 2 | Shell global | Drawer accesible, skip link, zoom, tokens de contraste y targets field | Design tokens + navegación | axe, teclado, VoiceOver/NVDA, seis breakpoints |
| 3 | Offline de Tarea/Chat | Snapshots, last-sync, pending/blocked y bandeja de conflictos | Dexie, SW, sync actions, aislamiento por usuario | Reabrir/navegar offline y resolver conflictos |
| 4 | Órdenes | Tabla semántica/mobile list, filtros URL, retorno y acciones seguras | Patrón de colección + search params | 1/50/1000+ filas, teclado y E2E lista-detalle |
| 5 | Agenda empresa/instalador | Lista mobile, tabla desktop, labels y filtros URL | Mismo patrón de colección | 320–1920, ES/PT, zoom, teclado |
| 6 | Proyecto/Sitios | Tabla semántica, contexto, filtros URL, estados de error/partial | Loader tipado + breadcrumb | Importación, error por lote y back context |
| 7 | Crear/editar órdenes y entidades | Errores por campo, required visible, dirty guard, resumen de impacto | Contrato de Server Actions | Errores client/server/network y cierre accidental |
| 8 | Mensajes/Notificaciones | Nav consistente, paginación/cursor, estados failed y undo | Fuente nav + data pagination | >300 mensajes, >50 alertas, scroll/foco |
| 9 | MFA y acceso | Salida/recuperación, metadata y `next` completo seguro | Auth/proxy | Cuenta equivocada, sesión vencida, open redirect |
| 10 | Clientes/Equipo | URL social, acción Apply/confirmación, estados de permisos | Matriz de acciones sensibles | Cambio de rol/remoción/reasignación/fallo |
| 11 | Galería de sitio | Nombres accesibles y acciones visibles en touch | Sin dependencia estructural | VoiceOver/TalkBack/touch |
| 12 | Dashboard/Finanzas/Master | Error/partial por widget, stale timestamp, confirmación de suspensión | Loader tipado | Fallos parciales y recuperación |
| 13 | Perfil | Medir findability; sólo después decidir índice/acordeón/separación | Analítica/entrevistas | Tree test y tareas moderadas |

## Archivos o módulos probablemente afectados

Esta lista es una guía para estimar; no implica que todos deban cambiar en la primera fase.

### Fundaciones

- `app/layout.tsx`
- `app/globals.css`
- `components/ui/button.tsx`
- `components/ui/input.tsx`
- `components/ui/select.tsx`
- `components/shared/app-shell-frame.tsx`
- `components/shared/sidebar-nav.tsx`
- `components/shared/back-link.tsx`
- nuevo módulo compartido de definición de navegación
- layouts de `app/(company)`, `app/(installer)`, `app/(messaging)` y `app/(inbox)`

### Campo y offline

- `lib/data/installer-home.ts`
- `app/(installer)/home/page.tsx`
- `app/(installer)/route/page.tsx`
- `app/(installer)/tasks/page.tsx`
- `components/installer/tasks-view.tsx`
- `components/installer/task-actions.tsx`
- `components/installer/agenda-table.tsx`
- `components/installer/sync-indicator.tsx`
- `lib/offline/db.ts`
- `lib/offline/sync.ts`
- `lib/offline/use-sync.ts`
- `lib/offline/session-storage.ts`
- `public/sw.js`
- nuevo componente de conflictos/snapshots offline

### Empresa y colecciones

- `components/company/orders-table.tsx`
- `components/company/sites-table.tsx`
- `components/company/agenda-table.tsx`
- `components/company/projects-view.tsx`
- `components/installer/coordination-board.tsx`
- `lib/data/orders.ts`
- loaders de proyectos, sitios, agenda, coordinación, clientes, equipo, finanzas y dashboard
- `components/company/order-actions.tsx`
- `components/company/roster-table.tsx`
- `components/company/pending-invitations.tsx`
- `components/master/companies-table.tsx`

### Formularios, acceso y media

- `components/company/create-order-dialog.tsx`
- `components/company/create-orders-dialog.tsx`
- `components/company/edit-order-dialog.tsx`
- `components/company/import-sites-dialog.tsx`
- formularios de proyecto, sitio, cliente, equipo y perfil
- `components/shared/change-password-form.tsx`
- `app/(auth)/**`
- `app/two-factor/**`
- `components/security/totp-enroll.tsx`
- `proxy.ts`
- `components/company/site-gallery.tsx`

### Comunicación y paginación

- `app/(inbox)/notifications/page.tsx`
- `components/notifications/notification-inbox-list.tsx`
- `lib/data/notifications.ts`
- `app/(messaging)/messages/**`
- `components/messages/**`
- `lib/data/messages.ts`

### Metadata y pruebas

- layouts/pages de cada área para metadata localizada
- `messages/es.json` y `messages/pt.json`
- tests de dominio de estados/timezone
- tests de componentes accesibles
- suites E2E por rol y offline

## Plan de validación

### Dispositivos y tamaños

- 320×568 y 375×812: móvil compacto/objetivo de campo.
- 768×1024: tablet portrait.
- 1024×768: tablet landscape / laptop pequeño.
- 1366×768: desktop estándar.
- 1920×1080: desktop amplio.
- En cada uno: ES/PT, texto al 200%, zoom/pinch, contenido largo, estados 0/1/muchos y orientación portrait/landscape cuando aplique.

### Tecnología asistiva e interacción

- Sólo teclado: Tab/Shift+Tab, Enter, Space, Escape, flechas cuando el patrón las requiera.
- NVDA + Chrome/Firefox en Windows.
- VoiceOver + Safari en iOS y macOS; TalkBack + Chrome Android para campo.
- Voice Control/dictado para comprobar coincidencia entre etiqueta visible y nombre accesible.
- `prefers-reduced-motion`, alto contraste/forced colors y foco no oculto por header/drawer.

### Datos y fallos

- Cuentas de prueba separadas: admin, manager, instalador, coordinador puro y coordinador+instalador.
- Empresas AR/BR y usuario con múltiples membresías.
- 0, 1, 50, 300, 1000 y 2000 elementos según la superficie.
- 401, 403, 409, 422, 500, timeout, caída de una consulta secundaria y paginación parcial.
- Offline antes/después de cargar, cierre/reapertura, cambio de cuenta, archivo grande y conflicto de transición.
- Doble click/toque, back/reload durante pending y acción completada después de navegar.

## Criterio de salida por fase

1. **Fase de riesgo operativo:** UX-001 a UX-003, UX-010, UX-012, UX-014 y UX-015 cerrados con E2E.
2. **Fase WCAG/navegación:** UX-004 a UX-008, UX-016 a UX-020 y UX-024 cerrados con test manual asistivo.
3. **Fase eficiencia/contexto:** UX-009, UX-011, UX-021 a UX-023 y UX-025 cerrados con pruebas de volumen.
4. **Fase de pulido:** UX-026 a UX-028 sólo después de validar impacto.

## Decisión solicitada

La recomendación es aprobar primero la **Fase de riesgo operativo** y luego la **Fase WCAG/navegación**. Hasta recibir aprobación no debe modificarse código de producto ni iniciarse un rediseño visual.
