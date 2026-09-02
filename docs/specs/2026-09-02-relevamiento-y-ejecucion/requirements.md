# Requisitos

Trazan a **REQ-07.1..07.6** y **AC-07-A/B/C** de la spec madre. Cada uno lleva su estado real, verificado contra producción el 02-09-2026.

## Los dos escenarios

1. **Relevamiento como trabajo independiente.** Se solicita, asigna y ejecuta sólo la visita, y el trabajo puede **cerrarse ahí**, sin inventarle una ejecución que no existió. *(REQ-07.2, AC-07-A)* — **Hoy imposible:** el estado `relevamiento` sólo va a `planificada` o `cancelada`, así que para cerrar hay que simular una ejecución completa.
2. **Trabajo con relevamiento incluido.** El relevamiento es una etapa previa y la ejecución no puede empezar hasta que esté aprobado. *(REQ-07.2, REQ-07.5)* — **Parcial:** hay un bloqueo (`needsSurvey`), pero sobre un estado de la orden, no sobre una actividad con vida propia. En la base la regla completa ya existe y está enforced.
3. El tipo de actividad debe estar separado de su estado de lifecycle. *(REQ-07.1)* — **En la base sí** (`activity_type` + `lifecycle`); en la aplicación no existe.

## La revisión del coordinador

4. El relevamiento tiene **borrador, enviado, cambios solicitados y aprobado**, con plantilla, checklist, mediciones, notas y evidencias, **versionadas**. *(REQ-07.3)* — **En la base sí**; la aplicación guarda una nota de texto libre de 3 caracteres mínimos.
5. El coordinador puede **aprobar** o **pedir cambios**, y pedir cambios exige un motivo. Solicitar información adicional, nuevas fotos, nuevas mediciones o una nueva visita son todas la misma decisión con distinto motivo, no cuatro botones distintos.
6. **Quien releva no puede aprobar su propia entrega.** *(REQ-07.6, AC-07-C)* — **Ya está**, y doblemente: un CHECK en la tabla y una validación en el comando.
7. Una decisión no sobrescribe la historia: cada versión se conserva y cada decisión queda registrada. *(AC-07-B)* — **Ya está.**
8. Sólo se decide sobre la **última** versión enviada. — **Ya está.**
9. La aprobación corresponde al **coordinador responsable**, no a la empresa como instancia operativa. — **Hoy no:** cualquiera que pueda operar la orden puede decidir, gerente incluido. Ver DEC-14.

## Fechas

10. La fecha del relevamiento es **opcional** hasta que se pueda definir. — **Ya está.**
11. La fecha de inicio del trabajo es **obligatoria para planificar** su ejecución. — **Ya está:** no se puede pasar a `planificada` sin fecha.
12. La fecha de finalización es **opcional**. — **Ya está.**
13. Las fechas se pueden modificar después. — **Ya está**, y desde el punto 16 además con aviso y plazo.
14. Las fechas del relevamiento y las de la ejecución son **distintas y separadas**. — **En la base sí** (cada actividad tiene las suyas, con zona horaria y precisión); la aplicación tiene un solo par de fechas por orden.

## Convivencia

15. Las 30 órdenes que ya existen tienen que seguir funcionando igual mientras se migra.
16. La empresa tiene que seguir viendo un estado de orden comprensible: el modelo nuevo no puede dejar `work_orders.status` desactualizado.
