# Requisitos funcionales y no funcionales

Estado: propuesta  
Convención: “debe” expresa comportamiento obligatorio; “podría” expresa evolución fuera del MVP  
Trazabilidad: cada requisito se asigna a un release y a tareas en [tasks.md](./tasks.md)

## Actores

- **Administrador de plataforma:** administra empresas; no participa de la operación tenant.
- **Manager de empresa:** administra su empresa, clientes, proyectos, oportunidades, equipo y finanzas.
- **Coordinador:** opera sólo los proyectos/oportunidades que tiene asignados y las capacidades que se le otorguen.
- **Instalador:** opera sus asignaciones, agenda, cotizaciones, evidencias e información financiera propia.
- **Usuario dual:** posee simultáneamente capacidades de coordinador e instalador dentro de una misma empresa.
- **Cliente final:** persona externa sin autenticación ni acceso directo en este alcance.
- **Sistema:** procesos transaccionales, scheduler, sincronizador offline y fan-out de notificaciones.

## Glosario de dominio

- **Locación:** establecimiento físico canónico de un cliente, reutilizable entre proyectos.
- **Proyecto:** iniciativa confirmada por el cliente y gestionada por una empresa.
- **OT:** contenedor operativo/comercial de uno o más trabajos en una locación.
- **Actividad:** unidad ejecutable de una OT; inicialmente `relevamiento` o `ejecución`.
- **Asignación:** compromiso versionado entre una actividad y un instalador, con agenda y condiciones acordadas.
- **Oportunidad:** necesidad publicada antes de que exista un proyecto confirmado.
- **Cotización:** propuesta versionada de un instalador para una oportunidad.
- **Evento de campo:** hecho append-only producido durante la ejecución.
- **Reputación:** calidad/experiencia profesional derivada del trabajo realizado.
- **Confiabilidad:** cumplimiento de compromisos, cancelaciones y respuestas a reprogramaciones.

## REQ-01 — Operación offline y sincronización

### Reglas

- **REQ-01.1:** Una OT sincronizada previamente debe poder abrirse y operarse sin conexión, incluso después de cerrar y reabrir la PWA.
- **REQ-01.2:** Aceptación, eventos de campo, checklist, incidentes, observaciones, evidencias y solicitudes de transición deben usar comandos idempotentes con un ID generado en cliente.
- **REQ-01.3:** El servidor debe validar y persistir de forma atómica el evento, la transición y su auditoría; el cliente offline no debe actualizar directamente el estado final de la OT.
- **REQ-01.4:** La bandeja de sincronización debe mostrar cada elemento como pendiente, subiendo, en conflicto, fallido o sincronizado, con motivo y acciones seguras de reintento/cancelación.
- **REQ-01.5:** La cola debe respetar dependencias causales; una finalización no puede sincronizarse antes que su evidencia obligatoria.
- **REQ-01.6:** Las fotos deben comprimirse según una política documentada y soportar reanudación o reinicio controlado sin duplicados.
- **REQ-01.7:** El usuario debe poder elegir si las cargas pesadas usan cualquier red o sólo Wi‑Fi, mostrando qué queda pendiente por esa preferencia.
- **REQ-01.8:** Cache Storage e IndexedDB deben estar particionados por usuario; logout, cambio de cuenta o revocación deben impedir la lectura cruzada y aplicar la política de purga/retención.
- **REQ-01.9:** Los conflictos deben resolverse con una política explícita basada en versión esperada; nunca con “última escritura gana” silenciosa para estados operativos.

### Criterios de aceptación

