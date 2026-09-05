# Propuesta de sistema visual — Se Instala

**Fecha:** 2026-09-05 · **Base:** [`UI_AUDIT.md`](./UI_AUDIT.md) ·
**Estado:** propuesta, pendiente de aprobación. **No se modificó código.**

---

## 1. Dirección visual (Fase 3)

### El producto que es

Se Instala coordina cuadrillas de gráfica de gran formato en operativos de
cientos o miles de puntos. Tres audiencias con necesidades opuestas:

| Audiencia | Contexto real | Necesidad visual dominante |
|---|---|---|
| `company_manager` | Escritorio, jornada completa, decide plata y asignaciones | **Densidad** y jerarquía: ver mucho sin perderse |
| Instalador | Teléfono, a la intemperie, con guantes, señal intermitente | **Contraste y target grande**: una acción clara por vez |
| `platform_admin` | Escritorio, uso esporádico, acciones destructivas | **Sobriedad y fricción** proporcional al impacto |

Esto descarta un sistema visual único: hace falta **una sola paleta y dos
densidades** (`comfortable` para campo, `compact` para escritorio).

### Personalidad propuesta

**Herramienta de operación, no panel de marketing.** Sobria, legible al sol,
con la información al frente y la decoración fuera. La referencia mental es un
tablero de control industrial bien hecho: austero, pero con jerarquía nítida.

**Evolución, no reemplazo.** Se conserva la identidad existente: el azul
`#2597d0`, Inter + Fragment Mono, los pasteles y los siete colores de estado.
Lo que cambia es **el rango**, no la paleta.

### Principios

1. **La profundidad viene de la superficie, no de la sombra.** Cuatro niveles
   de gris; la sombra queda reservada a lo que realmente flota.
2. **Un solo punto focal por pantalla.** Si todo resalta, nada resalta.
3. **El color tiene función semántica.** Azul = acción. Verde/ámbar/rojo =
   estado. Nada de color decorativo.
4. **El número es el protagonista.** Fragment Mono, grande, con contexto al lado.
5. **La densidad es una decisión por área**, no un accidente.
6. **Legible a pleno sol** antes que elegante en captura de pantalla.

### Decisiones concretas

| Aspecto | Decisión |
|---|---|
| Nivel de densidad | Compacta en empresa/master; cómoda (targets ≥44px) en instalador |
| Uso de color | Azul sólo para acción primaria y selección; estados con su color propio; **cero color decorativo** |
| Profundidad | 4 niveles de superficie + borde real; sombra sólo en overlays y en hover de elementos interactivos |
| Iconografía | lucide, trazo 1.5–2px, 16px en línea y 20px en navegación. Sin cambio de librería |
| Gráficos | SVG propio sobre los tokens `--chart-*` redefinidos. **No incorporar librería todavía** |
| Navegación | Sidebar **más oscuro** que el contenido (hoy es al revés) |
| Paneles | Tarjeta sólo cuando agrupa cosas heterogéneas; el resto, borde o fondo sutil |
| Acción principal | Un botón `lg` (40px) sólido por pantalla; el resto `outline`/`ghost` |

---

## 2. Design tokens propuestos (Fase 4)

Todos van a `app/globals.css`. **Los nombres actuales se conservan** para no
romper nada; se **agregan** los que faltan.

### A. Color

#### Superficies — el cambio que resuelve la chatura

| Token | Actual | Propuesto | Contraste vs. anterior |
|---|---|---|---|
| `--background` | `#fafafa` | **`#f2f4f7`** | base |
| `--surface-subtle` | *(no existe)* | **`#f7f8fa`** | 1.05:1 |
| `--card` / `--surface` | `#ffffff` | `#ffffff` | **1.10:1 vs background** |
| `--surface-elevated` | *(no existe)* | **`#ffffff` + sombra** | por elevación |
| `--sidebar` | `oklch(0.985 0 0)` | **`#111827`** (oscuro) | invierte la jerarquía |

El salto de `#fafafa` a `#f2f4f7` lleva el contraste fondo↔tarjeta de **1.04:1
a 1.10:1**: sigue siendo sutil y luminoso, pero ya es perceptible. Es el cambio
individual de mayor impacto de toda la propuesta.

#### Bordes

