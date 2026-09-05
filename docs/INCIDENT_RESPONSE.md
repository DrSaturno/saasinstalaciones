# Respuesta a incidentes — Se Instala

Cada procedimiento sigue la misma estructura: **detectar → confirmar alcance →
acción inmediata → mitigar → recuperar → verificar → escalar → evidencia**.

> **Limitación honesta y transversal:** hoy **no hay alertas, ni colector de
> logs, ni monitor de uptime**. En la práctica, casi todo se detecta porque
> **alguien avisa**. Cada sección marca 🔴 la detección automática que falta.
> Mientras no exista el Bloque 1 del plan, el tiempo de detección es
> impredecible y ese es el mayor multiplicador de daño de esta lista.

**Contactos y escalamiento:** 🔴 sin definir. Completar antes de operar:
responsable técnico, responsable de datos, y quién decide una restauración.

---

## 1. Aplicación caída

**Detectar.** Reportes de usuarios; panel de Vercel. 🔴 Falta monitor de uptime
sobre `/api/health` (endpoint que además hay que crear).

**Confirmar alcance.** ¿Falla todo o un área? ¿Todos los usuarios o un rol?
Abrir `/login` en una ventana privada. Revisar Deployments en Vercel.

**Acción inmediata.** Si coincide con un despliegue reciente → rollback
([`ROLLBACK_PLAN.md`](ROLLBACK_PLAN.md) §2).

**Mitigar.** Si es Supabase y no la app, ver §2.

**Recuperar.** Promover el último despliegue bueno; revertir el commit.

**Verificar.** Login por los tres roles; una lectura por área.

**Escalar.** Si la caída supera 30 min o hay riesgo de datos.

**Evidencia.** ID del despliegue, SHA, hora de inicio y fin, captura de errores.

---

## 2. Base de datos caída / Supabase no responde

**Detectar.** Todos los usuarios expulsados a `/login` (síntoma engañoso: parece
un problema de sesión, no de base). Panel de estado de Supabase.

> **Por qué se ve así:** `proxy.ts:88-90` llama a `supabase.auth.getUser()` **sin
> try/catch** en cada request. Si Supabase no responde, `user` viene nulo y el
> middleware redirige todo a `/login` — una página que tampoco puede
> autenticar. **Un deslogueo masivo repentino debe hacer sospechar de Supabase,
> no de Auth.**

**Confirmar alcance.** Consultar el estado del proyecto; probar una consulta
trivial. Verificar si el proyecto está **pausado** (los proyectos free se pausan
por inactividad — ya pasó con `Base 3 - Legacy`).

**Acción inmediata.** Si está pausado: reanudarlo desde el panel. Si es una
caída del proveedor: comunicar y esperar; no hay failover.

**Mitigar.** Los instaladores con la PWA cacheada pueden seguir viendo su última
vista y **encolando trabajo** (Dexie sigue funcionando). Empresa y master no
tienen historia offline. Comunicar a los instaladores que **no borren datos del
sitio ni desinstalen la app**: perderían la cola.

**Recuperar.** Al volver Supabase, la cola se vacía sola al reconectar.

**Verificar.** Que el outbox drene: revisar el indicador de sincronización y que
no queden elementos bloqueados.

**Escalar.** Inmediato si el proyecto no reanuda o hay sospecha de pérdida.

**Evidencia.** Hora de inicio/fin, estado del proyecto, cantidad de elementos en
cola al restablecerse.

---

## 3. Error después del deploy

**Detectar.** Reportes; 5xx en el panel. 🔴 Falta alerta por tasa de error.

**Confirmar alcance.** ¿Afecta un rol, un área o todo? ¿Hubo migración en este
despliegue?

**Acción inmediata.** **Antes de revertir, preguntarse si el build anterior
tolera el esquema actual.** Si hubo una migración que estrechó un `CHECK` o
cambió una firma de función, el rollback rompe más de lo que arregla → corregir
hacia adelante.

**Mitigar / recuperar.** Rollback (§2 del plan) o hotfix.

**Verificar.** Smoke por rol; observar 15 minutos.

**Escalar.** Si el rollback no es seguro por el esquema.

**Evidencia.** Despliegue, migraciones incluidas, decisión tomada y por qué.

---

