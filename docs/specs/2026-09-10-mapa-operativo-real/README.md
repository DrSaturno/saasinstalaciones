# Mapa operativo: pines reales en vez de un punto a la vez

## Contexto

El bloque "Mapa operativo" del tablero de gerente (`DashboardMap`) es hoy un
`<iframe>` de Google Maps en modo búsqueda (`q=...&output=embed`). Ese modo
sólo puede centrarse en **un lugar a la vez** — es la misma tecnología que un
botón "cómo llegar", no un mapa interactivo.

Con 5 (o 200) locaciones programadas en la semana, el resultado es: se ve la
que está seleccionada en la lista, y nada más. No hay forma de ver el circuito
completo de un vistazo, que es justamente lo que un mapa operativo tiene que
resolver.

## Auditoría: qué ya existe

- `lib/data/dashboard.ts` ya arma `mapSites`: cada orden programada trae
  `lat`, `lng`, dirección, número, estado y fecha. **El dato ya está**, el
  problema es sólo cómo se dibuja.
- `lib/google-calendar/` usa `google-auth-library` para OAuth — no sirve para
  esto. Mapas es una API de Google totalmente distinta, sin superposición de
  credenciales ni de cuota.
- No hay ninguna librería de mapas instalada.
- 13 de las 30 locaciones activas en Producción no tienen dirección ni
  coordenadas cargadas (verificado por SQL). Esas van a seguir sin verse
  aunque el mapa se arregle: decisión explícita de Nicolás, completarlas a
  mano por ahora — ver `tasks.md`.

## Los tres documentos

- [requirements.md](requirements.md)
- [design.md](design.md)
- [tasks.md](tasks.md)

## Frontera: qué NO toca

- **No geocodifica direcciones de texto a coordenadas.** Evaluado y
  descartado por ahora (decisión explícita): agregaría una API y un costo por
  consulta nuevos. Si una locación no tiene `lat`/`lng`, no se dibuja — igual
  que hoy.
- **No optimiza el orden del circuito** (ruta más corta, tráfico). Es
  `FUT-05`/optimización vial en la spec madre, y queda fuera.
- **No cambia el mapa del instalador en la app móvil**, si existiera uno
  aparte. Sólo el bloque del tablero de gerente.
- **No completa las 13 locaciones sin dirección.** Es trabajo de datos, no de
  código, y queda para Nicolás.
