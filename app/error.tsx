"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAutoReloadOnError } from "@/lib/use-auto-reload";
import { useErrorReport } from "@/lib/use-error-report";

/**
 * Boundary de error de las rutas bajo el layout raíz. Vive dentro del
 * NextIntlClientProvider, así que puede localizar sus textos.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("AppStates");

  // El `error` estaba declarado en el tipo pero no se desestructuraba: llegaba
  // con su `digest` y se descartaba. Sin eso, ningún crash de producción quedaba
  // registrado, y la recarga automática de abajo terminaba de borrar el rastro.
  useErrorReport(error, "route");
  useAutoReloadOnError();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight">{t("errorTitle")}</h1>
      <p className="max-w-md text-muted-foreground">{t("errorBody")}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>{t("errorRetry")}</Button>
        <Button asChild variant="outline">
          <Link href="/">{t("errorHome")}</Link>
        </Button>
      </div>
    </main>
  );
}