## 4. Migración fallida

Ver [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md) §5 (procedimiento completo).

**Detectar.** `supabase db push` corta con error, o **se cuelga**.

> **Si se cuelga:** revisar `pg_stat_activity` antes de cancelar. Ninguna
> migración fija `lock_timeout` y los 92 índices se crean sin `CONCURRENTLY`;
> lo más probable es que un `CREATE INDEX` esté esperando detrás de una lectura
> larga, bloqueando a su vez todas las escrituras encoladas.

**Acción inmediata.** Parar despliegues. No reintentar a ciegas.

**Escalar.** Siempre que haya `delete`/`update` masivo involucrado.

---

## 5. Credencial expuesta

**Detectar.** Aviso de GitHub/proveedor; revisión.

**Confirmar alcance.** ¿Cuál? ¿Desde cuándo? ¿Qué permite hacer?
Orden de gravedad: `SUPABASE_SERVICE_ROLE_KEY` (**salta toda la RLS**) >
`GOOGLE_TOKEN_ENCRYPTION_KEY` (descifra tokens de calendario) >
`VAPID_PRIVATE_KEY` > `RESEND_API_KEY` > `KV_REST_API_TOKEN`.

**Acción inmediata.** **Rotar primero, investigar después.**
- `SUPABASE_SERVICE_ROLE_KEY`: rotar en el panel → actualizar en Vercel **y** en
  los secretos de la Edge Function → redesplegar ambos.
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: rotar **invalida los tokens ya cifrados** — hay
  que forzar la reconexión de calendario de todos los usuarios.
- VAPID: rotar invalida **todas** las suscripciones push existentes.

**Mitigar.** Revocar sesiones activas si la clave permitía emitirlas.

**Verificar.** Que la clave vieja ya no funcione; que la app siga operando.

**Escalar.** Siempre. Si hubo acceso a datos personales, evaluar notificación.

**Evidencia.** Qué clave, ventana de exposición, qué se rotó, a qué hora.
**Nunca pegar el valor de la credencial en el registro del incidente.**

---

## 6. Cuenta administrativa comprometida

**Detectar.** Actividad anómala en `/master`; alta de empresas no reconocida.

**Confirmar alcance.** Revisar `companies` y `profiles` creados o modificados en
la ventana sospechosa.

**Acción inmediata.** Cambiar la contraseña y **revocar sesiones** del
`platform_admin`. La MFA obligatoria (SEC-13) ya limita el daño de una
contraseña filtrada sola.

**Mitigar.** Verificar que no se haya creado otro `platform_admin`.

> **Vector a revisar sí o sí:** `handle_new_user()` toma el rol **literalmente**
> de `raw_user_meta_data`. Quien pueda crear una fila en `auth.users` con
> `{"role":"platform_admin"}` obtiene ese rol. En producción eso requiere
> `service_role` o el panel — de ahí que la clave de servicio sea la joya.

**Recuperar.** Revertir los cambios ilegítimos.

**Verificar.** Enumerar todos los `platform_admin` y confirmar que cada uno
corresponde a una persona conocida.

**Escalar.** Siempre.

**Evidencia.** Registro de cambios, IDs afectados, ventana temporal.

---

## 7. Pérdida de datos

**Detectar.** Reporte de que "faltan" órdenes, sitios o evidencia.

**Confirmar alcance.** Antes de tocar nada: ¿qué tablas, cuántas filas, desde
cuándo? ¿Fue un borrado, una migración, o **RLS que oculta** en lugar de borrar?
Verificar con `service_role` si las filas realmente no existen: **una política
mal escrita se ve exactamente igual que un borrado.**

**Acción inmediata.** **Parar escrituras** sobre las tablas afectadas si se va a
intentar restaurar: cada escritura nueva reduce lo recuperable.

**Mitigar / recuperar.** Ver [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md) §5.
**Con el plan actual (free, sin backups): no hay recuperación posible.** Esta
frase es el motivo del NO-GO.

**Verificar.** Conteos y integridad referencial.

**Escalar.** Inmediato y siempre.

**Evidencia.** Consultas de conteo antes/después, hora, causa raíz.

---

## 8. Servicio externo caído

