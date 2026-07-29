import "server-only";

/**
 * Origen público de la aplicación, para armar links que viajan por email.
 *
 * No se puede derivar del request: los links se generan en Server Actions que
 * corren detrás del proxy de Vercel, y `Host` es manipulable por quien llama.
 * Sale de configuración explícita (`APP_URL`), con el dominio de producción de
 * Vercel como respaldo y localhost para desarrollo.
 *
 * Rechaza cualquier origen que no sea https (salvo localhost) y las URLs con
 * credenciales embebidas (`https://user:pass@host`), que sirven para disfrazar
 * el destino real de un link.
 */
export function applicationOrigin(): string {
  const configured = process.env.APP_URL?.trim();
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const candidate =
    configured || (vercel ? `https://${vercel}` : "http://localhost:3000");

  const url = new URL(candidate);
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
    throw new Error("Invalid APP_URL");
  }
  if (url.username || url.password) throw new Error("Invalid APP_URL");
  return url.origin;
}
