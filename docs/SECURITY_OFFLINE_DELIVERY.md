# Entrega de seguridad y trabajo offline — 7 de septiembre de 2026

Este documento registra el bloque de implementación que estaba en curso al
retomar la auditoría. No representa el cierre de todas las etapas del informe.

## Cambios terminados en código

- **Alta de usuarios:** la migración `20260907000000_trusted_account_provisioning.sql`
  deja de tomar `role` y `company_id` de `raw_user_meta_data`. El registro normal
  crea un instalador; los roles elevados requieren metadatos controlados por el
  administrador o una escritura privilegiada explícita.
- **Alta de empresas:** el API maestro provisiona el perfil del gerente con su
  empresa antes de entregar la invitación. Comprueba el resultado y compensa el
  alta si ese paso o la limpieza del perfil temporal falla.
- **Verificación en dos pasos:** las acciones de negocio usan
  `getAuthorizedUser`. El API maestro comprueba MFA antes de construir el cliente
  privilegiado. Una consulta fallida o incompleta de MFA deniega la operación.
  El enrolamiento continúa siendo opt-in. Recuperación, inicio y cierre de sesión
  y los comandos para completar MFA conservan sus flujos de Auth.
- **Salida con trabajo pendiente:** se cuentan operaciones, rechazos pendientes
  y fotos locales antes de salir. La persona puede continuar, sincronizar o
  descartar explícitamente. La limpieza vuelve a comprobar los pendientes dentro
  de la transacción de IndexedDB. Si no puede limpiar, conserva la sesión y la
  marca de propietario. El cambio de cuenta mantiene el aislamiento previo.
- **Idiomas:** el diálogo tiene textos en español y portugués.

Los fixtures SQL y el seed usan metadatos de aplicación para provisionar sus
cuentas de prueba. Se conservaron los metadatos de proveedor e identidad del seed.
La nueva prueba SQL conserva intencionalmente metadatos de usuario falsificados
para comprobar que no permitan elevar privilegios.

## Verificación

| Comprobación | Resultado |
|---|---|
| TypeScript sin emisión | Correcto |
| ESLint | Correcto |
| Vitest | 66 archivos, 481 pruebas aprobadas |
| Interacción del diálogo en JSDOM | 7 casos aprobados, incluidos reintento, descarte y fallas |
| Build en copia aislada, sin archivos de entorno | Compilación, TypeScript y generación de 39 páginas correctos; empaquetado `standalone` incompleto por `EPERM` de Windows al resolver dependencias enlazadas |
| pgTAP y Auth contra Supabase | Pendientes: no hay un entorno aislado de Supabase/Docker disponible aquí |
| Aplicación de la migración y despliegue | No ejecutados |

Vitest se ejecutó con la API programática y los mismos patrones/aliases del
proyecto, sin cargar archivos de entorno. La compilación aislada no equivale a
un artefacto de producción verificado. Las pruebas SQL agregadas no se presentan
como ejecutadas.

## Condiciones de publicación

Publicar primero el código del alta de empresas: funciona tanto con el trigger
anterior como con el nuevo. Después, en un entorno de prueba, aplicar la migración,
regenerar los tipos con el CLI y ejecutar `scripts/narrow-database-types.mjs`,
pgTAP y el alta completa de una empresa. Esta migración modifica el cuerpo y los
permisos de una función trigger existente; no introduce columnas ni una nueva
firma de RPC para la aplicación.

La corrección del registro directo sólo protege una base cuando la migración
está aplicada. Ninguna base remota fue modificada durante este trabajo.

## Trabajo que continúa pendiente del informe

- Protección de columnas financieras y refuerzo de MFA directamente en las
  políticas/RPC de Supabase. Las guardas de Next no sustituyen esos controles.
- Transacción única para altas/ediciones de órdenes, condiciones y agenda, y
  resolución de las divergencias de fecha observadas en la auditoría.
- Contrato y corrección de métricas; rediseño del home del gerente.
- Calendar por empresa, selección de calendario, actividades, cola de
  sincronización e invitaciones. Los cambios en Calendar de este lote sólo
  agregan la comprobación de MFA al acceso existente.
- Coordinación de la cola offline entre pestañas, dependencias entre operaciones,
  reintentos de notificaciones y observabilidad.

Los cambios están en el directorio de trabajo, sin commit, push ni despliegue.
