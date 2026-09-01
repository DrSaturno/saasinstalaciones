import { ExternalLink } from "lucide-react";

/**
 * Enlace compartido dentro de una orden.
 *
 * Muestra el dominio arriba y la URL completa abajo, sin miniatura ni título
 * traído del sitio: ir a buscar metadatos de una URL cualquiera desde el
 * servidor abre la puerta a SSRF, y no vale la pena por una vista previa.
 * Mostrar el dominio también deja ver a dónde lleva antes de hacer clic.
 */
export function EvidenceLink({ url }: { url: string }) {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Un enlace que no parsea igual se muestra: lo escribió alguien y puede
    // ser justo lo que se está buscando.
    host = url;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-start gap-2 rounded-lg border bg-muted/20 px-3 py-2 transition-colors hover:border-primary/40"
    >
      <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{host}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{url}</span>
      </span>
    </a>
  );
}
