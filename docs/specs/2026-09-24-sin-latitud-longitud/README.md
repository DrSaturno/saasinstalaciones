# Sin latitud y longitud: la ubicación sale sola de la dirección

Bloque 2 de [`../2026-09-24-hoja-de-ruta-v2/`](../2026-09-24-hoja-de-ruta-v2/README.md).
Estado (24-09-2026): **implementado**, sin probar contra Google real (falta la clave) y sin
verificación visual. Ver [tasks.md](tasks.md).

## Contexto

Pedido: sacar latitud y longitud de la aplicación y conseguir de otra forma lo que esos datos
hacían. Aceptado el default de la decisión 7 de la hoja de ruta: **las coordenadas se conservan
por dentro pero ya no se piden; se calculan solas a partir de la dirección.**

Cargar coordenadas a mano es un trabajo que nadie hace bien (hay que ir a un mapa, copiar dos
números con decimales) y los datos quedaron incompletos: en la auditoría del mapa, 13 de las 30
locaciones activas de producción no tenían dirección ni coordenadas.

## Auditoría: para qué se usan las coordenadas hoy

Cada uso se conserva, porque siguen leyendo el mismo dato guardado:

| Uso | Dónde |
|---|---|
| Pines del mapa operativo del tablero | `components/company/operational-map.tsx`, `lib/data/dashboard.ts` |
| Pronóstico del clima por punto | `lib/weather/forecast.ts` |
| Matching de convocatorias por radio de cobertura | `lib/domain/geography.ts`, `broadcast_matches_installer` |
| Viabilidad de traslado entre trabajos (agenda) | `installer_travel_feasibility`, `estimated_travel_minutes` |
| Ruta del día del instalador | `lib/domain/route.ts`, `app/(installer)/route/page.tsx` |
| Divergencia entre la ficha canónica y el punto | `lib/domain/canonical-divergence.ts` |

Lo que **sí** cambia es **quién las escribe**: hoy hay cuatro formularios que piden números
(ficha del local, convocatoria, cobertura del instalador, plantilla de importación) y una
exportación que los emite.

## Los tres documentos

- [requirements.md](requirements.md)
- [design.md](design.md)
- [tasks.md](tasks.md)

## Frontera: qué NO toca

- **No cambia el esquema**: `lat`/`lng` siguen existiendo en `locations`, `sites`, `broadcasts` e
  `installers`. Quitar las columnas rompería el mapa, el clima y el matching.
- **No geocodifica en el navegador**: sería depender de la clave pública de mapas y exponer las
  direcciones a cada visita.
- **No hace la corrección manual de un pin equivocado.** Si una dirección se ubica mal, hoy se
  corrige editando la dirección. Un ajuste fino sobre el mapa es otro pedido.
- **Este bloque no crea la clave de Google:** eso lo hace Nicolás (ver el diseño).
