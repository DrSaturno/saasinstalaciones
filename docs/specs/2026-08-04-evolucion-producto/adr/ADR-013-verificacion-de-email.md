# ADR-013 — Activación y verificación de email

- Estado: Aceptado
- Fecha: 2026-08-05
- Decisión relacionada: DEC-14

## Decisión

El acceso normal requiere un email verificado. Una invitación de un solo uso enviada a la misma casilla puede actuar como prueba de posesión sólo al consumirse correctamente; crear el usuario antes de aceptar no lo activa y un fallo intermedio debe compensarlo. Altas administrativas no omiten verificación: envían enlace de activación y permanecen pendientes.

Redirect URLs se restringen por entorno y el origen de aplicación se valida. Tokens no se registran ni se exponen en errores. Recuperación de contraseña no revela si una cuenta existe. La entrega se configura por separado en dev, staging y producción con dominio autenticado.

## Consecuencias y verificación

Se requiere E2E real de invitación, activación, token vencido/reutilizado y recuperación. Sin credenciales SMTP/dominio, el código puede quedar listo pero el gate operativo permanece abierto.
