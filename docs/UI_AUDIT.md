# Auditoría visual — Se Instala

**Fecha:** 2026-09-05 · **Alcance:** diseño visual y consistencia de interfaz ·
**Rama:** `main` · **Método:** inspección del código de las 38 rutas, los 15
primitivos de `components/ui/`, el shell y los tokens; conteos automáticos sobre
`app/` y `components/`; contraste calculado sobre los tokens reales.

> **No se modificó código.** Este documento es la Fase 1 (auditoría) y la Fase 2
> (diagnóstico). La propuesta vive en [`DESIGN_SYSTEM_PROPOSAL.md`](./DESIGN_SYSTEM_PROPOSAL.md).

---

## 1. Tecnología visual detectada

| Capa | Qué usa | Estado |
|---|---|---|
| Motor de estilos | **Tailwind CSS v4** (`@import "tailwindcss"`, `@theme inline`) | Sano, moderno |
| Biblioteca de componentes | **shadcn/ui sobre Radix** (`radix-ui` unificado ^1.6.4) | 15 primitivos en `components/ui/` |
| Variantes | **CVA** + `tailwind-merge` + `clsx` | Patrón correcto |
| Iconos | **lucide-react** ^1.25.0 | Consistente en toda la app |
| Toasts | **sonner** ^2.0.7 | Un solo mecanismo |
| Fechas | **date-fns** ^4.4.0 | — |
| Gráficos | **ninguna librería** | Los gráficos son SVG/divs a mano |
| Animación | CSS propio + `tw-animate-css` | Un solo keyframe (`fade-in-up`) |

**Conclusión: el sistema actual se sostiene y no hay que reemplazarlo.** Tailwind v4
con `@theme` es exactamente la infraestructura que hace falta para lo que se
propone; el problema no es la herramienta sino **qué valores tiene cargados**.
Reemplazar shadcn/Radix por otra biblioteca sería costo puro sin beneficio.

---

## 2. Inventario de tokens actuales

Todos en `app/globals.css` (184 líneas). Es la única fuente de color: la
disciplina acá es **buena** y conviene decirlo.

### Color

| Token | Valor | Observación |
|---|---|---|
| `--background` | `#fafafa` | Fondo general |
| `--card` | `#ffffff` | **Única superficie elevada** |
| `--border` / `--input` | `#ececef` | **1.18:1 sobre blanco** |
| `--primary` | `#2597d0` | **3.27:1 sobre blanco** |
| `--muted-foreground` | `#868c98` | **3.38:1 sobre blanco** |
| `--foreground` | `#070709` | 19.5:1 — correcto |
| `--success` `--warning` `--info` | `#43a047` `#ff9800` `#2196f3` | `warning` da **2.16:1** |
| `--accent` / `--primary-soft` | `#c0eaff` | Pastel, sólo sirve como fondo |
| `--cream` `--lavender` `--brand-purple` | `#ffecc0` `#c0d5ff` `#371866` | `brand-purple` casi no se usa |
| `--status-*` (7) | 7 colores | Bien modelado semánticamente |

### Forma, tipografía y movimiento

- **Radios:** un solo `--radius: 0.625rem` (10px) con multiplicadores derivados
  (`sm` 0.6 → `4xl` 2.6). `Card` usa `rounded-2xl` = **18px**, por encima del
  rango 10–14px que declara `AGENTS.md`.
- **Sombras:** exactamente **dos** (`--shadow-premium`, `--shadow-premium-hover`).
  No hay escala de elevación.
- **Tipografía:** Inter (sans) + Fragment Mono (números). **No hay tokens de
  escala tipográfica** — se usa la escala default de Tailwind.
- **Espaciado:** sin tokens propios; escala default de Tailwind (base 4px). Es
  adecuada, no hace falta reemplazarla.
- **Movimiento:** un keyframe (`fade-in-up`, 0.5s) con `prefers-reduced-motion`
  contemplado. Sin tokens de duración/easing.

---

## 3. Inconsistencias encontradas (con conteos)

Medidas sobre `app/` y `components/`:

| Hallazgo | Cantidad | Lectura |
|---|---:|---|
| **Tamaños de texto fuera de escala** (`[11px]`, `[10px]`) | **95** | Un nivel tipográfico entero, no oficial, usado 95 veces |
| `max-w-[1480px]` repetido | **28** | Ancho de página sin token ni componente contenedor |
| Anchos mínimos de tabla (`[980px]`, `[940px]`, `[860px]`) | 8 | Fuerzan scroll horizontal (ya reportado como UX-016) |
| Variantes distintas de `<h1>` | **8** | Mismo elemento, ocho combinaciones de clases |
| Colores hex en TSX | **5** | 4 en `global-error.tsx` (justificado) + `themeColor` |
| `style={{...}}` inline | 22 | **Todos legítimos**: anchos de barras de progreso y virtualización |

