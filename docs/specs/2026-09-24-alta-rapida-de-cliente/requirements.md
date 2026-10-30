# Requisitos

## CLIALTA-R1 — Crear el cliente sin salir del formulario

- **CLIALTA-R1.1** — El desplegable de cliente del formulario de proyecto tiene, al final de
  la lista, la opción «＋ Crear cliente nuevo…».
- **CLIALTA-R1.2** — Elegirla abre el alta de cliente encima del formulario, sin perder lo ya
  cargado del proyecto.
- **CLIALTA-R1.3** — Al guardar el cliente, queda en la lista y **ya elegido** en el proyecto.
- **CLIALTA-R1.4** — Cancelar o cerrar el alta deja el formulario exactamente como estaba: el
  cliente que hubiera elegido antes sigue elegido.

## CLIALTA-R2 — No se rompe lo existente

- **CLIALTA-R2.1** — La opción especial **nunca** viaja como valor del campo `clientId`.
- **CLIALTA-R2.2** — Sólo la ve quien puede crear clientes (el gerente).
- **CLIALTA-R2.3** — Si el alta falla, el error se muestra en el alta y el cliente del proyecto
  queda sin cambios.
- **CLIALTA-R2.4** — La pantalla «Clientes» conserva su alta y edición tal como estaban.

## Criterios de aceptación

- **AC-CLIALTA-A** — Con el formulario de proyecto a medio llenar, crear un cliente desde el
  desplegable deja el resto de los campos intactos y el cliente nuevo elegido.
- **AC-CLIALTA-B** — Cancelar el alta no cambia el cliente elegido ni deja el desplegable en la
  opción especial.
- **AC-CLIALTA-C** — El envío del proyecto lleva el `id` real del cliente nuevo, nunca el valor
  reservado.
