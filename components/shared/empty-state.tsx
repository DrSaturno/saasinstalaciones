import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Estado vacío: lectura exitosa, cero filas.
 *
 * Se separa a propósito de `ErrorState`. Confundir "no hay nada" con "no se
 * pudo leer" fue el hallazgo UX-010 de la auditoría de experiencia, y es el
 * error más caro de esta clase: alguien puede crear un duplicado porque la
 * pantalla le dijo que no existía lo que en realidad no se pudo cargar.
 *
 * `action` es el siguiente paso permitido, no un adorno: un vacío sin salida
 * deja a la persona sin saber si tiene que esperar, crear algo o pedir permiso.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-subtle px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
      ) : null}
      <div className="max-w-sm">
        <p className="text-h3">{title}</p>
        {description ? (
          <p className="mt-1 text-body text-text-secondary">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