### Lo que NO está mal (y conviene preservar)

- **Cero deriva de color.** Prácticamente no hay hex sueltos: todo pasa por
  tokens. Es la parte más sana del sistema.
- **Los números usan `font-mono`** de forma consistente (`text-2xl font-mono`
  en métricas). Es una decisión de diseño correcta y ya establecida.
- **Los estados de orden tienen color semántico propio** (`--status-*`), no
  colores decorativos.
- **La severidad de notificaciones combina palabra + icono + color**, no depende
  sólo del color.
- Un único sistema de iconos, un único sistema de toasts, un único motor de
  variantes.

### Inconsistencias de componente

- **No existe un componente `PageHeader`**: cada pantalla arma su encabezado a
  mano (de ahí las 8 variantes de `h1`).
- **No existe un componente de métrica/KPI**: conviven `Card` con
  `rounded-xl border bg-muted/30 p-4` armado a mano (p. ej.
  `manage-installations-dialog.tsx`).
- **No existe `EmptyState` ni `ErrorState` compartidos**: cada pantalla escribe
  su propio vacío.
- **Faltan primitivos**: no hay `Checkbox`, `Radio`, `Switch`, `Tooltip`,
  `Popover`, `Drawer`, `Pagination`, `Breadcrumb`. Donde hacen falta, se
  resuelven con `<input>` nativo o composiciones ad hoc.
- **Bloque `.dark` completo y muerto.** `globals.css:119-151` define un tema
  oscuro entero en escala de grises `oklch`, **sin relación con la paleta de
  marca** (define `--primary` como *casi blanco*). `AGENTS.md` dice "sin dark
  mode en v1". Es configuración incoherente que hoy no se usa pero que
  cualquiera podría activar por error.
- **Tokens de `--sidebar-*` y `--chart-*` son los defaults de shadcn**, en
  grises `oklch`, ajenos a la identidad. Los de chart nunca se personalizaron y
  **no hay librería de gráficos** que los consuma.

---

## 4. Diagnóstico: por qué se percibe plana

No es una impresión: es aritmética. Hay **tres mecanismos** para crear
profundidad y jerarquía —contraste de superficie, borde y tamaño— y **los tres
están casi anulados a la vez**.

### 4.1 Las superficies no se distinguen (causa principal)

```
--background: #fafafa   →  luminancia 0.956
--card:       #ffffff   →  luminancia 1.000
Contraste entre ambas:  1.04 : 1
```

**1.04:1 es indistinguible para el ojo.** Toda la aplicación está pintada
esencialmente de un solo tono. Y sólo existen **dos** niveles: no hay
`surface-subtle` ni `surface-elevated`.

### 4.2 El borde tampoco separa

`--border: #ececef` da **1.18:1** sobre blanco. Y `Card` lo usa además al 70%
de opacidad (`border-border/70`), bajándolo a ~1.13:1. Es decir: una tarjeta
blanca sobre un fondo casi blanco, delimitada por una línea casi invisible.

### 4.3 La navegación está invertida

