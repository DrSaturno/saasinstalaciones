# Diseño

## Dirección

Pantalla partida de alto contraste basada en la referencia aprobada. La mitad visual es una escena azul noche de punta a punta: fondo, mensaje y ecosistema de instalaciones comparten la misma superficie. La mitad funcional es un panel blanco redondeado, amplio y directo. No existe una cabecera separada.

## Sistema visual

- **Azul operativo:** `#2597d0`.
- **Azul noche:** `#061831`.
- **Celeste de contexto:** `#c0eaff`.
- **Lavanda de rutas:** `#c0d5ff`.
- **Tinta:** `#0b1724`.
- **Superficie:** `#ffffff`.
- **Fondo:** `#061831`.
- Inter para contenido y Fragment Mono para etiquetas operativas.

## Firma

Una ruta punteada conecta el local, el equipo de campo, la aplicación y el vehículo dentro de una ilustración isométrica propia. El texto permanece en HTML sobre el área despejada del lienzo para conservar nitidez, accesibilidad y traducción.

## Responsive

- `> 800 px`: visual y formulario en dos columnas con proporción aproximada `57/43`.
- `<= 800 px`: formulario primero; lienzo visual completo debajo.
- `<= 420 px`: tipografía, recorte y badge ajustados para 375 px.

## Arquitectura

- `page.tsx` continúa como Server Component.
- El formulario es el único Client Component propio de la pantalla.
- La ilustración usa `next/image` en modo `fill`, `sizes` responsive y un recorte inferior estable.
- Los textos adicionales viven en `messages/login/{es,pt}.json` y se fusionan en `i18n/request.ts`.
