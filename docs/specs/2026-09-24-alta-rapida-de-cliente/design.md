# Diseño

## CLIALTA-DEC-01 — Se reutiliza `ClientDialog`, en modo controlado

`ClientDialog` gana tres props opcionales: `open`, `onOpenChange` y `onSaved`. Con `open`
definido no dibuja botón propio y lo abre quien lo usa. Sin esas props se comporta igual que
antes (así la pantalla «Clientes» no cambia).

**Por qué no un mini-formulario nuevo:** duplicaría campos y límites que ya viven en
`CLIENT_LIMITS`, y un cliente creado «a medias» desde acá tendría que completarse igual en otra
pantalla.

## CLIALTA-DEC-02 — `saveClient` devuelve el cliente guardado

Para poder elegirlo, quien abrió el alta necesita su `id`. `ClientActionState` suma
`client?: { id, name }`; el insert y el update piden `id, name` de vuelta. Un update que no
encuentra la fila ahora devuelve error en lugar de un «ok» silencioso.

## CLIALTA-DEC-03 — El selector pasa a estar controlado

`ProjectFormFields` guarda `clientId` en estado. La opción especial no cambia ese estado: sólo
abre el diálogo. Así, cancelar deja todo como estaba y el valor reservado nunca llega a
`FormData` (CLIALTA-R2.1). Los clientes recién creados se suman a la lista local aunque la
página todavía no haya recargado la suya; se deduplican por `id` cuando llega la lista nueva
(`router.refresh()` la trae).

## CLIALTA-DEC-04 — Diálogo dentro de un diálogo, formulario dentro de un formulario

El alta de cliente lleva su propio `<form>` y se abre desde adentro del `<form>` del proyecto.
Radix renderiza el contenido del diálogo en un portal, así que en el DOM **no** quedan
formularios anidados, y React 19 ejecuta la acción sólo del formulario que se envió. Está
cubierto por una prueba que envía el alta y comprueba que el proyecto no se envía.

## Riesgo abierto

Verificación visual pendiente: foco al abrir/cerrar el diálogo anidado y comportamiento en
pantalla chica. La prueba automática cubre la lógica, no el aspecto.
