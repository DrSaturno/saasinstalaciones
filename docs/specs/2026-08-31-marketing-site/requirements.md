# Requisitos de la portada pública

## MKT-REQ-01 — Hero y navegación

- `/` debe ser una portada pública y mantener `/login` como ingreso al producto.
- El encabezado debe mostrar marca, selector ES/PT, ingreso y contacto comercial.
- El hero debe comunicar el valor principal con el título «Cada punto de instalación, bajo control» y reutilizar la ilustración isométrica existente.
- Los CTA de contacto del encabezado, hero y cierre deben tener el mismo destino.

## MKT-REQ-02 — Narrativa de producto

La página debe presentar, en este orden:

1. Problema que resuelve para proyectos masivos.
2. Tres perspectivas: empresa, instalador y control integral.
3. Vista operativa con estados, evidencia y seguimiento geográfico.
4. Capacidades internas: estados, offline, aislamiento, importación, reputación e idiomas.
5. Cierre comercial.

## MKT-REQ-03 — Identidad

- Marca visible: **Se Instala**.
- Paleta basada en los tokens existentes del producto.
- Estética clara, aireada, con bordes finos, paneles pastel y protagonismo del azul operativo.
- No introducir una estética distinta para marketing que contradiga la aplicación.

## MKT-REQ-04 — Idiomas

- Todo texto visible debe salir de `next-intl`.
- Debe existir paridad funcional y semántica entre es-AR y pt-BR.
- El selector de idioma existente debe seguir funcionando sin recargar el sitio completo.

## MKT-REQ-05 — Responsive y accesibilidad

- Sin scroll horizontal entre 320 px y 1440 px.
- Diseño verificado a 375 px y 1440 px.
- Navegación por teclado, foco visible, jerarquía de headings válida y contrastes legibles.
- Las ilustraciones decorativas deben tener texto alternativo apropiado o quedar ocultas a tecnologías asistivas.
- `prefers-reduced-motion` debe desactivar las entradas animadas.

## MKT-REQ-06 — Rendimiento

- La portada debe permanecer como Server Component salvo la interacción ya necesaria del selector de idioma.
- Las imágenes locales deben servirse con `next/image`, dimensiones estables y `sizes` responsive.
- No agregar dependencias ni JavaScript de animación.
- La ilustración principal debe tener prioridad de carga; las secciones inferiores deben cargar de forma diferida.

## MKT-REQ-07 — Frontera con finanzas

- No modificar ningún archivo bajo `app/(company)/finance`, acciones financieras, tipos de base ni migraciones.
- No reutilizar componentes del módulo financiero ni crear dependencias desde marketing hacia dominios internos.
- Cualquier conflicto futuro de integración debe resolverse conservando la implementación de finanzas como fuente de verdad para su dominio.

## Criterios de aceptación

- Dado un visitante en español o portugués, cuando abre `/`, ve la misma estructura y puede ingresar o contactar ventas.
- Dado un viewport de 375 px, cuando recorre la página, el contenido se apila sin recortes ni texto ilegible.
- Dado un usuario con movimiento reducido, cuando carga la página, no recibe animaciones de desplazamiento o flotación.
- Dado que el módulo de finanzas evoluciona en paralelo, cuando se compara la rama, no hay cambios dentro de su frontera de archivos.

