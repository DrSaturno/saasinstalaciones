# Diseño

## La decisión que ordena todo: el vencimiento se deriva

No hay ninguna columna "vencido" en la base y no la va a haber.

El requisito prohíbe penalizar a alguien por exceder un plazo que no le fue comunicado. Si el vencimiento lo escribiera un job programado, entonces un job que no corre —o que corre tarde, o dos veces— cambiaría el resultado: alguien quedaría penalizado por una falla de infraestructura. Al calcularlo al leer, desde `notified_at` más el calendario, el estado es el mismo lo mire quien lo mire y cuando lo mire, y se puede probar sin reloj ni scheduler.

La consecuencia práctica es que el job queda reducido a las dos cosas que sí necesitan un reloj —mandar el recordatorio y materializar el evento "no respondió"— y ambas son idempotentes. La corrección no depende de que corra a horario.

Un test pgTAP afirma que esa columna no existe, porque es una decisión fácil de deshacer sin darse cuenta.

## Modelo de datos

### `order_reschedules`

Una fila por reprogramación, no un contador. `work_orders.reschedule_count` ya existía y sigue sirviendo para el tablero, pero un número no puede decir cuándo se avisó ni qué contestó el instalador.

- `notified_at` es **nullable y distinto de `created_at`**. Es la compuerta: mover la fecha no arranca ningún plazo; avisarle al instalador sí.
- `calendar_country`, `calendar_timezone` y `response_window_days` quedan congelados en la fila al notificar. Es lo que pide ADR-009: calendario, zona horaria y feriados usados se versionan junto al deadline, así una corrección posterior de un feriado no reescribe un plazo ya comunicado.
- `superseded_at` marca la pregunta que quedó sin sentido porque la empresa volvió a mover la fecha. No se borra: el historial tiene que mostrar que hubo dos movimientos, y una pregunta superada no vence ni penaliza.
- Índice único parcial: una sola pregunta abierta por orden. Dos plazos simultáneos sobre la misma orden no significan nada.

### `order_cancellation_requests`

Es el **pedido**, no la cancelación. La orden se cancela recién cuando el pedido se aprueba.

- `scheduled_date_at_request` es la foto del momento. Si la empresa reprograma después, no puede reescribir hacia atrás si la baja se pidió en plazo.
- `within_notice` se calcula al insertar con el calendario vigente y se guarda. Derivarlo después daría otro resultado en cuanto cambie un feriado.
- `auto_approved` es el estado de las pedidas dentro del plazo: el requisito es explícito en que no afectan la confiabilidad, así que no van a revisión humana. La revisión existe para las de fuera de plazo que alegan una excepción.

### `non_working_days`

`company_id` nulo es un feriado nacional, compartido por todas las empresas del país; con valor, un día que esa empresa no trabaja. Duplicar un feriado nacional por empresa sería el modelo equivocado: son el mismo hecho.

Los feriados nacionales no se editan desde la aplicación — no hay política de escritura que los alcance. Lo que sí puede cargar cada gerente son sus propios días, que es donde entran los puentes fijados por decreto cada año.

### `installer_reliability_events` y su proyección *(fase 4)*

Eventos versionados con `reverted_at` / `reverted_by`. Un evento nunca se borra: se revierte, y la reversa queda auditada. La proyección guarda `formula_version`, `sample_size`, `window_days` y el desglose explicable.

## Resolución de permisos

El gerente **no** se resuelve con `auth_companies` ni `auth_has_company_role`. `company_membership_roles.role` sólo admite `installer` y `coordinator`, así que preguntar ahí por `company_manager` no matchea nunca y la política queda muerta. La pertenencia del gerente vive en su perfil y se lee con `auth_role()` + `auth_company()`, el mismo par que usa `work_orders_company_all`.

Los instaladores sí van por `auth_companies`, que exige fila en las dos tablas de membresía más empresa activa.

## Calendario y zona horaria

`lib/domain/business-days.ts` ya implementaba la aritmética con feriados; lo que faltaba era llenar el calendario y conectarlo. `lib/data/business-calendar.ts` lo carga y `lib/domain/reschedule.ts` deriva el estado.

`dateKeyInTimeZone` existe porque `notified_at` es un `timestamptz` y el plazo se cuenta en días: un aviso de las 22:00 en Buenos Aires ya es el día siguiente en UTC, y tomar el día UTC le correría el plazo un día entero.

Los feriados trasladables argentinos se siembran **ya movidos** según la Ley 27.399 art. 7 (martes/miércoles al lunes anterior; jueves/viernes al lunes siguiente). Los puentes turísticos no se siembran: los fija un decreto distinto cada año. Un puente faltante alarga el plazo del instalador, nunca lo acorta, así que el error queda del lado indulgente.

## Modo sombra

La fase 4 calcula y muestra; no castiga. ADR-011 y DEC-08 lo exigen y Nicolás lo confirmó el 01-09-2026. El efecto sobre prioridad, cantidad o disponibilidad de ofertas es una fase aparte con aprobación explícita.

## Agendado: fuera de las migraciones, a propósito

`create extension pg_cron` en una migración obligaría a CI a levantar la
extensión en cada corrida desde cero, y ése es exactamente el tipo de
dependencia implícita que en agosto había vuelto irreproducible el esquema. Así
que el agendado se hace **a mano en producción, una sola vez**, y queda anotado
acá porque si no vive en el repositorio no existe para nadie más.

Aplicado en producción (`rpdjjvcmtcpvmwrjqhke`) el 01-09-2026:

```sql
create extension if not exists pg_cron;

select cron.schedule(
  'reliability-jobs',
  '0 12 * * *',
  $$select public.run_reliability_jobs()$$
);
```

12:00 UTC son las 09:00 en Buenos Aires: el recordatorio llega a la mañana y no
de madrugada. Una vez por día alcanza porque la ventana del recordatorio tiene
dos días hábiles de ancho y el job es idempotente.

**Demo no tiene el job agendado**, y está bien: las funciones existen y se
prueban llamándolas, que es lo que hace el test. Correrlo automáticamente sobre
datos de prueba sólo generaría ruido.

Para verificar que sigue vivo:

```sql
select jobname, schedule, active from cron.job where jobname = 'reliability-jobs';
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'reliability-jobs')
order by start_time desc limit 5;
```

## Fases

| Fase | Entrega | Estado |
|---|---|---|
| 0 | Tablas de flujo, calendario, estado derivado, pgTAP | Hecha |
| 1 | Reprogramación atómica con notificación y `notified_at` | En curso |
| 2 | Respuesta del instalador, plazo visible, conflicto con otras órdenes | |
| 3 | Baja pedida por el instalador y revisión del gerente | |
| 4 | Índice de confiabilidad en modo sombra y transparencia | |
| 5 | Recordatorios, vencimientos y —sólo con aprobación— efecto sobre ofertas | |

La fase 2 es correcta sin la 5: el plazo vence bien porque es derivado; lo que falta hasta la 5 es el recordatorio previo.