- **AC-01-A:** Dada una OT sincronizada, cuando el instalador activa modo avión, reinicia la PWA, acepta la tarea, completa checklist, agrega tres fotos y solicita finalización, entonces ve todos los elementos pendientes y puede seguir consultando la OT.
- **AC-01-B:** Dado que la red vuelve y una foto falla a mitad de carga, cuando se reintenta, entonces no se duplica el archivo ni se adelanta la finalización.
- **AC-01-C:** Dado un evento ya confirmado, cuando el mismo `client_event_id` se reenvía, entonces el servidor devuelve el resultado original sin duplicar evento, notificación ni movimiento financiero.
- **AC-01-D:** Dado un dispositivo compartido, cuando A cierra sesión y B ingresa, entonces B no puede abrir ni inferir tareas, mensajes o fotos de A.

## REQ-02 — Finanzas de empresa e instalador

### Reglas

- **REQ-02.1:** El sistema debe separar monto facturable al cliente, honorario acordado al instalador, otros gastos, devengamiento y pago.
- **REQ-02.2:** Marcar una OT finalizada o aprobada no debe significar que fue cobrada o pagada.
- **REQ-02.3:** El instalador debe ver en un módulo privado sus honorarios y pagos de todas las empresas, con filtros por empresa, período, OT, servicio y estado de pago.
- **REQ-02.4:** Una empresa debe ver sólo sus ingresos, costos de instaladores, gastos y rentabilidad por proyecto/OT, incluyendo presupuesto versus real.
- **REQ-02.5:** Los movimientos deben conservar moneda, origen, actor y fecha; pagos parciales, ajustes y reversas deben agregarse como eventos, no sobrescribir historia.
- **REQ-02.6:** El importe acordado en una cotización/asignación debe quedar versionado y no cambiar retroactivamente si se edita la oportunidad.
- **REQ-02.7:** Un coordinador no tendrá acceso financiero salvo permiso explícito definido en otro alcance.
- **REQ-02.8:** No se hará conversión automática entre ARS, BRL u otras monedas; los totales de monedas distintas deben presentarse separados.

### Criterios de aceptación

- **AC-02-A:** Dado un instalador que trabaja para A y B, cuando abre Finanzas, entonces ve únicamente sus propios créditos/pagos de ambas empresas, sin datos económicos de otros instaladores.
- **AC-02-B:** Dado un manager de A, cuando consulta rentabilidad, entonces ve ingresos, costos y gastos de A y obtiene cero filas de B incluso manipulando filtros o URLs.
- **AC-02-C:** Dado un honorario de 100 con dos pagos de 40 y un ajuste reversible de 10, entonces el saldo y la historia se reconcilian sin mutar los eventos originales.

## REQ-03 — Chat, multimedia y búsqueda por OT

### Reglas

- **REQ-03.1:** Cada OT debe tener un hilo inequívoco; se podrá conservar además un canal general empresa–persona, claramente diferenciado.
- **REQ-03.2:** El acceso al hilo de OT se limita al manager de la empresa, coordinadores autorizados del proyecto y participantes asignados.
- **REQ-03.3:** La búsqueda debe ejecutarse sobre todo el historial paginado y no sólo sobre los mensajes actualmente cargados.
- **REQ-03.4:** Se deben poder filtrar mensajes, imágenes, documentos y enlaces, y buscar por texto, nombre de archivo, caption/tags, autor y fecha.
- **REQ-03.5:** La galería de la OT debe mostrar autor, timestamp, relación con el trabajo y archivo mediante URL firmada.
- **REQ-03.6:** Los adjuntos deben tener allowlist de tipos, límite de tamaño/cantidad, nombres normalizados, ruta server-side y política de análisis/retención.
- **REQ-03.7:** OCR o búsqueda semántica del contenido visual no forma parte del MVP hasta validar precisión, costo y privacidad.

### Criterios de aceptación

- **AC-03-A:** Dadas dos OTs con el mismo instalador, cuando se abre el chat de una, entonces no aparecen mensajes ni adjuntos de la otra.
- **AC-03-B:** Dado un mensaje antiguo fuera de los primeros 300, cuando se busca una palabra o nombre de archivo, entonces aparece con contexto y navegación a la OT.
- **AC-03-C:** Dado un usuario ajeno a la OT, cuando intenta leer mensajes o abrir una URL de archivo, entonces la DB/Storage lo deniega.

