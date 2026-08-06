# Matriz de entornos

| Entorno | Propósito | Datos | Acceso | Cambios permitidos |
|---|---|---|---|---|
| Local | Desarrollo y pgTAP | Seed sintético A/B; nunca producción | Equipo de desarrollo | Reset libre mediante Supabase CLI |
| Staging | Integración, E2E, UAT y canary técnico | Sintético o anonimizado | Desarrollo + responsables de UAT | Sólo CI o runbook aprobado |
| Producción | Operación real | Datos reales | Acceso mínimo y auditado | Migración aprobada y rollout gradual |

Cada entorno usa un proyecto Supabase, credenciales, dominio, Redirect URLs, Resend/SMTP, VAPID, OAuth de Google y clave de cifrado distintos. `SUPABASE_SERVICE_ROLE_KEY`, secretos de email, OAuth y cifrado sólo existen del lado servidor y en el almacén de secretos del entorno.

## Seed mínimo local

`supabase/seed.sql` debe mantener como mínimo dos empresas activas, una suspendida y actores manager, coordinador, instalador, dual y multiempresa. Los tests no dependen de correos, UUID ni datos de producción.

## Responsabilidades

- Producto: acepta requisitos, UAT y activación de funcionalidades visibles.
- Desarrollo: migraciones, compatibilidad, pruebas automatizadas y rollback técnico.
- Operaciones: secretos, backup/PITR, dominio de email, alertas y aprobación de producción.
- QA: evidencia por rol, tenant, idioma, viewport y escenario offline.

Los nombres de las personas responsables se completan antes del primer staging compartido.

## Umbrales iniciales

- Incidentes de aislamiento tenant: 0; cualquier caso detiene el rollout.
- Éxito de comandos online y replay: al menos 99,5 % fuera de errores de validación esperados.
- Edad p95 de outbox online: menor a 5 minutos; dead-letter creciente genera alerta.
- Acción interactiva server-side p95: menor a 1,5 s; dashboard p95: menor a 3 s con dataset de aceptación.
- Conversión, pago, fan-out y comando repetido: 0 efectos duplicados.
- Backfill/cutover: 100 % reconciliado o ambiguos explícitamente excluidos y revisados.
