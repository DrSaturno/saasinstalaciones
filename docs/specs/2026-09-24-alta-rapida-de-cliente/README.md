# Alta rápida de cliente desde «Nuevo proyecto»

Bloque 1 de [`../2026-09-24-hoja-de-ruta-v2/`](../2026-09-24-hoja-de-ruta-v2/README.md).
Estado (24-09-2026): **implementado; sin verificación visual** (las pantallas están tras el
login). Sin cambios de esquema ni de RLS: producción no se ve afectada por este bloque.

## Contexto

Pedido: en el formulario de «Nuevo proyecto», en el desplegable donde se elige a qué
cliente pertenece, tiene que haber ahí mismo la opción de crear un cliente nuevo.

Hoy quien carga un proyecto de un cliente que todavía no existe tiene que abandonar el
formulario, ir a «Clientes», crearlo, volver y empezar de nuevo.

## Auditoría: qué ya existe

- `ClientDialog` (`components/company/client-dialog.tsx`) ya es el alta y edición completa de
  cliente, con los mismos límites que valida el servidor (`CLIENT_LIMITS`).
- `saveClient` (`lib/actions/clients.ts`) ya crea el cliente; sólo el gerente puede.
- `ProjectFormFields` es el formulario compartido por el alta y la edición de proyecto; el
  selector de cliente era un `<select>` nativo sin estado propio.

## Los tres documentos

- [requirements.md](requirements.md)
- [design.md](design.md)
- [tasks.md](tasks.md)

## Frontera: qué NO toca

- **No crea un alta «mínima» aparte.** Reutiliza el formulario completo de cliente (sólo el
  nombre es obligatorio). Si se quiere una versión de un solo campo, es otro pedido.
- **No cambia quién puede crear clientes:** sigue siendo el gerente.
- **No toca las locaciones del cliente** (bloque 3).
