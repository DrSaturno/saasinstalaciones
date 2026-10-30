# Tareas

## Estado (24-09-2026)

**Implementado** (sin migración; sin tocar producción). Verificado con `pnpm type-check`,
`pnpm lint`, `pnpm test` (631 pruebas) y `pnpm build`. **Sin probar contra Google real** (falta la
clave, la crea Nicolás) **y sin verificación visual.** Lo que hay que hacer para que funcione de
verdad está en «Lo que falta» al final.

## Fase 0 — Núcleo

- [x] **LATLNG-T-01** — `lib/domain/geocoding.ts`: armado de la consulta, interpretación de la
  respuesta de Google (LATLNG-DEC-04), comparación de dirección. 14 pruebas. → R2.2, R4.3
- [x] **LATLNG-T-02** — `lib/geocoding/google.ts`: cliente con timeout, clave opcional, sin loguear
  direcciones ni la clave, ubicación en lote acotada. 13 pruebas con `fetch` simulado.
  → R4.*, R5.*, DEC-02/05/06
- [x] **LATLNG-T-03** — `GOOGLE_GEOCODING_API_KEY` en `.env.example` y en la tabla de variables de
  `AGENTS.md`. → R5.2

## Fase 1 — Dejar de pedir números

- [x] **LATLNG-T-04** — Ficha del local: sin campos ni esquema de coordenadas. → R1.1
- [x] **LATLNG-T-05** — Cobertura del instalador: sin campos; muestra si la base ya está ubicada.
  → R1.1
- [x] **LATLNG-T-06** — Convocatoria: sin campos; suma la dirección aproximada (no se guarda). → R1.1,
  R2.5
- [x] **LATLNG-T-07** — Plantilla de importación, su instructivo y el lector sin coordenadas. Una
  plantilla vieja con columnas `lat`/`lng` se lee igual y las ignora. → R1.2
- [x] **LATLNG-T-08** — Exportación de locales sin coordenadas. → R1.3
- [x] **LATLNG-T-09** — Ficha de la locación: dice «Ubicado en el mapa» o «Todavía sin ubicación»,
  sin números. → R1.4

## Fase 2 — Ubicar solas

- [x] **LATLNG-T-10** — Alta y edición de local (7 pruebas: editar el teléfono no consulta a Google;
  cambiar la dirección sí; si no se puede ubicar se descarta la ubicación vieja; mutación verificada).
  → R2.1–R2.3
- [x] **LATLNG-T-11** — Cobertura del instalador (5 pruebas). → R2.4
- [x] **LATLNG-T-12** — Convocatoria. → R2.5
- [x] **LATLNG-T-13** — Importación: ubica hasta 300 locales nuevos, con 8 s de presupuesto, antes de
  insertarlos. → R2.6
- [x] **LATLNG-T-14** — Acción y botón «Completar ubicaciones» (5 pruebas), visible sólo si hay locales
  con dirección y sin ubicación **y** la clave está configurada. → R3.1

## Fase 3 — Verificación

- [x] **LATLNG-T-15** — `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build`.
- [ ] **LATLNG-T-16** — Con la clave real: crear un local con una dirección real, editar sólo el
  teléfono, editar la dirección, importar una planilla, «Completar ubicaciones», y ver el pin en el
  mapa del tablero. Verificación visual de los cuatro formularios sin coordenadas.

## Lo que falta para que ubique de verdad (lo hace Nicolás)

1. Crear la clave en Google Cloud: habilitar **Geocoding API** y restringirla a esa API.
2. Cargarla como `GOOGLE_GEOCODING_API_KEY` en Vercel y en `.env.local`. **Nunca** con prefijo
   `NEXT_PUBLIC_`.
3. Sin la clave nada se rompe: los locales se guardan sin ubicación y el botón «Completar
   ubicaciones» no aparece.

## Riesgos abiertos

- **Costo por consulta** de Google (orden de USD 5 cada 1000). Un proyecto de 2000 puntos son unos
  USD 10 la primera vez.
- **Direcciones mal escritas o sin número** no se ubican; el botón las reintenta cada vez (DEC-06).
- **Tiempo de la importación:** 300 locales en 8 s es una estimación; en un proyecto grande la
  importación tarda unos segundos más de lo que tardaba. Si Vercel corta la solicitud antes, hay que
  subir la duración máxima de la función o bajar el tope.
- **Precisión:** se descartan las coincidencias parciales de nivel aproximado. Si en la práctica
  quedan muchos locales sin ubicar por eso, la regla se ajusta con datos reales.
