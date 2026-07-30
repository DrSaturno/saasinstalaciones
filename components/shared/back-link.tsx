import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Volver a la pantalla que contiene a ésta.
 *
 * Apunta a una ruta fija en vez de al historial: se llega a una orden desde el
 * tablero, desde el listado o desde una notificación, y en los tres casos el
 * lugar al que corresponde volver es su listado, no la pantalla anterior.
 *
 * La flecha va como icono y no como carácter dentro del texto traducido:
 * escrita en el string se duplicaba en cada idioma y quedaba del lado
 * equivocado en escrituras de derecha a izquierda.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