| Token | Actual | Propuesto | Contraste sobre blanco |
|---|---|---|---|
| `--border` | `#ececef` (1.18:1) | **`#e2e5ea`** | **1.30:1** |
| `--border-strong` | *(no existe)* | **`#c9ced7`** | **1.80:1** |
| `--input` | `#ececef` | **`#c9ced7`** | **1.80:1** → cumple 1.4.11 |

#### Texto

| Token | Actual | Propuesto | Contraste |
|---|---|---|---|
| `--foreground` | `#070709` | sin cambio | 19.5:1 ✅ |
| `--text-secondary` | *(no existe)* | **`#4b5563`** | **7.5:1** ✅ |
| `--muted-foreground` | `#868c98` (3.38:1) | **`#5f6672`** | **5.9:1** ✅ |

`--muted-foreground` es hoy el peor problema de legibilidad del sistema (texto
secundario, a menudo a 10–11px). Llevarlo a 5.9:1 lo hace cumplir AA **sin
oscurecerlo tanto** como para competir con el texto principal.

#### Marca y semántica

| Token | Actual | Propuesto | Motivo |
|---|---|---|---|
| `--primary` | `#2597d0` | **sin cambio** (fondo de botón) | Es la identidad |
| `--primary-text` | *(no existe)* | **`#0d6ea3`** (4.6:1) | Para **texto y enlaces** azules |
| `--primary-hover` | *(no existe)* | **`#1f83b6`** | Hoy se usa `bg-primary/80` |
| `--success` | `#43a047` | `#2e7d32` (4.6:1) | Para texto sobre blanco |
| `--warning` | `#ff9800` (2.16:1) | **`#a15c00`** (4.6:1) | El peor contraste del sistema |
| `--error` | `#d32f2f` | sin cambio (4.5:1) | Ya cumple |
| `--info` | `#2196f3` | `#0b6bcb` | Consistencia con `primary-text` |
| `--focus-ring` | `--ring` al 50% | **`#2597d0` al 100% + offset 2px** | Foco visible de verdad |
| `--disabled-fg` | *(no existe)* | `#9aa1ac` | Hoy es `opacity-50` sobre todo |

> **Separar fondo de marca y texto de marca es la clave.** `#2597d0` es
> perfecto como *fondo* de botón (con texto blanco encima da 4.5:1) y
> reprobado como *texto* sobre blanco (3.27:1). Un token para cada rol resuelve
> el conflicto sin tocar la identidad.

Los siete `--status-*` se conservan como color de chip; para **texto** de estado
se usa una variante oscura (`--status-*-text`).

### B. Tipografía

Escala de 8 niveles con `--text-*`; hoy no existe ninguna.

| Token | Tamaño / línea | Peso | Uso |
|---|---|---|---|
| `display` | 32px / 38 | 600 | Sólo portada y números héroe |
| `h1` | 24px / 30 | 700 | Título de página (**hoy: 8 variantes distintas**) |
| `h2` | 20px / 26 | 600 | Sección |
| `h3` | 16px / 22 | 600 | Título de tarjeta |
| `body` | 14px / 20 | 400 | Texto general |
| `label` | 13px / 18 | 500 | Etiquetas de formulario |
| `small` | 12px / 16 | 400 | Metadatos |
| `caption` | **12px** / 16 | 500 · +0.02em | **Reemplaza los 95 usos de 10–11px** |
| `numeric` | Fragment Mono, `tabular-nums` | 600 | Métricas, montos, N.º de orden |

**Se elimina el nivel de 10–11px.** No es una preferencia estética: 10px a
3.24:1 es ilegible al sol, y son 95 apariciones. `caption` a 12px con peso 500
ocupa casi lo mismo y se lee.

### C. Espaciado

Se **conserva la escala de Tailwind** (base 4px) — ya es correcta. Sólo se
agregan tokens semánticos: `--space-card: 16px`, `--space-section: 32px`,
`--space-page: 24px`, y `--container-max: 1480px` (que hoy está repetido **28
veces** a mano).

### D. Formas

| Token | Actual | Propuesto |
|---|---|---|
| `--radius-sm` | 6px | 6px (chips, badges) |
| `--radius-md` | 8px | 8px (botones, inputs) |
| `--radius-lg` | 10px | **10px (tarjetas)** — hoy `Card` usa 18px |
| `--radius-xl` | 14px | 14px (modales) |
| **Alturas de control** | 24/28/32/36 | **`sm` 32 · `md` 36 · `lg` 40 · `field` 48** |
| Iconos | 16px | 16 en línea · 20 en nav · 24 en vacíos |