## REQ-04 — Locación canónica e historial acumulado

### Reglas

- **REQ-04.1:** Una locación se crea una vez por empresa y cliente, y puede asociarse a múltiples proyectos sin copiar su identidad ni archivos permanentes.
- **REQ-04.2:** Dirección, contactos, acceso, riesgos, permisos y notas permanentes pertenecen a la locación; estado y alcance contractual pertenecen a su asociación con el proyecto.
- **REQ-04.3:** La ficha debe presentar cronológicamente proyectos, OTs, relevamientos, evidencias, incidentes y cambios permanentes de esa locación.
- **REQ-04.4:** Permisos/requisitos deben incluir tipo, estado, vigencia, vencimiento, documento y auditoría.
- **REQ-04.5:** El borrado o archivo de un proyecto no debe borrar la locación ni su historia acumulada.
- **REQ-04.6:** La deduplicación automática sólo puede usar una clave confiable, preferentemente empresa + cliente + referencia externa; coincidencias por nombre/dirección requieren revisión.
- **REQ-04.7:** Manager, coordinador e instalador deben ver/editar únicamente el alcance autorizado; un instalador sólo accede mediante una asignación vigente o histórica permitida.

### Criterios de aceptación

- **AC-04-A:** Dada una sucursal usada en dos proyectos, cuando se abre su ficha, entonces hay una identidad y un historial de ambos proyectos sin duplicar adjuntos permanentes.
- **AC-04-B:** Dadas dos filas ambiguas por nombre/dirección, cuando corre el backfill, entonces quedan en reporte de revisión y no se fusionan automáticamente.
- **AC-04-C:** Dado el archivo de un proyecto, entonces la locación sigue disponible para reutilización y conserva su trazabilidad.

## REQ-05 — Oportunidad, cotización y conversión a proyecto

### Reglas

- **REQ-05.1:** Una oportunidad puede existir antes de un proyecto y debe contener cliente, locaciones/área, alcance, fechas tentativas, moneda, requisitos y estado.
- **REQ-05.2:** La bolsa actual para cubrir personal de un proyecto confirmado y la oportunidad comercial preproyecto deben conservar semánticas separadas.
- **REQ-05.3:** Un instalador elegible puede crear y revisar su propia cotización con precio, moneda, términos, vigencia y mensaje; no puede ver cotizaciones de otros.
- **REQ-05.4:** La empresa debe registrar selección y aprobación externa del cliente con actor, fecha, versión de cotización y evidencia/nota.
- **REQ-05.5:** La conversión debe ser transaccional e idempotente y exigir cliente confirmado, cotización seleccionada y coordinador obligatorio.
- **REQ-05.6:** La conversión debe crear y vincular proyecto, locaciones, OTs/actividades, asignación y snapshot de honorario sin perder trazabilidad a la oportunidad.
- **REQ-05.7:** Si cualquier precondición o escritura falla, no debe quedar un proyecto parcial.

### Criterios de aceptación

- **AC-05-A:** Dada una oportunidad aprobada sin coordinador, cuando se intenta convertir, entonces se rechaza sin crear proyecto ni OT.
- **AC-05-B:** Dada una conversión exitosa, cuando se repite el mismo comando, entonces devuelve el mismo proyecto y no duplica ninguna entidad.
- **AC-05-C:** Dado un instalador postulante, entonces sólo puede leer la oportunidad publicada y sus propias versiones de cotización.

## REQ-06 — Cancelaciones, reprogramación y confiabilidad

### Reglas

