/**
 * Límites de un anuncio. Los fija la base (`announcements.title` y `.body`
 * tienen un check de largo) y se repiten acá una sola vez para que el esquema
 * de la acción y el formulario (`announcement-composer.tsx`) usen el mismo
 * número. La acción es un archivo `"use server"` y no puede exportarlos.
 */
export const ANNOUNCEMENT_LIMITS = {
  title: { min: 2, max: 120 },
  body: { min: 2, max: 2000 },
} as const;
