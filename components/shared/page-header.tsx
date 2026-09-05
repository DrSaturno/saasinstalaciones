import { cn } from "@/lib/utils";

/**
 * Encabezado de página: título, contexto y la acción primaria.
 *
 * Existe porque el mismo `<h1>` estaba escrito con **ocho combinaciones
 * distintas** de clases a lo largo de la app (`text-2xl font-bold`, con y sin
 * `tracking-tight`, `font-semibold`, `text-xl`, `text-3xl`, con y sin `mt-*`).
 * Ninguna era peor que las otras; el problema era que fueran ocho.
 *
 * `action` es deliberadamente uno solo: la regla del sistema es **una acción
 * primaria por pantalla**. Si hacen falta dos, la segunda va como `outline`
 * dentro del mismo slot, pero conviene preguntarse antes si es primaria.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Contexto de dónde está parado: empresa, proyecto, cliente. */
  eyebrow?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-3",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-heading text-h1 text-balance">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-body text-text-secondary">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}