- **REQ-06.1:** Reprogramar debe crear una revisión de agenda con motivo, autor, horario anterior/nuevo, notificación persistida, deadline y respuesta pendiente del instalador.
- **REQ-06.2:** El instalador debe aceptar o rechazar una reprogramación dentro de los dos días hábiles posteriores a su notificación persistida y recibir recordatorios antes del vencimiento.
- **REQ-06.3:** Una solicitud de cancelación/baja debe capturar categoría, justificación mínima, evidencia opcional y revisión; datos sensibles deben minimizarse y restringirse.
- **REQ-06.4:** Para una baja común debe existir una ventana de dos días hábiles sin penalización. Antes de implementar, DEC-07 debe fijar su ancla; el baseline recomendado es solicitarla con al menos dos días hábiles de anticipación al inicio programado.
- **REQ-06.5:** Días hábiles, feriados, zona horaria, comienzo de cada plazo y consecuencia del silencio deben ser reglas versionadas y testeables.
- **REQ-06.6:** La confiabilidad se deriva de eventos inmutables y reversibles mediante decisión de revisión, nunca de un contador sobrescrito.
- **REQ-06.7:** No se aplicará penalización visible hasta que la prueba de notificación, la agenda y el proceso de revisión funcionen y el cálculo haya corrido en modo sombra.
- **REQ-06.8:** Si se activa una penalización, debe ser progresiva según recurrencia y comportamiento reciente, tener duración/impacto explicables y permitir recuperación por nuevos cumplimientos.
- **REQ-06.9:** El instalador debe ver qué evento afectó su score, la regla aplicada y la vía de revisión/recuperación.

### Criterios de aceptación

- **AC-06-A:** Dada una reprogramación, el plazo comienza sólo después de persistir la notificación in-app; un fallo de email/push no borra el aviso ni duplica la revisión.
- **AC-06-B:** Dada una cancelación justificada aprobada, entonces no genera penalización; si ya existía un evento, se revierte con otro evento auditable.
- **AC-06-C:** Dada una empresa externa, entonces sólo ve un resumen autorizado de confiabilidad y nunca el motivo sensible, cliente, dirección u OT de terceros.

## REQ-07 — Relevamiento y ejecución como actividades distintas

### Reglas

- **REQ-07.1:** El sistema debe separar el tipo de actividad de su estado de lifecycle.
- **REQ-07.2:** Una OT puede ser sólo relevamiento, sólo ejecución o contener relevamiento seguido de ejecución.
- **REQ-07.3:** El relevamiento tendrá borrador, enviado, cambios solicitados y aprobado, con plantilla/checklist, mediciones, notas y evidencias versionadas.
- **REQ-07.4:** La fecha del relevamiento puede ser opcional al crear el trabajo; la ejecución requiere fecha de inicio y puede tener fin opcional según política.
- **REQ-07.5:** Cuando la ejecución depende de un relevamiento, no podrá comenzar hasta su aprobación.
- **REQ-07.6:** Quien ejecuta/releva no puede aprobar su propia entrega; manager puede ser fallback sólo si la regla se documenta.

### Criterios de aceptación

- **AC-07-A:** Dada una OT de relevamiento independiente, cuando se aprueba su informe, entonces la OT puede finalizar sin crear una ejecución ficticia.
- **AC-07-B:** Dada una OT combinada, cuando el relevamiento tiene cambios solicitados, entonces la ejecución permanece bloqueada y se conserva cada versión.
- **AC-07-C:** Dado un usuario dual asignado como ejecutor, entonces el intento de autoaprobar se rechaza en servidor y DB.

## REQ-08 — Importación y exportación de locaciones

### Reglas

- **REQ-08.1:** La UI debe separar de forma visible descargar plantilla, importar y exportar.
- **REQ-08.2:** Antes de escribir, el importador debe mostrar esperadas, encontradas, válidas, incompletas, duplicadas y diferencia, con preview por fila.
- **REQ-08.3:** La identidad/upsert debe usar la clave canónica acordada y reportar ambigüedades; no debe insertar duplicados silenciosos.
- **REQ-08.4:** La importación debe ser atómica o reanudable con un `import_id`; su contrato debe impedir lotes parciales invisibles.
- **REQ-08.5:** Los errores deben poder descargarse con fila, campo, valor y causa.
- **REQ-08.6:** La exportación XLSX debe incluir todas o las locaciones seleccionadas y permitir round-trip sin pérdida ni duplicación.
- **REQ-08.7:** PDF, Word y Excel variable se tratarán como flujo asistido separado, con preview obligatorio y sin escritura automática.

