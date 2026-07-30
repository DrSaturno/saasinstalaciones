"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Manda al inicio a las PWA ya instaladas que todavía arrancan en la ruta vieja.
 *
 * El `start_url` del manifest pasó de `/tasks` a `/home`, pero Android graba esa
 * URL dentro del acceso directo cuando se instala la app: cambiarla en el
 * servidor no alcanza. Chrome revisa el manifest por su cuenta cada tanto y
 * recién ahí rehace el acceso directo, lo que puede tardar días. Reinstalar lo
 * arregla en el momento, pero no es algo que se le pueda pedir a cada
 * instalador que ya tiene la app en su teléfono.
 *
 * Por eso el corte se hace acá: si esta pantalla ES el arranque de una PWA
 * instalada, se reemplaza por el inicio. Se retira solo — una vez que Android
 * actualiza el acceso directo, la app abre en `/home` y esto no vuelve a
 * dispararse.
 *
 * Las cuatro condiciones son para no molestar a nadie más: navegar a Mis
 * órdenes desde el menú, recargar la pantalla o volver con el botón atrás
 * fallan alguna y no redirigen.
 */
export function PwaLaunchRedirect({ to }: { to: string }) {
  const router = useRouter();

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS no implementa display-mode: standalone en matchMedia.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    // Recargar da "reload" y volver atrás "back_forward": en los dos casos la
    // persona ya estaba acá y quiere seguir acá.
    const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (entry && entry.type !== "navigate") return;

    // Con referrer vino de un link de la app; con historial previo no es la
    // primera pantalla de la sesión. En un arranque en frío no hay ninguno.
    if (document.referrer) return;
    if (window.history.length > 1) return;

    router.replace(to);
  }, [router, to]);

  return null;
}
