# Tareas

## Fase 0 — Config

- [x] **MAPA-CFG-01** — `googleMapsConfigured()` en un módulo nuevo
  `lib/google-maps/config.ts`, mismo patrón que
  `googleCalendarConfigured()`. → MAPA-R3.1
- [x] **MAPA-CFG-02** — `.env.example`: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.

## Fase 1 — El mapa en sí

- [x] **MAPA-UI-01** — `useGoogleMapsScript()`: carga el script una sola vez
  (con caché entre montajes), expone `loaded`/`error`. → DEC-MAPA-01
- [x] **MAPA-UI-02** — `OperationalMap`: crea el `google.maps.Map`, un
  `Marker` por locación con `lat`/`lng`, color por `--status-*`.
  → MAPA-R1.1, MAPA-R1.3, DEC-MAPA-02, DEC-MAPA-03
- [x] **MAPA-UI-03** — `fitBounds` sobre los marcadores válidos al cargar y
  cuando cambia el conjunto de locaciones. → MAPA-R1.2, DEC-MAPA-04
- [x] **MAPA-UI-04** — Click en un pin selecciona la orden (mismo estado que
  hoy usa la lista) y centra/resalta. → MAPA-R2.2
- [x] **MAPA-UI-05** — Elegir en la lista mueve el foco/resalta el pin
  correspondiente. → MAPA-R2.1
- [x] **MAPA-UI-06** — Sin API key configurada, el bloque muestra el aviso de
  configuración en vez de intentar cargar el script. → MAPA-R3.1, AC-MAPA-C
- [x] **MAPA-UI-07** — Reemplaza el `<iframe>` de `DashboardMap`, conservando
  la lista lateral, el link "Abrir en Google Maps" y el estado vacío
  (`emptyMap`) tal como están.

## Fase 1b — CSP (descubierto en producción)

- [x] **MAPA-CSP-01** — Sumar los dominios de Google Maps a la CSP de
  `next.config.ts`: `script-src`, `img-src`, `style-src`, `font-src` y
  `connect-src`. Sin esto el navegador bloquea el script y el mapa no carga.

## Fase 2 — Cierre

- [x] **MAPA-QA-01** — `type-check`, `lint`, `test`, `build`.
- [ ] **MAPA-QA-02** — Verificar en navegador contra producción, con la API
  key cargada: los pines de la semana aparecen juntos, clic en lista mueve
  el mapa, clic en pin selecciona la orden.

## Fuera de alcance, a propósito

- **Geocodificar direcciones sin coordenadas.** Ver `README.md`. Decisión
  explícita de Nicolás: por ahora se completan a mano.
- **Clustering de pines.** Con 200 locaciones muy cercanas entre sí podría
  hacer falta agrupar visualmente; no hace falta para el volumen actual y se
  evalúa si aparece el caso.
- **Optimizar el orden del recorrido.** Es `FUT-05` en la spec madre.

## Gaps reales, documentados y no cerrados

- **13 de 30 locaciones activas en Producción no tienen `lat`/`lng` ni
  dirección** (verificado por SQL antes de esta spec). Van a seguir sin pin
  después de este cambio. Es dato faltante, no un bug del mapa.

## Verificación

- `type-check`, `lint`, **510 tests** y `build` en verde.
- Lint atrapó un bug real antes de commitear: mutar un ref durante el render
  (`onSelectRef.current = onSelect`) viola la regla nueva de React sobre refs,
  aunque no dispara re-render. Movido a un `useEffect`.
- Con la API key ya cargada en Producción, la primera prueba en navegador
  destapó que la **CSP bloqueaba el script de Google Maps**. Corregido en
  `MAPA-CSP-01`.

### Lo que ninguna validación local podía atrapar

`type-check`, `lint`, `test` y `build` pasaban en verde con el mapa
completamente roto: la CSP es una **cabecera HTTP**, así que el bloqueo ocurre
en el navegador, no al compilar. Al agregar cualquier recurso externo —script,
fuente, endpoint— hay que tocar `next.config.ts` en el mismo cambio.

### Un error de consola que NO era de la app

En la misma pantalla apareció un segundo bloqueo de CSP, por una hoja de
estilos de `fonts.googleapis.com` con la familia Inter. Verificado que **no
sale de acá**: el HTML de producción tiene cero referencias a `googleapis`, y
`next/font/google` auto-hospeda las fuentes. Viene de una extensión del
navegador. Anotado para que el próximo no lo persiga.