Bajar el radio de tarjeta de 18px a 10px alinea la implementación con lo que ya
declara `AGENTS.md` y hace ver el producto menos "plantilla".

**Elevación — cinco niveles, hoy hay uno:**

| Nivel | Uso | Sombra |
|---|---|---|
| `flat` | Contenido en superficie | ninguna |
| `raised` | Tarjeta en reposo | `0 1px 2px rgb(0 0 0 / .04)` |
| `hover` | Tarjeta interactiva | `0 4px 12px -2px rgb(0 0 0 / .08)` |
| `overlay` | Dropdown, popover | `0 8px 24px -4px rgb(0 0 0 / .12)` |
| `modal` | Diálogo, drawer | `0 24px 48px -12px rgb(0 0 0 / .18)` |

**El cambio de criterio importa más que los valores: `Card` deja de tener
sombra por defecto.** La tarjeta se define por superficie + borde; la sombra
queda para lo que de verdad flota.

### E. Movimiento

| Token | Valor | Uso |
|---|---|---|
| `--duration-fast` | 120ms | Hover, foco |
| `--duration-base` | 200ms | Acordeón, tabs |
| `--duration-slow` | 320ms | Modal, drawer |
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | Entradas (el que ya se usa) |

Sin animaciones decorativas nuevas. Se mantiene `prefers-reduced-motion` y se
extiende a las transiciones de superficie.

---

## 3. Jerarquía y profundidad (Fase 5)

### Cuándo usar cada recurso

| Recurso | **Sí** | **No** |
|---|---|---|
| **Tarjeta** | Agrupa datos heterogéneos con título propio (ficha de orden, panel de reputación) | Envolver una tabla que ya tiene su encabezado; envolver una sola métrica |
| **Borde** | Separar filas, delimitar zonas dentro de una tarjeta | Como decoración alrededor de todo |
| **Fondo sutil** (`surface-subtle`) | Agrupar filtros, encabezado de tabla, bloques de sólo lectura | Bloques que se editan |
| **Elevación** | Sólo lo que flota: dropdown, modal, drawer, toast, y hover de tarjeta clickeable | Tarjetas estáticas |
| **Color de acento** | La acción primaria, el ítem de navegación activo, la fila seleccionada | Títulos, iconos decorativos, bordes |

### Aplicación al shell

1. **Sidebar oscuro** (`#111827`) con texto claro: la navegación retrocede y el
   contenido avanza. Corrige la inversión actual y da profundidad inmediata sin
   tocar ninguna pantalla.
2. **Header** sobre `--surface` (blanco) con `border-b` de `--border-strong`:
   deja de confundirse con el contenido.
3. **Contenido** sobre `--background` (`#f2f4f7`), tarjetas en blanco: ahora se
   recortan.
4. **Ítem activo del nav**: fondo `--primary` sólido + barra izquierda de 3px,
   no sólo texto azul.

### Puntos focales

- **Una acción primaria por pantalla**, botón `lg` sólido. El resto `outline`.
- **La métrica principal del dashboard** ocupa el doble de ancho que las demás.
- **En tablas**, la columna de estado lleva chip con color; el resto es texto.

---

## 4. Componentes a consolidar (Fase 6)

### Existen y hay que ajustar

`Button` (agregar `field` 48px y `lg` 40px) · `Card` (sacar sombra por defecto,
radio 18→10px) · `Input`/`Textarea`/`Select` (altura 36px, borde
`--border-strong`) · `Badge` (variantes por estado) · `Table` (encabezado con
`surface-subtle`, hover de fila, zebra opcional) · `Dialog` (elevación `modal`)
· `Tabs` · `DropdownMenu` · `Skeleton` · `Avatar` · `Separator` · `Label` ·
`Sonner`.

### Faltan y hay que crear

| Componente | Por qué |
|---|---|
| **`PageHeader`** | Elimina las 8 variantes de `<h1>`; unifica título + descripción + acción primaria + breadcrumb |
| **`PageContainer`** | Elimina los 28 `max-w-[1480px]` sueltos |
| **`Metric`** | Unifica los KPIs; agrega tendencia y contexto |
| **`EmptyState`** / **`ErrorState`** | Hoy cada pantalla escribe el suyo |
| **`Checkbox` · `Radio` · `Switch`** | Hoy son `<input>` nativos sin estilo del sistema |
| **`Tooltip` · `Popover` · `Drawer`** | Radix ya está instalado; falta el wrapper |
| **`Pagination`** | Requerido por UX-011 (historial inalcanzable) |
| **`DataTable`** | Encapsula el patrón tabla-desktop / lista-mobile (resuelve UX-016) |