En `app-shell-frame.tsx`: el **sidebar es `bg-card` (blanco)** y el contenido es
`bg-background` (#fafafa). La navegación es **más clara** que el contenido —lo
opuesto a la convención, donde el chrome retrocede y el contenido avanza. El
header, además, es `bg-background/90`: del mismo tono que el contenido.

Resultado neto: **sidebar y tarjetas comparten color; header y fondo comparten
color.** La app tiene dos tonos separados por 2%, y están cruzados.

### 4.4 La tipografía no construye jerarquía

Distribución real de los ~1.072 usos de tamaño de texto:

| Rango | Usos | % |
|---|---:|---:|
| 10–14px (`[10px]`, `[11px]`, `text-xs`, `text-sm`) | **948** | **88%** |
| ≥16px (`text-base` y mayores) | 124 | 12% |

**El 88% del texto vive en una banda de 4 píxeles.** Con casi todo al mismo
tamaño, el tamaño deja de ser una señal: no hay diferencia visual entre una
etiqueta, un dato y un título de sección.

### 4.5 Las sombras no señalan elevación

Sólo hay dos sombras, y **`Card` aplica `shadow-premium` siempre**. Si todo lo
que es tarjeta tiene la misma sombra, la sombra deja de significar "esto está
por encima": se vuelve textura de fondo.

### 4.6 Todo es una tarjeta

Con `Card` como único contenedor disponible (radio 18px + borde + sombra
uniformes), cualquier agrupación termina siendo una tarjeta idéntica a las
demás. Sin variación de superficie, una grilla de 4 tarjetas iguales no tiene
punto focal.

### 4.7 Las acciones pesan todas lo mismo

`Button` ofrece `default` / `outline` / `secondary` / `ghost` / `destructive`,
pero **todos los tamaños son chicos**: 24, 28, **32 (default)** y 36px el `lg`.
La acción primaria de una pantalla se ve igual que un filtro secundario. No hay
un tamaño pensado para "esta es *la* acción".

### 4.8 Las métricas no tienen contexto

`dashboard-metrics.tsx` muestra `font-mono text-2xl` con una etiqueta. No hay
tendencia, comparación con período anterior, ni mini-gráfico. Un número sin
contexto no permite decidir; y sin variación de superficie, seis métricas
forman una cuadrícula plana.

---

## 5. Accesibilidad visual (Fase 8)

Contrastes calculados sobre los tokens reales (sRGB, WCAG 2.2):

| Combinación | Ratio | AA texto normal (4.5) | AA no-textual (3.0) |
|---|---:|:---:|:---:|
| `--foreground` `#070709` sobre blanco | 19.5:1 | ✅ | ✅ |
| `--primary` `#2597d0` sobre blanco | **3.27:1** | ❌ | ✅ |
| `--muted-foreground` `#868c98` sobre blanco | **3.38:1** | ❌ | ✅ |
| `--muted-foreground` sobre `#fafafa` | **3.24:1** | ❌ | ✅ |
| `--warning` `#ff9800` sobre blanco | **2.16:1** | ❌ | ❌ |
| `--border` `#ececef` sobre blanco | **1.18:1** | — | ❌ |

**Agravante:** `--muted-foreground` es el color del texto secundario, y ese
texto es justamente el que más se usa en `[10px]`/`[11px]`. Texto de 10px a
3.24:1 es la peor combinación posible del sistema, repetida ~95 veces.

Otros puntos:

| Criterio | Estado | Detalle |
|---|---|---|
| Foco visible | ◐ | Existe `focus-visible:ring-3 ring-ring/50`, pero al 50% de opacidad sobre blanco queda débil |
| Tamaño de target | ❌ | Botones de 24–36px; el mínimo táctil recomendado es 44px. Crítico para uso con guantes |
| Zoom | ❌ | `maximumScale: 1` en `app/layout.tsx` impide ampliar (ya reportado como UX-006) |
| Estados sin depender del color | ✅ | Notificaciones combinan icono + palabra + color |
| Reducción de movimiento | ✅ | `fade-in-up` respeta `prefers-reduced-motion` |
| Reflow / tablas | ❌ | Anchos mínimos de 860–1060px en un área diseñada a 375px |
| Inputs móviles | ✅ | `text-base` en móvil evita el zoom automático de iOS |

> Los puntos de zoom, targets, tablas y contraste ya figuran como **UX-006,
> UX-007, UX-016 y UX-024** en [`UX_AUDIT.md`](./UX_AUDIT.md). Esta auditoría
> los confirma desde el lado visual y aporta los valores calculados; **no son
> hallazgos nuevos y no deben contarse dos veces.**

---

## 6. Resumen ejecutivo

La aplicación **no tiene un problema de gusto ni de tecnología**. Tiene un
problema de **rango**: los valores de sus tokens están comprimidos en un espacio
tan angosto que ninguna de las tres herramientas de jerarquía puede funcionar.

- Superficies separadas por **1.04:1** → no se ven.
- Bordes a **1.18:1** → no separan.
- **88% del texto** en 4px de rango → no jerarquiza.
- Una sola sombra aplicada a todo → no eleva.
- Botones de 32px → nada se destaca como acción principal.

La buena noticia es que **casi todo se corrige en `globals.css`**: no hace falta
rediseñar pantallas ni cambiar de biblioteca. La estructura (Tailwind v4 +
shadcn + CVA + tokens semánticos) ya es la correcta; lo que falta son los
valores y unos pocos componentes que hoy no existen.

Continúa en [`DESIGN_SYSTEM_PROPOSAL.md`](./DESIGN_SYSTEM_PROPOSAL.md).
