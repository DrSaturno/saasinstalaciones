# Diseño de la portada pública

## Dirección visual

La página toma el mockup como contrato de composición. El producto se presenta como un **mapa operativo vivo**: cada punto físico, cada orden y cada evidencia forman una única red controlable. La firma visual es la ilustración isométrica conectada por rutas azules; el resto de la interfaz se mantiene deliberadamente sobrio para no competir con ella.

## Tokens

| Rol | Token | Valor |
|---|---|---|
| Tinta | `--foreground` | `#070709` |
| Azul operativo | `--primary` | `#2597d0` |
| Cielo | `--primary-soft` | `#c0eaff` |
| Lavanda | `--lavender` | `#c0d5ff` |
| Arena | `--cream` | `#ffecc0` |
| Lienzo | `--background` | `#fafafa` |
| Superficie | `--card` | `#ffffff` |
| Éxito | `--success` | `#43a047` |

## Tipografía

- Display y cuerpo: Inter, ya cargada por el layout raíz.
- Datos, región y microetiquetas: Fragment Mono.
- El hero usa peso 750 visual, tracking negativo moderado y medida corta para conservar el golpe del mockup.

## Composición

```text
┌───────────────────────────────────────────────────────────┐
│ marca                         ES/PT  ingresar  ventas      │
├───────────────────────────────────────────────────────────┤
│ beta + título + texto + CTA   │ constelación operativa 3D │
├───────────────────────────────────────────────────────────┤
│      declaración: proyectos que no caben en planillas     │
├───────────────────────────────────────────────────────────┤
│   empresa              instalador             control      │
├───────────────────────────────────────────────────────────┤
│  tablero operativo simulado │ estados / evidencia / mapa  │
├───────────────────────────────────────────────────────────┤
│               seis capacidades internas                  │
├───────────────────────────────────────────────────────────┤
│ CTA comercial                           ruta de ubicaciones│
└───────────────────────────────────────────────────────────┘
```

En mobile el hero, los pilares y el panel operativo se apilan. La ilustración se conserva completa y no se usa como fondo recortado.

## Arquitectura de frontend

- `app/page.tsx`: Server Component, obtiene locale y traducciones.
- `components/marketing/marketing-header.tsx`: encabezado público.
- `components/marketing/operations-showcase.tsx`: representación HTML/CSS del tablero.
- `components/marketing/route-constellation.tsx`: gráfico SVG decorativo del CTA.
- `components/marketing/marketing-page.module.css`: estilos encapsulados, responsive y motion.
- `messages/marketing/{es,pt}.json`: fragmentos de copy propios, fusionados por
  `i18n/request.ts` para evitar conflicto con los mensajes que agrega finanzas.
- `public/images/landing-hero.png`: activo existente, servido por `next/image`.

No se introduce estado de cliente, fetching, efectos ni dependencias externas.

## Movimiento

Una única entrada orquestada al cargar: copy e ilustración aparecen con una separación de 80 ms. Los hover se limitan a botones y tarjetas. Con `prefers-reduced-motion: reduce`, todas las transformaciones y transiciones no esenciales quedan desactivadas.

## Decisiones

- Se reutiliza el arte existente en vez de regenerarlo: coincide con el mockup y evita deriva visual.
- El tablero de la sección media se construye en HTML/CSS; así mantiene nitidez, semántica y adaptación responsive.
- Se usa CSS Module para impedir que marketing altere estilos internos o el trabajo paralelo de finanzas.
- Se conserva `next-intl` y el selector actual para no crear una segunda estrategia de idioma.