**Todos los estados obligatorios** por componente: `default`, `hover`, `focus`,
`active`, `selected`, `disabled`, `loading`, `error` y `success` donde aplique.

---

## 5. Pantallas piloto (Fase 7)

Cinco pantallas que ejercitan el sistema entero. **No se toca ninguna otra
hasta validar estas.**

### P1 · `/dashboard` — Inicio empresa

- **Problema:** seis métricas idénticas sin contexto ni foco; widgets sin estado propio.
- **Propuesta:** métrica principal a doble ancho con tendencia; secundarias en
  fila compacta; agenda del día como panel focal. Cada widget con su
  loading/error/empty. **Acción primaria:** "Nueva orden".
- **Responsive:** 1 col (móvil) → 2 (tablet) → 12 con la principal a 6.

### P2 · `/orders` — Listado denso

- **Problema:** filas `div` no semánticas, `min-w-[1060px]`, filtros sin nombre accesible.
- **Propuesta:** `DataTable` con `<table>` real; encabezado en `surface-subtle`
  y sticky; chip de estado; **lista de tarjetas ≤767px**. Filtros agrupados en
  una barra sobre `surface-subtle`.
- **Nota:** la semántica y el teclado son **UX-004**; acá se aporta la carcasa visual.

### P3 · `/orders/[id]` — Detalle

- **Problema:** todo son tarjetas iguales; la acción destructiva pesa igual que el resto.
- **Propuesta:** `PageHeader` con estado y acción primaria; columna principal
  (evidencia, historial) + lateral (asignación, montos); acciones destructivas
  al pie, en `outline` destructivo.

### P4 · `/tasks/[id]` — Ejecución en campo *(la más crítica)*

- **Problema:** targets de 32px, texto de 11px, al sol y con guantes.
- **Propuesta:** densidad `comfortable`; **CTA único de 48px fijo abajo**;
  estado como banda de color superior; tipografía mínima 14px, datos en 16px.
- **Responsive:** diseñada a 375px. Nada por debajo de 14px.

### P5 · `/settings` — Configuración

- **Problema:** formularios con error global y sin agrupación clara.
- **Propuesta:** secciones con `PageHeader` de nivel 2, cada grupo en tarjeta
  con descripción; errores por campo; botón de guardar sticky cuando hay cambios.

---

## 6. Plan por prioridad

### P0 — Sin esto no cambia nada (todo en `globals.css`)

1. Nuevas superficies (`--background` `#f2f4f7` + `surface-subtle` + elevated).
2. Bordes (`--border` 1.30:1, `--border-strong` 1.80:1).
3. `--muted-foreground` a 5.9:1 y `--warning` a 4.6:1.
4. `--primary-text` separado de `--primary`.
5. Escala tipográfica `--text-*` y escala de elevación.
6. **Eliminar el bloque `.dark` muerto** y los `--sidebar-*`/`--chart-*` ajenos.

> Riesgo bajo, impacto máximo: son valores, no estructura.

### P1 — Jerarquía visible

7. Sidebar oscuro + header sobre superficie.
8. `Card` sin sombra por defecto, radio 10px.
9. `PageHeader` + `PageContainer` (elimina 8 variantes de `h1` y 28 `max-w`).
10. Botones `lg` 40px y `field` 48px; acción primaria por pantalla.
11. Reemplazar los **95 usos de 10–11px** por `caption` (12px).

### P2 — Componentes que faltan

12. `Metric` con tendencia · `EmptyState`/`ErrorState` · `DataTable`.
13. `Checkbox`/`Radio`/`Switch`/`Tooltip`/`Pagination`.
14. Pantallas piloto P1–P5.

### P3 — Pulido

15. Tokens `--chart-*` con la paleta real.
16. Micro-interacciones con los tokens de duración.
17. Open Runde como `--font-heading` (ya previsto en el código).

---

## 7. Dependencias

### Se conservan (no hay motivo para cambiarlas)

