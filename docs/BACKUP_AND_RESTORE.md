# Respaldo y restauración — Se Instala

> **Estado actual: NO HAY BACKUPS.**
> La organización de Supabase está en plan `free`, que no provee backups
> descargables ni PITR. **Nunca se ejecutó una restauración.** Hoy, un borrado
> accidental o una migración destructiva es pérdida definitiva de datos.
>
> Este documento define el estado objetivo y el procedimiento para llegar y
> mantenerlo. Todo lo marcado 🔴 **todavía no existe**.

---

## 1. Qué hay que respaldar

| Activo | Dónde vive | ¿Respaldado hoy? | Crítico |
|---|---|:--:|:--:|
| Base de datos Postgres | Supabase `rpdjjvcmtcpvmwrjqhke` | ❌ | **Sí** |
| Usuarios de Auth (`auth.users`, `auth.identities`) | Ídem | ❌ | **Sí** |
| Factores MFA (`auth.mfa_factors`) | Ídem | ❌ | **Sí** |
| Archivos de Storage (`avatars`, `evidence`, `chat`) | Supabase Storage | ❌ | **Sí** — la evidencia de obra es prueba documental |
| Esquema (migraciones) | Git | ✅ | Sí |
| Código de la Edge Function | Git | ✅ | Sí |
| Secretos (VAPID, Resend, Google) | Vercel + secretos de Supabase | ❌ | **Sí** — si se pierden, hay que rotar todo |
| Configuración de Auth (MFA, redirect URLs) | Panel de Supabase | ❌ | Sí — no está en el repo |
| Variables de Vercel | Panel de Vercel | ❌ | Sí |

**Punto ciego importante:** los datos de campo no sincronizados viven en **Dexie
en el teléfono del instalador**. No son respaldables desde el servidor y se
pierden si el usuario borra los datos del sitio o desinstala la PWA. Es un
riesgo asumido del diseño offline-first, pero conviene tenerlo escrito.

---

## 2. Objetivos (a definir con negocio)

| Métrica | Valor hoy | Propuesto | Justificación |
|---|---|---|---|
| **RPO** (pérdida máxima tolerable) | ∞ | **24 h** con backup diario; **5 min** con PITR | Un día de partes de obra es recuperable con esfuerzo; más no |
| **RTO** (tiempo máximo de recuperación) | ∞ | **4 h** | Una cuadrilla parada más de medio día es un costo real |
| Retención | — | 7 días (Pro) / 30 con PITR | — |
| Frecuencia de prueba de restauración | Nunca | **Trimestral** + tras cada cambio de esquema mayor | Un backup no probado no es un backup |

🔴 **RPO y RTO son una decisión de negocio, no técnica.** Los valores propuestos
son un punto de partida razonable, no una recomendación cerrada.

---

## 3. Cómo llegar al estado objetivo

### Paso 1 — Plan Pro (requiere decisión humana)

Subir la organización de Supabase a Pro habilita backups diarios automáticos con
retención de 7 días. **Sin esto, nada de lo demás es posible.**
PITR es un complemento aparte; es lo que baja el RPO de 24 h a minutos.

### Paso 2 — Respaldo manual como puente 🔴

Hasta que exista el plan Pro (y como red adicional después), un export manual:

```bash
# Esquema + datos, sin roles (Supabase los gestiona)
npx supabase db dump --linked -f backup_$(date +%Y%m%d).sql --data-only
npx supabase db dump --linked -f schema_$(date +%Y%m%d).sql
```

**Advertencias reales:**
- `db dump` **no incluye** los objetos de Storage. Los archivos hay que bajarlos
  aparte con la API de Storage.
- El esquema `auth` puede requerir permisos que el dump estándar no cubre;
  verificar que `auth.users` esté presente en el archivo antes de confiar en él.
- El archivo resultante **contiene datos personales**. Guardarlo cifrado, nunca
  en el repositorio, nunca en un servicio de sincronización sin cifrar.

### Paso 3 — Automatizar 🔴

Programar el export (cron de Vercel, GitHub Actions con `schedule`, o el backup
nativo de Pro) y depositar en almacenamiento cifrado con retención definida.

