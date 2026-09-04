/**
 * Timeouts para llamadas a servicios externos (OPS-12 de la auditoría de
 * producción).
 *
 * El problema que resuelve no es el servicio *caído* —eso se detecta rápido y
 * el `catch` lo maneja— sino el servicio **lento**. Sin `AbortSignal`, un
 * proveedor que tarda 40 segundos deja la Server Action colgada hasta que la
 * plataforma corta la función, y la persona ve una pantalla girando sin
 * explicación.
 *
 * El patrón ya existía en un solo lugar (`lib/weather/forecast.ts`), donde se
 * documentó tras un incidente real: un Open-Meteo trabado dejaba el botón de
 * publicar anuncio girando para siempre, porque el fetch corría dentro del
 * render de `/dashboard` que `revalidatePath` espera. Este módulo generaliza
 * esa lección al resto de las integraciones.
 *
 * Los valores son deliberadamente cortos: ninguna de estas llamadas está en un
 * camino donde valga la pena esperar. Es preferible fallar y degradar —el email
 * se entrega a mano, el push es una mejora opcional— antes que sostener a la
 * persona esperando.
 */

/** Servicios de terceros en el camino de una interacción (Resend, Google). */
export const EXTERNAL_TIMEOUT_MS = 8_000;

/**
 * Invocaciones a nuestra propia Edge Function. Más corto: el push es
 * progresivo —la notificación in-app ya quedó escrita en la base— así que no
 * hay razón para hacer esperar a nadie por él.
 */
export const INTERNAL_TIMEOUT_MS = 5_000;
