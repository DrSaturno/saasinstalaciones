# Scripts manuales — NO son migraciones

Nada de este directorio se ejecuta solo. **El CLI de Supabase no lo mira**: no
lo aplica `supabase db push` ni `db reset`. Todo acá se corre a mano, a
conciencia, pegándolo en el SQL Editor.

Se separó de `supabase/migrations/` a propósito: antes convivían en la misma
carpeta, con la misma extensión `.sql`, sin nada que los distinguiera. Dos de
ellos borran datos de producción.

## Inventario

| Archivo | Qué hace | Riesgo |
|---|---|---|
| `PELIGRO_reset_a_cero.sql` | Borra **26 tablas** y usuarios de `auth.users`, dejando sólo un perfil maestro y una empresa | 🔴 **Destruye un tenant** |
| `PELIGRO_limpiar_usuarios.sql` | Borra usuarios de `auth.users` fuera de una lista blanca | 🔴 **Irreversible** |
| `arreglar_roles_instaladores.sql` | Devuelve instaladores de `coordinator` a `installer` | 🟡 Escribe `profiles.role` esquivando el trigger anti-escalada |
| `reparar_instaladores.sql` | Misma intención, versión anterior | 🟡 Redundante con el anterior |
| `fix-seed-auth-tokens.sql` | Pone en `''` columnas de token en `NULL` de cuentas sembradas | 🟢 Acotado e idempotente. Ya superado: `seed.sql` las inserta bien |
| `qa_doble_membresia.sql` | Fixture de QA para doble membresía | 🟢 Las partes destructivas están comentadas |
| `seed_demo_bulk.sql` | Carga 40 sitios y 40 órdenes de demostración | 🟡 **Nunca contra producción** |

## Los dos `PELIGRO_` tienen guarda

Ambos empiezan con un bloque que aborta la ejecución:

```sql
do $$ begin raise exception 'BLOQUEADO: ...'; end $$;
```

Correr el archivo entero no hace nada hasta comentar esa línea a propósito. Es
deliberadamente incómodo.

## Antes de correr cualquiera de estos

1. **Verificá a qué proyecto estás conectado.** Producción y Demo se parecen.
2. **Tomá un respaldo.** Ver [`docs/BACKUP_AND_RESTORE.md`](../../docs/BACKUP_AND_RESTORE.md).
3. Recordá que **hoy no hay backups automáticos** (plan `free`): lo que se
   borra, se borró.

## Deuda conocida

- `arreglar_roles_instaladores.sql` y `reparar_instaladores.sql` hacen lo mismo;
  conviene quedarse con uno.
- `qa_doble_membresia.sql` tiene un UUID de producción embebido, señal de que se
  escribió contra datos reales.