Tailwind v4 · shadcn/ui + Radix · CVA + `tailwind-merge` · lucide-react ·
sonner · date-fns. **El sistema actual sostiene todo lo propuesto.**

### Eventualmente, sólo si se justifica

| Candidata | Para qué | Recomendación |
|---|---|---|
| `recharts` o `visx` | Gráficos de verdad | **Recién en P3.** Hoy no hay librería y los SVG a mano alcanzan para tendencias simples |
| `@radix-ui/react-tooltip`, `-checkbox`, `-switch` | Primitivos faltantes | Ya vienen en el paquete `radix-ui` unificado: **no suma dependencia** |
| `vaul` | Drawer móvil | Sólo si el Dialog de Radix no alcanza |

**No se propone ninguna dependencia nueva para P0–P2.**

---

## 8. Archivos que se tocarían

**P0 (1 archivo):** `app/globals.css`.

**P1:** `components/ui/{button,card,input,textarea,select,badge,table}.tsx` ·
`components/shared/app-shell-frame.tsx` · `components/shared/sidebar-nav.tsx` ·
`app/layout.tsx` · nuevos `components/shared/{page-header,page-container}.tsx` ·
y los `<h1>` de las 38 páginas (mecánico).

**P2:** nuevos primitivos en `components/ui/` · `components/shared/{metric,empty-state,error-state,data-table}.tsx` ·
las 5 pantallas piloto.

---

## 9. Riesgos de regresión visual

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Cambiar `--background` afecta **todas** las pantallas a la vez | Alta | Es el punto: se valida en las 5 piloto antes de dar por bueno |
| Oscurecer `--muted-foreground` puede "pesar" de más | Media | 5.9:1 mantiene la diferencia con el texto principal (19.5:1) |
| Bajar el radio de 18→10px cambia el carácter | Media | Alinea con `AGENTS.md`; validar en piloto |
| `Card` sin sombra puede verse pobre si el fondo no cambia primero | **Alta** | **Hacer P0 antes que P1, siempre.** Sin el fondo nuevo, la tarjeta sin sombra desaparece |
| Sidebar oscuro cambia mucho la percepción | Alta | Es reversible con un token; validar con el usuario primero |
| Tocar los `<h1>` de 38 páginas | Media | Mecánico y cubierto por Playwright + build |
| Contraste de `--primary` como fondo de botón | Baja | No cambia; sólo se agrega `--primary-text` para texto |

**Sin cobertura de regresión visual automatizada.** No hay snapshots de imagen.
Sugerencia: capturas de las 5 piloto antes/después en los 6 breakpoints, a mano.

---

## 10. Criterios para aprobar

1. **Contraste:** todo texto ≥4.5:1; bordes y controles ≥3:1. Verificable por cálculo.
2. **Profundidad:** fondo↔superficie ≥1.10:1 y perceptible en captura sin zoom.
3. **Jerarquía:** en cada piloto se identifica el punto focal **en menos de 3 segundos**.
4. **Tipografía:** cero usos de <12px. Verificable con `grep`.
5. **Targets:** ≥44px en el área instalador; ≥36px en escritorio.
6. **Consistencia:** un solo `PageHeader`, un solo contenedor, cero `max-w-[1480px]` sueltos.
7. **Sin regresión funcional:** `type-check`, `lint`, 453 tests y 51 E2E siguen verdes.
8. **Identidad preservada:** el azul, las tipografías y los estados siguen siendo reconocibles.

---

## 11. Qué necesito de vos para arrancar

1. **¿Sidebar oscuro?** Es el cambio de mayor impacto perceptual y el más
   opinable. Alternativa conservadora: sidebar en `surface-subtle` (gris muy
   claro), que igual corrige la inversión sin cambiar tanto el carácter.
2. **¿Confirmás bajar el radio de tarjeta de 18px a 10px?** Es lo que ya dice
   `AGENTS.md`, pero cambia bastante el aire del producto.
3. **¿Aprobás las 5 pantallas piloto** o preferís otras?
4. **Recordatorio de alcance:** esta propuesta **no** resuelve UX-004 (teclado
   en tablas), UX-006 (zoom) ni UX-011 (paginación) — son funcionales y viven
   en la fase UX pendiente. Acá sólo se prepara la carcasa visual.

**Detenido, esperando aprobación. No se modificó ningún archivo de código.**
