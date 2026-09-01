import { splitHighlight } from "@/lib/domain/text-highlight";

/**
 * Muestra un texto marcando lo que coincide con la búsqueda.
 *
 * Renderiza nodos, nunca HTML: el texto lo escribe un usuario y armar markup
 * con él sería una inyección esperando a pasar.
 */
export function HighlightedText({ text, query }: { text: string; query: string }) {
  const segments = splitHighlight(text, query);

  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="rounded bg-cream px-0.5 text-foreground">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
