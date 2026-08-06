import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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
        // Endurecimiento global. Una CSP con nonces queda como paso siguiente;
        // estos headers son seguros de aplicar sin romper scripts inline.
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
            // Se releva en staging antes de pasar a enforcement con nonce.
            key: "Content-Security-Policy-Report-Only",
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
