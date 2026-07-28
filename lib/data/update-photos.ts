import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Firma las fotos de los avances de una orden.
 *
 * Las fotos de `order_updates.photos` son rutas dentro del bucket privado
 * `evidence`; sin firmar no se pueden mostrar. Antes la UI sólo escribía
 * "N fotos" y nunca las renderizaba, así que la imagen se subía bien pero no se
 * veía en ningún lado.
 *
 * Devuelve un mapa ruta → URL firmada para no romper la forma de los datos que
 * ya consumen las pantallas.
 */
export async function signUpdatePhotos(
  supabase: SupabaseClient<Database>,
  updates: readonly { photos: unknown }[],
): Promise<Map<string, string>> {
  const paths = [
    ...new Set(
      updates.flatMap((update) =>
        Array.isArray(update.photos)
          ? update.photos.filter((photo): photo is string => typeof photo === "string")
          : [],
      ),
    ),
  ];
  if (paths.length === 0) return new Map();

  const { data: signed } = await supabase.storage
    .from("evidence")
    .createSignedUrls(paths, 60 * 30);

  const entries: [string, string][] = [];
  for (const item of signed ?? []) {
    if (item.path && item.signedUrl) entries.push([item.path, item.signedUrl]);
  }
  return new Map(entries);
}
