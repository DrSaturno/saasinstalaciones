# Runbook de release y rollback

## Antes de migrar

1. Confirmar CI verde, UAT de staging, responsable y ventana.
2. Registrar commit, migraciones incluidas, flags afectados y consultas de reconciliación.
3. Verificar backup/PITR de Supabase y exportar configuración de flags.
4. Confirmar que la migración es expansiva y compatible con el build anterior.
5. Ejecutar pgTAP/RLS con empresa A/B y actores dual/multiempresa.

## Despliegue

1. Aplicar migraciones expansivas.
2. Ejecutar backfill reanudable y guardar conteos/ambiguos.
3. Desplegar el build con la funcionalidad desactivada.
4. Habilitar primero una empresa canary interna.
5. Observar errores, latencia, outbox, divergencias y accesos denegados anómalos.
6. Ampliar sólo después de reconciliar el canary.

## Rollback

- Código: desactivar el flag y volver al último build compatible.
- Datos: no eliminar tablas/columnas nuevas durante la fase expand; el build anterior sigue usando su proyección legacy.
- Backfill: detener el cursor y conservar el reporte; corregir y reanudar de forma idempotente.
- Incidente de privacidad/integridad: detener rollout, revocar sesiones/URLs afectadas, preservar evidencia y restaurar por PITR sólo con alcance confirmado.
- Una migración contractiva se realiza en una release posterior y nunca es el mecanismo de rollback inmediato.

## Punto de restauración previo a este lote

- Rama: `backup/pre-sdd-20260805`
- Tag: `backup-pre-sdd-20260805-d4a5e7c`
- Commit: `d4a5e7c65376884975af905b9d7b93d417114a7f`

Este punto recupera el código. Los datos de un ambiente ya migrado se recuperan mediante compatibilidad expand/contract o el backup/PITR específico de ese ambiente.

## Evidencia obligatoria

Adjuntar commit/build, entorno, flags, migraciones, resultados de CI/pgTAP/E2E, conteos antes/después, consultas de reconciliación, capturas UAT, métricas del canary, decisión de continuar y responsable.
