# Diseño

## Dirección

Una experiencia de bienvenida luminosa y operativa. La ilustración muestra a un instalador aceptando la invitación desde el teléfono, junto a su vehículo y conectado con un punto de instalación mediante rutas y marcadores. El panel funcional permanece blanco, directo y familiar.

## Sistema visual

- Azul operativo `#2597d0`.
- Celeste de superficie `#eaf4ff`.
- Verde de confirmación `#43a047`.
- Tinta `#0b1724`.
- Inter para contenido y Fragment Mono para etiquetas operativas.

## Responsive

- `> 800 px`: escena continua a la izquierda y panel funcional redondeado a la derecha.
- `<= 800 px`: formulario primero y escena completa debajo.
- La ilustración conserva el instalador, el celular, el vehículo y el local dentro del recorte seguro.

## Arquitectura

- `app/invite/[token]/page.tsx` continúa como Server Component.
- `InvitationFrame` encapsula únicamente presentación.
- `InstallerSignupForm` conserva su acción de servidor y mejora el espaciado de sus controles.
- Los estados y decisiones de negocio permanecen en el flujo existente.