---

## 4. Procedimiento de restauración 🔴 (nunca ejecutado)

Este es el procedimiento que **hay que ejecutar al menos una vez** para poder
afirmar que existe capacidad de recuperación. Se hace **en un proyecto aislado**,
jamás sobre producción.

### 4.1 Preparar un entorno aislado

1. Crear un proyecto Supabase nuevo, temporal (requiere plan que permita >2).
2. **Confirmar tres veces que no es producción.** Anotar el `ref` y verificarlo
   en cada comando.

### 4.2 Restaurar

1. Aplicar el esquema desde el repo:
   ```bash
   npx supabase db push --project-ref <REF_AISLADO>
   ```
2. Cargar el volcado de datos.
3. Restaurar los objetos de Storage desde la copia.

### 4.3 Validar (lo que convierte esto en evidencia)

No alcanza con "no dio error". Verificar:

| Comprobación | Cómo | Esperado |
|---|---|---|
| Conteos por tabla | `count(*)` en `companies`, `projects`, `sites`, `work_orders`, `order_updates`, `profiles` | Coinciden con el origen |
| Integridad referencial | Buscar `work_orders` sin `site_id` válido, `profiles` sin usuario | Cero huérfanos |
| Auth funciona | Iniciar sesión con una cuenta real restaurada | Entra y llega a su área |
| **RLS sigue activa** | Consultar como usuario de otra empresa | **No ve datos ajenos** |
| MFA | Un usuario con factor sigue teniéndolo | El factor existe y verifica |
| Storage | Abrir una evidencia | El archivo se descarga |
| Suite pgTAP | `npx supabase test db` | ~527 asserts en verde |
| Aplicación real | Apuntar un dev server al proyecto restaurado | Las tres áreas cargan |

La verificación de **RLS** es la más importante: una restauración que traiga
datos pero pierda políticas expone todos los tenants entre sí. Es un modo de
falla silencioso y catastrófico.

### 4.4 Registrar la evidencia

Anotar: fecha, origen, tamaño, duración total (= **RTO medido**), edad del
backup (= **RPO medido**), resultado de cada comprobación, y quién lo ejecutó.
**Sin este registro, la restauración no cuenta como probada.**

### 4.5 Destruir el entorno

Borrar el proyecto temporal y la copia local descifrada. Un proyecto olvidado
con datos reales es una fuga esperando ocurrir.

---

## 5. Recuperación ante migración fallida 🔴

1. **Parar los despliegues.** Que no entre nada más.
2. Determinar el alcance: ¿qué migración, qué tablas, qué filas?
   ```bash
   npx supabase migration list --linked
   ```
3. **Si sólo agregó cosas** (expansiva): no hace falta restaurar. Desplegar el
   código que tolera el esquema nuevo.
4. **Si borró o transformó datos:**
   - Con PITR: restaurar al instante inmediatamente anterior.
   - Con backup diario: restaurar en un proyecto aislado, extraer sólo las
     tablas afectadas y reinsertarlas. **Nunca restaurar encima de producción**
     si hubo escrituras posteriores: se perderían.
   - **Sin ninguna de las dos (situación actual): no hay recuperación.**
5. Preservar evidencia antes de tocar nada más (§ [`INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md)).

---

## 6. Lo que hay que dejar de tener a mano

Mientras no haya backups, estos archivos son el mayor riesgo individual del
proyecto. Están en `supabase/`, junto a las migraciones, con extensión `.sql`
como todo lo demás:

| Archivo | Qué hace |
|---|---|
| `reset_a_cero.sql` | Borra **26 tablas** y usuarios de `auth.users` |
| `limpiar_usuarios.sql` | Borra usuarios de `auth.users` en producción, por diseño |

Su única guarda es la existencia de `gerente@demo.dev` — que **no protege** a una
producción que alguna vez tuvo datos sembrados.

**Mitigación inmediata, sin costo:** moverlos a
`supabase/scripts-manuales/PELIGRO_*.sql`, fuera del directorio que se recorre
por costumbre, y agregarles un encabezado que obligue a descomentar una línea
para que corran.