### Criterios de aceptación

- **AC-08-A:** Dado un archivo con 100 filas, 3 incompletas y 2 duplicadas, la confirmación muestra esos conteos y escribe sólo la decisión aprobada por el usuario.
- **AC-08-B:** Dada una exportación sin modificaciones, cuando se reimporta, entonces no crea nuevas locaciones ni pierde campos.
- **AC-08-C:** Dado un fallo en el lote 3, entonces el usuario puede reanudar o revertir según el contrato sin desconocer qué filas quedaron aplicadas.

## REQ-09 — Roles duales y separación de funciones

### Reglas

- **REQ-09.1:** Una membresía de empresa debe admitir múltiples roles/capacidades sin duplicar usuario ni empresa.
- **REQ-09.2:** Agregar coordinador a un instalador debe ser aditivo; no debe perder tareas, historial, perfil ni acceso a sus finanzas.
- **REQ-09.3:** Quitar capacidad de instalar debe bloquearse mientras existan asignaciones abiertas; quitar coordinación debe bloquearse o reasignar proyectos activos.
- **REQ-09.4:** Navegación y acciones deben derivarse de capacidades y contexto de empresa, no de un único rol escalar.
- **REQ-09.5:** Las políticas RLS deben aplicar mínimo privilegio por recurso; “ser miembro” no otorga automáticamente operar todos los proyectos.
- **REQ-09.6:** Se debe impedir autoaprobación cuando la misma persona actuó como instalador/relevador.

### Criterios de aceptación

- **AC-09-A:** Dado un usuario dual en A e instalador en B, cuando cambia de contexto, entonces obtiene exactamente las capacidades de esa membresía.
- **AC-09-B:** Dado un coordinador del proyecto P1, entonces no puede operar P2 ni finanzas aunque pertenezca a la empresa.
- **AC-09-C:** Dado un cambio de roles repetido, entonces el comando es idempotente y el historial de permisos queda auditado.

## REQ-10 — Reputación profesional e historial

### Reglas

- **REQ-10.1:** Reputación y confiabilidad deben mostrarse como dimensiones separadas.
- **REQ-10.2:** Reputación puede considerar trabajos aprobados, complejidad, urgencia/anticipación, incidentes resueltos, rachas y reseñas, usando eventos versionados.
- **REQ-10.3:** Dificultad, tipo de servicio y lead time deben ser atributos explícitos; no se inferirán de prioridad o texto libre.
- **REQ-10.4:** Fórmula, versión, muestra mínima, decaimiento, recuperación y badges deben ser reproducibles y explicables.
- **REQ-10.5:** El instalador ve su detalle; la empresa originadora ve sus eventos; otras empresas sólo agregados autorizados sin datos identificables de terceros.
- **REQ-10.6:** Debe existir revisión/apelación y recalculado por versión sin borrar eventos.

### Criterios de aceptación

- **AC-10-A:** Dado el mismo conjunto de eventos y versión de reglas, el recálculo produce exactamente el mismo score.
- **AC-10-B:** Dado un evento revertido tras revisión, entonces el score cambia y ambos hechos permanecen auditables.
- **AC-10-C:** Dado un perfil consultado por otra empresa, entonces muestra agregados/badges pero no nombres de clientes, direcciones ni motivos sensibles.

## REQ-11 — Agenda, disponibilidad, conflictos y traslados

### Reglas

