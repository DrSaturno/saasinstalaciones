# Requisitos

Trazan a **REQ-06.1..06.9** de la spec madre. Acá se enuncian en términos de lo que tiene que poder hacer cada actor, que es lo que después se prueba.

## Reprogramación

1. Mover la fecha de una orden asignada debe registrar quién la movió, la fecha anterior y la nueva, y dejar al instalador con una respuesta pendiente. *(REQ-06.1)*
2. El plazo de dos días hábiles para responder empieza **sólo cuando la notificación in-app queda persistida**, no cuando se cambia la fecha. Una falla de push o de email no puede hacer correr el plazo ni duplicar la revisión. *(REQ-06.2, AC-06-A)*
3. El instalador debe poder **aceptar** (sigue en el trabajo) o **darse de baja** (se desvincula) dentro del plazo, y en ninguno de los dos casos se afecta su confiabilidad. *(REQ-06.2)*
4. Sólo la **falta de respuesta** posterior a una notificación correctamente hecha puede afectar el nivel. *(REQ-06.2)*
5. El instalador debe recibir un recordatorio antes de que venza el plazo. *(REQ-06.2)*
6. Antes de confirmar, el instalador debe poder ver si la fecha nueva **choca con otra orden que ya tenga aceptada**. *(REQ-06.2)*
7. Si la empresa vuelve a mover la fecha antes de que el instalador conteste, la pregunta anterior deja de correr y no penaliza.

## Baja pedida por el instalador

8. El instalador debe poder **solicitar la baja** de una orden asignada. Hoy no puede: `cancelada` sólo la alcanzan gerente y coordinador. *(REQ-06.3)*
9. Pedirla con al menos **dos días hábiles de anticipación al inicio programado** no genera penalización ni requiere revisión. *(REQ-06.4, DEC-07)*
10. Fuera de ese plazo, el pedido debe capturar **motivo tipificado, justificación y evidencia opcional**, y pasar por revisión humana antes de cualquier consecuencia. *(REQ-06.3)*
11. Una baja justificada aprobada no genera penalización; si ya existía un evento, se revierte con otro evento auditable. *(AC-06-B)*
12. La revisión es potestad del **gerente**. El coordinador ve, no resuelve.

## Plazos y calendario

13. Días hábiles, feriados, zona horaria, inicio de cada plazo y consecuencia del silencio deben ser reglas **versionadas y testeables**. *(REQ-06.5)*
14. El calendario aplicado a un plazo ya notificado no se recalcula por atrás si después se corrige un feriado.
15. Una empresa debe poder cargar sus propios días no laborables (puentes por decreto, feriados provinciales, cierres) sin que se filtren a otra empresa.

## Índice de confiabilidad

16. Debe derivarse de **eventos inmutables y reversibles**, nunca de un contador sobrescrito. *(REQ-06.6)*
17. Debe considerar trabajos aceptados y completados, bajas dentro y fuera de plazo, bajas justificadas, respuestas a reprogramaciones, cumplimiento de plazos, incumplimientos, historial general y comportamiento reciente.
18. Recalcular con los mismos eventos debe dar el mismo resultado. *(ADR-011)*
19. **No se aplica ninguna penalización visible** hasta que la prueba de notificación, la agenda y la revisión funcionen y el cálculo haya corrido en modo sombra. *(REQ-06.7, DEC-08)*
20. Si se activa, debe ser progresiva según recurrencia y comportamiento reciente, con duración e impacto explicables, y permitir recuperación por nuevos cumplimientos. *(REQ-06.8)*
21. El instalador debe ver qué evento afectó su nivel, la regla aplicada, el trabajo relacionado, la fecha, el impacto, la duración estimada y cómo recuperarlo. *(REQ-06.9)*
22. Una empresa externa nunca ve el motivo sensible, el cliente, la dirección ni la OT de terceros. *(AC-06-C)*
