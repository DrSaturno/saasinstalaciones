# Diseño

## DEC-MAPA-01 — API JS de Google directa, sin librería nueva

Se construye sobre `google.maps.Map` cargado por script, no sobre un wrapper
de React (`@vis.gl/react-google-maps` u otro).

**Por qué:** lo que hace falta es acotado — un mapa, N marcadores, encuadrar,
click ↔ selección — y ya existe el patrón en el repo de envolver una API
externa en un cliente delgado (`lib/weather/forecast.ts`). Sumar una
dependencia para esto sería la abstracción prematura que las reglas del
proyecto piden evitar. El costo es escribir el loader del script e integrarlo
con React a mano; es chico y queda en un solo hook.

## DEC-MAPA-06 — `callback` clásico, no `importLibrary`

La primera versión pedía el script con `?loading=async` y llamaba a
`google.maps.importLibrary("maps")`. Reventaba siempre, con cualquier clave:
`importLibrary` sólo queda definido si se implementa el "bootstrap loader"
completo que Google documenta —un wrapper que hay que declarar ANTES de pedir
el script—; pedirlo por URL sola nunca lo define.

Se reemplaza por el parámetro `callback` clásico (`?callback=nombreDeFuncion`),
que existe hace más de una década: Google invoca esa función recién cuando
`google.maps.*` está completamente listo. No hace falta el wrapper de
`importLibrary` porque, por `DEC-MAPA-02`, el mapa sólo usa objetos clásicos.

## DEC-MAPA-02 — Marcador clásico, no `AdvancedMarker`

Se usa `google.maps.Marker`, no la API nueva de marcadores avanzados.

**Por qué:** `AdvancedMarker` exige provisionar un **Map ID** en Google Cloud
Console, un paso de configuración extra sin el que directamente no renderiza.
El marcador clásico sigue soportado, no lo requiere, y para pines de color
sólido —sin ícono personalizado ni clustering— no hay diferencia visible. Si
más adelante hace falta clustering o marcadores con foto, ahí se justifica
migrar.

## DEC-MAPA-03 — Los pines usan los mismos colores que ya existen

El color de cada pin sale de `--status-*` (`app/globals.css`), la misma
paleta que ya pinta `StatusBadge`. No se inventa una paleta nueva para el mapa.

**Por qué:** el mapa y la lista de al lado describen lo mismo. Si el mapa
usara sus propios colores, "rojo" podría significar una cosa en la lista y
otra en el mapa, y quien lo mira tendría que aprender dos códigos.

## DEC-MAPA-04 — El encuadre se calcula de los pines válidos

`LatLngBounds` se arma sólo con las locaciones que tienen `lat`/`lng`; las que
no, se listan igual (ya lo hacían) pero no participan del encuadre ni ponen
pin. Con cero pines válidos, el mapa cae al comportamiento de vacío que ya
existe (`emptyMap`).

## DEC-MAPA-05 — La clave es pública a propósito, y hay que restringirla

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` lleva el prefijo público porque el mapa
corre en el navegador: no hay forma de ocultarla ahí, igual que la de
Supabase. La protección real no es esconderla —no se puede— sino **restringir
en Google Cloud Console** qué dominios pueden usarla (HTTP referrers:
`seinstala.com.ar`, `www.seinstala.com.ar`, y `localhost` para desarrollo) y a
qué API alcanza (sólo Maps JavaScript API). Documentado en `tasks.md` como
paso de Nicolás, igual que se hizo con Calendar.

**No es la misma clave ni el mismo proyecto de OAuth que Google Calendar.**
Maps JavaScript API es un producto distinto, con su propia cuota (gratuita
hasta un volumen alto por mes) y sin superposición de scopes ni de
credenciales.