- **REQ-11.1:** Cada actividad/asignación debe admitir inicio, fin, zona horaria, duración estimada y una marca de precisión para datos legacy.
- **REQ-11.2:** Debe existir una agenda dedicada con al menos el mes anterior, presente y futuro, y filtros por fecha, proyecto, provincia, instalador y estado.
- **REQ-11.3:** La asignación/reprogramación debe comprobar en una transacción solapamientos, ausencias y disponibilidad cross-company.
- **REQ-11.4:** La empresa solicitante recibe sólo disponible/no disponible y un código seguro; no obtiene empresa, cliente, OT, dirección ni horario externo.
- **REQ-11.5:** Todas las vías de asignación deben usar el mismo gate y lock por instalador para evitar carreras.
- **REQ-11.6:** El cálculo debe incorporar margen y traslado entre locaciones; la primera versión puede usar distancia conservadora y una fase posterior proveedor vial.
- **REQ-11.7:** Solapamiento o ausencia son bloqueo duro; traslado insuficiente sólo admite override de manager con razón auditable, sujeto a DEC-09.
- **REQ-11.8:** La disponibilidad personal global y las preferencias por empresa deben tener precedencia definida.

### Criterios de aceptación

- **AC-11-A:** Dadas dos asignaciones concurrentes en empresas distintas, sólo una transacción gana; la otra recibe conflicto sin detalles externos.
- **AC-11-B:** Dada una ausencia aprobada, ninguna vía de alta, edición, bolsa o reasignación puede eludir el bloqueo.
- **AC-11-C:** Dada una OT legacy sin hora, entonces se muestra precisión desconocida y no se inventa una franja exacta para penalizar o bloquear.

## REQ-12 — Dashboard y alertas climáticas

### Reglas

- **REQ-12.1:** Se conservarán los KPIs actuales, pero cada métrica debe tener definición, fuente, zona horaria y regla de reconciliación documentadas.
- **REQ-12.2:** Filtros comunes por período, proyecto, provincia e instalador deben aplicarse de forma coherente a todos los paneles compatibles.
- **REQ-12.3:** Deben mostrarse resolución en una visita, incidentes y desempeño por proyecto/provincia/instalador usando los nuevos eventos.
- **REQ-12.4:** El clima debe cubrir al menos 48 horas sobre coordenadas reales de cada región; nunca debe caer silenciosamente en una ciudad de otro país.
- **REQ-12.5:** Una alerta debe indicar zona, ventana, severidad y cantidad/listado de OTs potencialmente afectadas.
- **REQ-12.6:** El proveedor climático puede fallar sin bloquear el dashboard y sus datos nunca deben penalizar ni reprogramar automáticamente.

### Criterios de aceptación

- **AC-12-A:** Dado un filtro de proyecto/provincia, las tarjetas, tablas, series y listado de OTs concilian con la misma consulta fuente.
- **AC-12-B:** Dada una provincia argentina sin coordenadas, se muestra “clima no disponible” o se geocodifica correctamente; nunca Brasilia.
- **AC-12-C:** Dado el proveedor caído, el resto del dashboard carga y expone el estado degradado.

## REQ-13 — Notificaciones y comunicaciones segmentadas

### Reglas

- **REQ-13.1:** Cada destinatario debe poder marcar leído, archivar, desarchivar y filtrar sin borrar la notificación original.
- **REQ-13.2:** Prioridad crítica/advertencia/informativa debe verse consistentemente como rojo/amarillo/neutro y ser accesible sin depender sólo del color.
- **REQ-13.3:** La empresa debe crear comunicaciones independientes de la bolsa usando segmentos combinables por provincia, localidad, tipo de servicio, equipo/proyecto y disponibilidad.
- **REQ-13.4:** Antes de enviar debe verse conteo y preview seguro de destinatarios; la ejecución debe ser idempotente y auditable.
- **REQ-13.5:** La notificación in-app es el registro primario; fallos de email o push se reintentan sin revertirla ni duplicarla.
- **REQ-13.6:** Una comunicación masiva no crea oportunidad, postulación, proyecto, OT ni compromiso.
- **REQ-13.7:** Recordatorios y deadlines deben usar un scheduler/outbox con reintentos, prueba de entrega y observabilidad.

