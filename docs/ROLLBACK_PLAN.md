# Plan de rollback — Se Instala

> **Resumen honesto:** el rollback de **código** funciona y es inmediato.
> El rollback de **datos no existe**. No hay migraciones `down`, no hay PITR y
> no hay backups en el plan actual. Cualquier migración que pierda información
> es **irreversible hoy**.

---

## 1. Qué se puede revertir y qué no

| Capa | ¿Reversible? | Mecanismo | Tiempo |
|---|:--:|---|---|
| Código de la app | ✅ | Promover un despliegue anterior en Vercel | ~1 min |
| Edge Function | ✅ | Redesplegar el commit anterior | ~2 min |
| Migración **expansiva** (agrega) | ✅ | Dejarla; el código viejo la ignora | 0 |
| Migración **contractiva** (quita) | ❌ | **No hay mecanismo** | — |
| Datos borrados / corrompidos | ❌ | **No hay backup ni PITR** | — |
| Caché del Service Worker | ⚠️ | Se purga solo, pero con retraso | Variable |
| Variables de entorno | ✅ | Editar en Vercel + redeploy | ~2 min |

---

## 2. Rollback de código (procedimiento)

1. **Identificar el último despliegue bueno.** Panel de Vercel → Deployments.
   Anotar su ID y el SHA del commit.
2. **Promover.** *Promote to Production* sobre ese despliegue. Vercel reenruta
   sin reconstruir.
3. **Verificar:** login por rol y una lectura de cada área.
4. **Revertir el código fuente también.** Promover en Vercel no cambia `main`:
   el próximo push volvería a publicar lo roto. Hacer `git revert` del merge
   y abrir PR.

```bash
git revert -m 1 <SHA_DEL_MERGE>
```

**Trampa a evitar:** promover un despliegue **anterior a una migración ya
aplicada**. El código viejo se encuentra un esquema nuevo. Si la migración fue
expansiva, funciona. Si fue contractiva o estrechó un `CHECK`, **no**: por eso
la regla de que las contractivas van en una release aparte.

Casos concretos ya presentes en el repo que romperían un rollback de código:
- `20260728000015_multi_company_cutover.sql:203-206` estrechó `profiles_role_check`
  para rechazar `'coordinator'`. Un build anterior que escriba ese rol falla.
- `20260908000000_field_flow_states.sql:13` amplió `work_orders_status_check`
  con `en_camino`/`en_sitio`. Un build anterior **lee** esos valores y no sabe
  representarlos (no tiene etiqueta ni clase CSS).

---

## 3. Rollback del Service Worker

`public/sw.js` cachea estáticos (stale-while-revalidate) y rutas de campo
(network-first con fallback). Tras un rollback, un instalador con la PWA abierta
puede seguir viendo assets del build revertido.

- `next.config.ts:82-85` ya sirve `/sw.js` con `max-age=0, must-revalidate`, así
  que el propio SW se revalida en la siguiente carga. ✅
- Para forzar la purga: cambiar el nombre de caché en `public/sw.js` y desplegar.
- **No** pedirle al instalador que "borre datos del sitio": eso vacía **Dexie**
  y con ello la cola offline — es decir, destruye trabajo de campo no sincronizado.

---

## 4. Rollback de datos — situación real

**Hoy no es posible.** Para que lo sea hace falta, en este orden:

1. Plan Supabase Pro → backups diarios.
2. PITR (complemento) → recuperación a un instante puntual.
3. Una restauración de prueba **ya ejecutada** (ver
   [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md)).

Mientras tanto, la única mitigación real es **preventiva**:

- No ejecutar migraciones contractivas.
- No ejecutar los scripts de `supabase/` que borran (`reset_a_cero.sql`,
  `limpiar_usuarios.sql`).
- Antes de cualquier migración con `update`/`delete` masivo, exportar a mano
  las tablas afectadas.

---

## 5. Rollback de una migración fallida

Si `supabase db push` corta a la mitad:

1. **No reintentar a ciegas.** El CLI envuelve cada archivo en una transacción,
   así que el archivo que falló no dejó cambios parciales — pero **los archivos
   anteriores del mismo push sí se aplicaron**.
2. Determinar hasta dónde llegó:
   ```bash
   npx supabase migration list --linked
   ```
3. Si las aplicadas son expansivas: **dejarlas** y desplegar el código que las
   tolera. Es el camino seguro.
4. Si alguna borró o transformó datos: es un incidente de pérdida de datos → ir
   a [`INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md) §7.
5. Corregir el archivo que falló y volver a aplicar sólo ese.

**Riesgo específico ya identificado:** ninguna migración fija `lock_timeout`, y
los 92 índices se crean sin `CONCURRENTLY`. Un `CREATE INDEX` sobre una tabla
grande (el GIN de `order_updates`) puede quedar bloqueado detrás de una lectura
larga y, a su vez, bloquear todas las escrituras que lleguen después. Si un push
"se cuelga", **esa** suele ser la causa; revisar `pg_stat_activity` antes de
cancelar nada.

---

## 6. Punto de restauración de código

Heredado de `operations/release-runbook.md`:

- Rama: `backup/pre-sdd-20260805`
- Tag: `backup-pre-sdd-20260805-d4a5e7c`
- Commit: `d4a5e7c65376884975af905b9d7b93d417114a7f`

Recupera **código**, no datos.

---

## 7. Criterios para decidir un rollback

Revertir si, tras un despliegue:

- La tasa de 5xx sube de forma sostenida.
- Un rol entero no puede iniciar sesión.
- Se corrompen o se pierden datos (**además**, abrir incidente).
- Falla el aislamiento entre tenants (**inmediato**, sin discusión).

**No** revertir si sólo hay un error cosmético o una función secundaria caída:
un rollback también tiene costo y riesgo. Corregir hacia adelante.

Con migraciones ya aplicadas, la decisión no es "revertir o no" sino
**"¿el build anterior tolera este esquema?"**. Si la respuesta no es un sí
evidente, corregir hacia adelante es más seguro que promover un build viejo.