| Servicio | Síntoma | Impacto real | Acción |
|---|---|---|---|
| **Resend** | Emails no llegan | Alta de empresa **devuelve 502 y revierte**; invitación de instalador degrada a link manual | Entregar links a mano; reintentar el alta después |
| **Google Calendar** | La sincronización falla | Función secundaria | Ninguna urgente |
| **Open-Meteo** | Sin pronóstico | Cosmético; degrada solo (único con timeout) | Ninguna |
| **Upstash** | — | **Ninguno visible: el limitador falla ABIERTO** | ⚠️ Se pierde el freno de fuerza bruta **sin aviso** |
| **Edge Function push** | No llegan notificaciones | Las notificaciones in-app **sí** se escriben | ⚠️ Falla **100% silenciosa** (`catch {}` vacío) |

**Dos puntos ciegos que conviene tener presentes:** una caída total del push y
una caída de Upstash **no generan ninguna señal**. Si se sospecha cualquiera de
las dos, hay que comprobarlas a mano.

**Riesgo agravado por falta de timeouts:** salvo el clima, ninguna llamada
externa tiene `AbortSignal`. Un proveedor **lento** (no caído) puede agotar el
tiempo de las funciones y degradar la app entera. En el alta de empresa eso
puede dejar empresa + usuario huérfanos, justo lo que la compensación busca
evitar.

---

## 9. Cola de sincronización detenida

**Detectar.** 🔴 Sólo por reporte del instalador: los eventos del outbox se
registran **en la consola del navegador del teléfono**, nunca llegan al servidor.
Las alertas #2 y #4 de `operations/observability.md` **no pueden dispararse hoy**.

**Confirmar alcance.** Pedir al instalador el indicador de sincronización:
cuántos elementos pendientes y cuántos **bloqueados**.

**Acción inmediata.** **Que no borre los datos del sitio ni desinstale la PWA.**
Es la instrucción más importante de todo este documento: eso destruye la cola.

**Mitigar.** Un elemento `blocked` fue rechazado por el servidor de forma
terminal (`retryable: false`) y no se reintenta más. Requiere resolución humana:
entender por qué se rechazó y recrear la operación.

**Recuperar.** Restablecida la conectividad, la cola drena sola. Los elementos
bloqueados **no**.

**Verificar.** Que el pendiente llegue a cero y no queden bloqueados.

**Escalar.** Si hay elementos bloqueados: **es trabajo de campo perdido** si
nadie lo atiende.

**Evidencia.** Cantidad de pendientes/bloqueados, `tries`, antigüedad.

---

## 10. Disco lleno / límites de cuota

**Detectar.** 🔴 Sin alerta. Panel de Supabase.

**Confirmar alcance.** El plan free tiene límites bajos de base y de Storage.
La evidencia fotográfica de obra es el consumo que más crece.

**Acción inmediata.** Subir de plan o purgar según política de retención (que
🔴 no está definida).

**Escalar.** Si se está cerca del límite: bloquea altas de evidencia, es decir,
**bloquea el trabajo de campo**.

---

## 11. Certificado vencido

Gestionado por Vercel automáticamente. Si aparece un error de TLS con dominio
propio, revisar la configuración del dominio en el panel. Sin acción manual
prevista.

---

## 12. Desactivar temporalmente una funcionalidad

🔴 **No hay feature flags.** Hoy la única forma de apagar algo es desplegar un
cambio de código. Esto es una limitación real: el `release-runbook.md` describe
desplegar "con la funcionalidad desactivada", y ese mecanismo **no existe**.

Alternativas disponibles hoy, en orden de preferencia:
1. Revertir el código de esa función y desplegar.
2. Para RPCs: revocar `EXECUTE` (efecto inmediato, sin desplegar) — pero produce
   errores crudos en la interfaz, no una degradación elegante.
3. Quitar la variable de entorno de la que depende, si la hay (por ejemplo, sin
   `RESEND_API_KEY` el email pasa a `not_configured` de forma limpia).

---

## Registro de incidentes

🔴 No existe. Crear `docs/incidents/YYYY-MM-DD-slug.md` por cada incidente con:
detección, alcance, línea de tiempo, causa raíz, acciones, y **qué habría hecho
falta para detectarlo antes** — esa última pregunta es la que convierte un
incidente en mejora del sistema.
