import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

// CSP (SEC-07 de la auditoría). Pasa de Report-Only —que no bloqueaba ni
// reportaba nada— a ENFORCING. Los allowlists reflejan lo que la app carga de
// verdad: scripts sólo propios, conexiones e imágenes sólo a Supabase, el único
// iframe es Google Maps.
//
// Se conserva `'unsafe-inline'` en script y style: Next inyecta scripts inline
// (bootstrap + payload RSC) y Radix/Tailwind estilos inline; quitarlos exige
// nonces, que fuerzan render dinámico en todas las páginas (impacto en el caché
// del PWA) — queda como próximo paso con verificación de staging. Por eso este
// enforcing endurece todo lo demás (object-src, base-uri, form-action,
// frame-ancestors, connect-src, img-src) sin el riesgo de romper la hidratación.
//
// `'unsafe-eval'` SÓLO en desarrollo: React lo usa para el HMR y los stacks de
// error; en producción ni Next ni React lo necesitan, así que se saca.
const isDev = process.env.NODE_ENV !== "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.net",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.supabase.net wss://*.supabase.net",
  "frame-src https://www.google.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  /**
   * Empaquetado autocontenido para hosting propio (SiteGround).
   *
   * La aplicación no es un sitio estático: tiene middleware, rutas de API y ~30
   * módulos de Server Actions, así que necesita un proceso Node corriendo. Con
   * `standalone`, el build produce en `.next/standalone` un servidor con sólo
   * las dependencias que realmente usa —sin `node_modules` completo—, que es lo
   * que se sube y se arranca con `node server.js`.
   *
   * En Vercel esta opción se ignora, así que no cambia el despliegue actual.
   */
  output: "standalone",
  /**
   * Sólo afecta a `next dev`: en producción esta clave se ignora.
   *
   * Playwright apunta a `127.0.0.1` (ver `playwright.config.ts`), pero el dev
   * server considera `localhost` su origen y bloquea la carga de sus propios
   * chunks desde cualquier otro host. El resultado es una página que renderiza
   * el HTML del servidor pero nunca hidrata: los tests de navegación pasan y
   * cualquiera que necesite un clic falla, sin mensaje que lo explique.
   */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  /**
   * Identidad del despliegue, para el desfasaje de versiones ("skew").
   *
   * Con una pestaña abierta desde antes de un deploy, el navegador conserva el
   * JS viejo y pide payloads RSC y Server Actions de un build que ya no existe.
   * Next devuelve error, se activa el boundary y la pantalla se rompe — al
   * recargar anda, porque baja el build nuevo. Ese era el error al tocar
   * "Volver" con deploys frecuentes.
   *
   * Con `deploymentId`, cada pedido viaja etiquetado y Next detecta el
   * desfasaje: en vez de fallar, fuerza una navegación completa.
   *
   * Conviene además activar Skew Protection en Vercel (Settings → Advanced),
   * que enruta al despliegue correcto en lugar de recargar.
   */
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Endurecimiento global. La CSP se aplica enforcing (ver arriba); el
        // paso con nonces —que permite quitar unsafe-inline— queda pendiente.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), browsing-topics=()",
          },
          {
            // SEC-07: enforcing. La versión con nonce (sin unsafe-inline) es el
            // próximo paso y necesita relevar el impacto de render dinámico/PWA.
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
