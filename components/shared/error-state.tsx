"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Falló la lectura. **No es lo mismo que estar vacío** (ver `EmptyState`).
 *
 * Muestra el alcance de lo que falló y ofrece reintentar. No expone detalles
 * técnicos: el motivo real va al log por `logEvent`, que es donde sirve para
 * diagnosticar; acá sólo confundiría o filtraría información del motor.
 *
 * `role="alert"` porque es un cambio de estado que la persona necesita
 * escuchar si usa lector de pantalla, no sólo ver.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel,
  className,
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center",
        className,
      )}
    >
      <TriangleAlert className="size-6 text-destructive" aria-hidden="true" />
      <div className="max-w-sm">
        <p className="text-h3">{title}</p>
        {description ? (
          <p className="mt-1 text-body text-text-secondary">{description}</p>
        ) : null}
      </div>
      {onRetry && retryLabel ? (
        <Button variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