### Criterios de aceptación

- **AC-13-A:** Dada una notificación archivada por A, entonces B conserva su estado independiente y el evento global no se borra.
- **AC-13-B:** Dado un envío repetido con la misma clave, cada destinatario recibe una sola notificación in-app.
- **AC-13-C:** Dado un segmento combinado, ningún usuario de otra empresa se incluye salvo una regla de negocio explícita y tenant-safe.

## REQ-14 — Flujo de campo y aprobación

### Reglas

- **REQ-14.1:** El historial debe modelar al menos: aceptada, en camino, llegada, avance, bloqueo/incidente, finalización solicitada, evidencia solicitada, corrección solicitada, aprobada y reabierta.
- **REQ-14.2:** Cada evento debe conservar actor, rol/contexto, timestamp cliente y servidor, estado previo/nuevo, nota, ubicación cuando corresponda y evidencias.
- **REQ-14.3:** Las transiciones válidas deben tener una única definición y validarse en dominio, RPC/servidor y DB.
- **REQ-14.4:** La finalización debe exigir checklist y evidencia mínima configurables; baseline: tres fotos para ejecución.
- **REQ-14.5:** Coordinador/manager puede aprobar, pedir evidencia, pedir corrección o reabrir, siempre con motivo; no puede autoaprobar si ejecutó.
- **REQ-14.6:** Cada cambio de responsable debe generar una notificación persistida e idempotente.
- **REQ-14.7:** El historial debe reconstruirse correctamente con eventos sincronizados tarde y distinguir `occurred_at` de `received_at`.

### Criterios de aceptación

- **AC-14-A:** Dada una ejecución con sólo dos fotos cuando el mínimo es tres, entonces servidor y DB rechazan la solicitud de finalización online y offline.
- **AC-14-B:** Dada una reapertura, entonces exige motivo, notifica al instalador y conserva aprobación/estado anterior.
- **AC-14-C:** Dados eventos offline recibidos fuera de orden, entonces la versión esperada impide una transición inválida y genera conflicto resoluble.

## REQ-15 — Cliente final fuera de la aplicación

### Reglas

- **REQ-15.1:** No se crea rol, sesión, layout ni portal para el cliente final en este alcance.
- **REQ-15.2:** Ningún contacto de cliente recibe URLs privadas o credenciales de la aplicación.
- **REQ-15.3:** La agencia/empresa registra comunicaciones y aprobación externa con auditoría.
- **REQ-15.4:** Un portal futuro requerirá especificación y modelo de permisos independiente; no reutilizará `company_manager`.

### Criterios de aceptación

- **AC-15-A:** Dado un contacto de cliente, no existe camino de autenticación o autorización hacia datos tenant.
- **AC-15-B:** Dada una conversión de oportunidad, la aprobación queda atribuida al usuario interno que la registró y a la evidencia externa, no a un usuario cliente ficticio.

## REQ-16 — Email, localización, onboarding y preparación operativa

### Reglas

- **REQ-16.1:** Dominio, SMTP/Resend y Redirect URLs deben estar configurados y probados con recepción real para invitación, verificación y recuperación.
- **REQ-16.2:** Debe decidirse si email confirmado es requisito de activación y alinear invitaciones/alta master con esa regla.
- **REQ-16.3:** Pt-BR requiere revisión semántica humana de términos de oficio, fechas, moneda, pluralización y recorridos completos; paridad de claves no basta.
- **REQ-16.4:** Debe existir ayuda versionada dentro de la app y manual/video por rol para aceptar OT, campo, offline/sync, incidentes y recuperación de errores.
- **REQ-16.5:** QA manual debe cubrir 375 px, escritorio, manager, coordinador, instalador multiempresa, usuario dual, PWA real y reconexión, conservando evidencia.
- **REQ-16.6:** El runtime, gestor de paquetes, migraciones y entornos deben ser reproducibles y no usar producción como entorno primario de prueba.

