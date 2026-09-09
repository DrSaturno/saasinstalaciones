# Requisitos

Traza a `R3-AG-06` de la spec madre.

## GCAL-R1 — La empresa conecta su Google

- **GCAL-R1.1** — El gerente conecta su cuenta de Google desde el tablero, sin
  salir de la app ni configurar nada.
- **GCAL-R1.2** — Al conectar, la app **crea un calendario dedicado**
  «Se Instala — {empresa}» en esa cuenta. Las órdenes no se mezclan con la
  agenda personal de nadie.
- **GCAL-R1.3** — Al reconectar, la app **reutiliza** el calendario que ya
  creó para esa empresa en vez de crear otro. Reconectar tres veces no deja
  tres calendarios.
- **GCAL-R1.4** — Desde el tablero se puede abrir ese calendario en Google, en
  un click.
- **GCAL-R1.5** — Desconectar deja de sincronizar y **no borra** el calendario
  ni sus eventos: lo que ya se agendó sigue estando.
- **GCAL-R1.6** — Si falta configuración, la app lo dice y no ofrece conectar.
  Nunca ofrece algo que va a fallar.
- **GCAL-R1.7** — Hay **una sola conexión por empresa**. Si otro gerente de la
  misma empresa entra al tablero, ve que ya está conectada y con qué cuenta, no
  el botón de conectar. → DEC-GCAL-06

## GCAL-R2 — Las órdenes llegan al calendario de la empresa

- **GCAL-R2.1** — Toda orden con fecha programada aparece como evento, con
  número de orden, título, proyecto, dirección del sitio y link a la orden.
- **GCAL-R2.2** — Cancelar una orden borra su evento.
- **GCAL-R2.3** — El gerente puede mandar **una orden puntual** al calendario
  sin sincronizar todas.
- **GCAL-R2.4** — Sincronizar dos veces no duplica eventos.

## GCAL-R3 — Calendarizar sin conectar nada

El caso del instalador, y también el del gerente apurado.

- **GCAL-R3.1** — Desde una orden, cualquiera puede agendarla en **su propio**
  Google Calendar **sin conectar la cuenta ni dar permisos**.
- **GCAL-R3.2** — El evento se abre con los datos ya cargados: número de
  orden, título, fecha, dirección del sitio y link a la orden.
- **GCAL-R3.3** — Funciona en el celular y **no depende de la cola offline**:
  es navegación, no una mutación que haya que encolar.
- **GCAL-R3.4** — El instalador tiene ese botón en la orden, junto a
  «Aceptar».
- **GCAL-R3.5** — El botón sólo aparece si la orden tiene fecha. Sin fecha no
  hay nada que agendar.

## Criterios de aceptación

- **AC-GCAL-A** — Un gerente que conecta por primera vez termina con un
  calendario nuevo en su Google llamado «Se Instala — {empresa}», vacío o con
  las órdenes ya programadas, y su agenda personal intacta.
- **AC-GCAL-B** — Desconectar y volver a conectar deja **un** calendario, no
  dos, y los eventos anteriores siguen mapeados.
- **AC-GCAL-C** — Un instalador sin cuenta de Google conectada, desde su
  celular, agenda una orden asignada en dos toques.
- **AC-GCAL-D** — Sin las variables de entorno cargadas, ningún botón de
  Google aparece roto: o no está, o explica que falta configurar.
