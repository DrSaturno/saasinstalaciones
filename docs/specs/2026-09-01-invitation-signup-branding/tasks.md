# Tareas

- [x] **INVITE-SPEC-01** — Definir alcance, requisitos y frontera con los módulos activos.
- [x] **INVITE-ASSET-01** — Crear y optimizar la ilustración original de alta.
- [x] **INVITE-UI-01** — Implementar el marco visual compartido por todos los estados.
- [x] **INVITE-UI-02** — Mejorar jerarquía, espaciado y controles del formulario.
- [x] **INVITE-I18N-01** — Incorporar textos y alternativas en español y portugués.
- [x] **INVITE-MOBILE-01** — Mantener formulario primero y escena debajo en móvil.
- [x] **INVITE-QA-01** — Validar TypeScript, lint, pruebas y build.
- [x] **INVITE-QA-02** — Verificar el resultado responsive en escritorio y móvil.
- [x] **INVITE-RELEASE-01** — Verificar el despliegue productivo.

## Corrección del 08-10-2026

Nicolás abrió el link de una invitación con su sesión de gerente: la pantalla decía que esa
cuenta no podía aceptarla y no ofrecía ninguna salida. Además, en pantallas anchas el texto de la
izquierda quedaba encima del instalador del dibujo y el párrafo no se leía.

- [x] **INVITE-FIX-01** — Estado «rol incompatible» con salida: dice con qué cuenta se abrió el
  link y ofrece copiar el link para el instalador, cerrar sesión y seguir con el alta
  (`signOutForInvitation`, que valida el token antes de redirigir), o volver al panel. Si el
  navegador bloquea el portapapeles, muestra el link en un campo para copiarlo a mano.
- [x] **INVITE-FIX-02** — La escena va debajo del texto, no detrás: recorte nuevo
  `invitation-signup-scene.webp` (sin el cielo vacío), dimensionado por alto y con los bordes
  fundidos con el fondo. Título más compacto y párrafo con más contraste.
- [x] **INVITE-FIX-03** — Pruebas: acción de servidor (token válido e inválido) y componente
  (copiar, respaldo manual, cerrar sesión). Verificado en navegador a 1880, 1440, 375 y 320 px.
