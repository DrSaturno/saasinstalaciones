import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Paginación por enlaces reales.
 *
 * Cierra la parte alcanzable de **UX-011**: la bandeja de notificaciones ya
 * traía `hasMore` de la capa de datos y sólo lo usaba para escribir "hay más",
 * sin ningún control para llegar. Es la peor variante del problema: la
 * interfaz confirma que existe contenido y no lo entrega.
 *
 * Son `<a>` y no botones a propósito. Así la página queda en la URL —
 * compartible, sobrevive a la recarga y funciona con el botón atrás del
 * navegador—, y el teclado la opera sin que haya que agregarle nada.
 *
 * `buildHref` lo provee quien la usa para no perder el resto de la query: en
 * notificaciones, el filtro vive ahí y saltar de página no puede borrarlo.
 */
export function Pagination({
  page,
  hasMore,
  buildHref,
  labels,
  className,
}: {
  /** Página actual, 0-based. */
  page: number;
  hasMore: boolean;
  buildHref: (page: number) => string;
  labels: { previous: string; next: string; current: string };
  className?: string;
}) {
  const hasPrevious = page > 0;
  if (!hasPrevious && !hasMore) return null;

  return (
    <nav
      aria-label={labels.current}
      className={cn("flex items-center justify-between gap-3", className)}
    >
      <PageLink
        href={hasPrevious ? buildHref(page - 1) : undefined}
        label={labels.previous}
        icon={<ChevronLeft className="size-4" aria-hidden="true" />}
      />
      {/* `aria-live` no: la página cambia por navegación, y el lector ya
          anuncia el documento nuevo. Repetirlo sería ruido. */}
      <span className="text-caption font-medium text-muted-foreground">
        {labels.current}
      </span>
      <PageLink
        href={hasMore ? buildHref(page + 1) : undefined}
        label={labels.next}
        icon={<ChevronRight className="size-4" aria-hidden="true" />}
        iconFirst={false}
      />
    </nav>
  );
}

/**
 * Un extremo de la paginación. Sin destino se renderiza como `<span>`, no como
 * un enlace deshabilitado: un `<a>` sin `href` no es enfocable ni activable, y
 * dejarlo en el orden de tabulación sólo agrega una parada que no hace nada.
 */
function PageLink({
  href,
  label,
  icon,
  iconFirst = true,
}: {
  href?: string;
  label: string;
  icon: React.ReactNode;
  iconFirst?: boolean;
}) {
  const content = (
    <>
      {iconFirst ? icon : null}
      {label}
      {iconFirst ? null : icon}
    </>
  );
  const shared =
    "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium";

  if (!href) {
    return (
      <span
        aria-disabled="true"
        className={cn(shared, "border-border text-disabled-fg")}
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        shared,
        "border-border-strong transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      {content}
    </Link>
  );
}