### Criterios de aceptación

- **AC-16-A:** Una invitación y una recuperación completas llegan a una casilla real, usan el dominio aprobado y terminan en la URL correcta.
- **AC-16-B:** Un hablante competente aprueba los recorridos pt-BR definidos y los hallazgos quedan registrados.
- **AC-16-C:** Un instalador nuevo puede completar el flujo crítico usando la ayuda publicada y recuperar una sincronización fallida.

## Requisitos no funcionales

### Seguridad y privacidad

- **NFR-SEC-01:** Toda tabla, vista, RPC, función y bucket de dominio debe tener una matriz actor × acción y pruebas RLS positivas/negativas con al menos dos empresas.
- **NFR-SEC-02:** Las funciones `SECURITY DEFINER` deben fijar `search_path`, validar actor/contexto, retornar el mínimo y no ampliar el uso de service role fuera de las excepciones vigentes.
- **NFR-SEC-03:** Finanzas, motivos de cancelación, disponibilidad cross-company y archivos son datos sensibles; deben aplicar minimización, retención y auditoría.
- **NFR-SEC-04:** Sesiones de empresa suspendida deben quedar efectivamente bloqueadas y los caches locales deben invalidarse.
- **NFR-SEC-05:** Exportaciones y URLs firmadas deben respetar tenant, caducidad y alcance del usuario.

### Integridad y resiliencia

- **NFR-INT-01:** Comandos críticos deben ser atómicos, idempotentes y auditables.
- **NFR-INT-02:** Estados, scores y saldos deben derivarse de eventos/fuentes identificables y ser recalculables.
- **NFR-INT-03:** Jobs, fan-out, sincronización y cargas deben tener reintento acotado, dead-letter/conflicto y operación manual segura.
- **NFR-INT-04:** Toda migración debe tener forward, backfill medido, compatibilidad entre versiones y plan de rollback antes de eliminar columnas/rutas anteriores.

### Performance

- **NFR-PERF-01:** Antes de cada release se acuerdan umbrales con datos representativos; como base de prueba: campañas de 2.000 locaciones, historiales largos, lotes de notificaciones y colas con múltiples fotos.
- **NFR-PERF-02:** Búsquedas y listados deben paginar en servidor y evitar cargar el tenant completo en cliente.
- **NFR-PERF-03:** El dashboard y el clima deben degradar por panel, no bloquear toda la página.

### Accesibilidad, UX e i18n

- **NFR-UX-01:** Acciones destructivas o irreversibles requieren confirmación y explicación; conflictos/sync deben indicar recuperación posible.
- **NFR-UX-02:** Prioridad, estado y error no dependerán únicamente del color.
- **NFR-UX-03:** Los flujos críticos cumplirán navegación por teclado, foco visible, labels, contraste y `prefers-reduced-motion`.
- **NFR-I18N-01:** Todo texto visible usa next-intl con paridad es/pt; fechas, números y monedas usan locale y zona horaria explícitos.

### Observabilidad y operación

- **NFR-OPS-01:** Errores de servidor/cliente, RPC, jobs, fan-out, sync y carga de medios deben incluir correlación sin registrar secretos ni datos sensibles innecesarios.
- **NFR-OPS-02:** Cada release necesita métricas de adopción, éxito/error, latencia, backlog y conflictos, con alertas y runbook.
- **NFR-OPS-03:** Los cambios de alto riesgo se activan con feature flag/canary y criterio documentado de rollback.

## Requisitos explícitamente diferidos

- **FUT-01:** Interpretación inteligente de PDF, Word y Excel no estructurado.
- **FUT-02:** OCR/IA para buscar conceptos dentro de imágenes.
- **FUT-03:** Portal del cliente final.
- **FUT-04:** Motor fiscal/contable completo y conciliación bancaria automática.
- **FUT-05:** Optimización vial con tráfico en tiempo real e importación bidireccional de calendarios externos.
