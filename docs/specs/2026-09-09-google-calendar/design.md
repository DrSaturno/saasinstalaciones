# Diseño

## DEC-GCAL-01 — Calendario dedicado, no la agenda personal

Hoy el callback guarda `calendar_id: "primary"`: las órdenes caen en la agenda
personal de quien conecta, entre sus cumpleaños y sus turnos médicos. Pasa a
crearse un calendario propio, «Se Instala — {empresa}», vía `calendars.insert`.

**Por qué:** separa lo laboral de lo personal, se puede ocultar de un click sin
perder nada, y —lo que importa a futuro— **es la única forma de poder
compartirlo después**. Un calendario primario no se comparte sin exponer toda
la vida privada del dueño.

La identificación del calendario ya creado no se hace por nombre, que el
usuario puede renombrar, sino por el `calendar_id` guardado en
`calendar_connections.calendar_id`. Si ese id ya no existe en Google (lo
borraron), se crea uno nuevo. `GCAL-R1.3`.

## DEC-GCAL-02 — Se amplía el permiso a `calendar`, y eso obliga a reconectar

`calendar.events` alcanza para escribir eventos, no para **crear un
calendario**. Hace falta `https://www.googleapis.com/auth/calendar`.

**Consecuencia asumida:** quien ya tenga una conexión con el permiso viejo
tiene que reconectar. Hoy no hay ninguna conexión activa —la integración nunca
estuvo configurada— así que el costo real es cero, pero queda escrito porque
deja de serlo en cuanto alguien conecte.

**Segunda consecuencia, más cara:** `calendar` es un permiso *sensible* para
Google y pesa más en la verificación de la app. Ver "Lo que bloquea de verdad".

## DEC-GCAL-03 — El instalador calendariza por link, no por OAuth

Se evaluaron los dos caminos y se eligió el link (`GCAL-R3`), que abre Google
Calendar con el evento precargado en la URL. La sincronización real por
instalador queda como fase 2.

**Por qué no OAuth ahora, en orden de peso:**

1. **El tope de 100 usuarios de prueba.** Mientras la pantalla de
   consentimiento esté en modo Testing, Google admite 100 usuarios cargados a
   mano, uno por uno, por email. Una app cuyo negocio es coordinar cuadrillas
   grandes llega a ese techo enseguida, y cuando llega **deja de funcionar
   para los usuarios nuevos**: los que más necesitan que ande.
2. **La PWA es offline-first.** Un flujo que redirige a Google y vuelve
   necesita conectividad justo cuando el instalador está en la calle. El link,
   en cambio, es navegación: si no hay señal no abre, y no hay estado roto que
   reconciliar después.
3. **Multiplica el material sensible.** Cada instalador conectado son dos
   tokens cifrados más que hay que guardar, renovar y revocar.

**Lo que se pierde, dicho sin maquillar:** el evento es una copia. Si después
reprograman la orden, el calendario del instalador queda con la fecha vieja. Lo
amortigua —no lo resuelve— que la reprogramación ya le llega por notificación y
push, así que se entera por otro canal.

## DEC-GCAL-04 — No se comparte el calendario automáticamente

El pedido inicial fue "un calendario compartido de la empresa para que vean
todos". **Se decidió no hacerlo**, y el motivo no es de esfuerzo.

Un calendario compartido de Google es **todo o nada**: no sabe de permisos.
Compartirlo con un instalador le da acceso a **todas** las órdenes de la
empresa —direcciones de clientes, trabajos de sus compañeros— cuando el modelo
de la app dice que un instalador ve sólo lo suyo, y eso está sostenido por RLS
en la base. Google no puede aplicar esa regla y no hay forma de enseñársela.
Compartir sería abrir por la ventana lo que la app cierra por la puerta.

**Lo que no se pierde:** un calendario dedicado se puede compartir después, a
mano, desde Google, con quien se quiera. La decisión es reversible sin tocar
código: por eso se toma la conservadora.

Para ver el trabajo del equipo dentro del producto ya están `/agenda`
(empresa) y `/schedule` (instalador), que sí respetan los permisos.

## DEC-GCAL-06 — Una conexión por empresa, no por usuario

`calendar_connections` tiene hoy `unique (user_id)` y su RLS exige
`user_id = auth.uid()`: la conexión es de la persona. Pasa a ser
`unique (company_id)`, y la RLS a mirar sólo la empresa y el rol.

**El bug que evita:** con dos gerentes en la misma empresa, cada uno conectando
su Google, quedaban **dos calendarios con las mismas órdenes duplicadas**, y
ninguno de los dos veía el del otro (la RLS se lo ocultaba). Nadie hacía nada
mal y el resultado era incoherente igual.

Si la decisión es que el calendario es *de la empresa* (`DEC-GCAL-01`), la
conexión también tiene que serlo. El primero que conecta la deja armada; los
demás gerentes ven quién la conectó, en vez del botón.

**Lo que se acepta a cambio:** cualquier gerente de la empresa puede
desconectar la conexión que armó otro. Es deliberado —desconectar el calendario
de la empresa es una acción de empresa— y no expone nada: los tokens siguen
cifrados y nadie los ve, sólo se los puede borrar.

## DEC-GCAL-05 — Los eventos siguen siendo all-day

No se cambian a eventos horarios. `R3-AG-06` pide "eventos horarios opt-in" y
sigue abierto: cerrarlo exige decidir qué hora es la de una orden que hoy sólo
tiene fecha, y eso es dominio, no calendario. Esta spec no lo toca.

## Lo que bloquea de verdad, y no es código

Ninguna de estas dos cosas se arregla programando:

1. **Las tres variables de entorno.** Sin ellas no hay nada que probar.
2. **La verificación de Google.** Con permisos sensibles y la app en modo
   Testing, **los refresh tokens caducan a los 7 días**: la conexión se corta
   sola cada semana. Para uso real hay que publicar la app y pasar la
   revisión, que puede tardar semanas. Conviene empezarla antes de necesitarla.
