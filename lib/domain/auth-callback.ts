/**
 * Cómo vuelve un link de email de Supabase Auth (recuperar contraseña) a la app.
 *
 * Lo normal es que llegue a `/api/auth/callback`. Pero Supabase lo manda a la
 * «Site URL» —la página principal— en dos casos que pasaron en producción:
 *
 * - el mail se pidió desde el panel de Supabase («Send password recovery»), que
 *   ignora la ruta de la app y usa siempre la Site URL;
 * - la ruta de la app no figura en la lista de redirecciones permitidas.
 *
 * Ahí el link trae el código en la query (`?code=` o `?token_hash=&type=`) o,
 * si el mail salió del panel, la sesión en el fragmento (`#access_token=…`).
 * Ninguna de las dos formas la leía nadie y la persona quedaba en la landing
 * sin poder elegir su contraseña.
 */

/** La query de un link de Supabase que hay que canjear en el callback. */
export function isAuthCallbackQuery(params: URLSearchParams): boolean {
  return (
    params.has("code") ||
    (params.has("token_hash") && params.has("type")) ||
    params.has("error_code")
  );
}

/**
 * Tipos de link que terminan en «elegí tu contraseña». Un magic link o una
 * confirmación de alta no tienen por qué mandar a cambiarla.
 */
const PASSWORD_SETUP_HASH_TYPES = new Set(["recovery", "invite"]);

export type AuthHash =
  | { kind: "session"; accessToken: string; refreshToken: string }
  | { kind: "error" };

/**
 * Lee el fragmento con el que Supabase devuelve un link en el flujo implícito.
 * Devuelve `null` para cualquier otro fragmento (las anclas de la landing,
 * por ejemplo), así que se puede llamar en todas las páginas sin riesgo.
 */
export function parseAuthHash(hash: string): AuthHash | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw.includes("=")) return null;
  const params = new URLSearchParams(raw);

  // Link vencido o ya usado: Supabase lo informa en el fragmento.
  if (params.has("error_code")) return { kind: "error" };

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const type = params.get("type");
  if (!accessToken || !refreshToken || !type) return null;
  if (!PASSWORD_SETUP_HASH_TYPES.has(type)) return null;
  return { kind: "session", accessToken, refreshToken };
}
