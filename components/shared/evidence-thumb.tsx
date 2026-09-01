"use client";

import Image from "next/image";
import { useEvidenceGallery } from "@/components/shared/evidence-gallery";

/**
 * Miniatura que abre el visor en la posición que le toca dentro de la orden.
 *
 * Fuera de un `EvidenceGallery` degrada a un link que abre la imagen en una
 * pestaña: sin JavaScript la foto se sigue pudiendo ver, que es lo que importa
 * en el área instalador.
 */
export function EvidenceThumb({
  url,
  label,
  index,
  size = "md",
}: {
  url: string;
  label: string;
  index: number;
  size?: "sm" | "md";
}) {
  const gallery = useEvidenceGallery();
  const box = size === "sm" ? "size-16" : "size-20";
  const className = `${box} rounded-lg border object-cover transition-opacity hover:opacity-80`;

  const image = (
    <Image src={url} alt={label} width={160} height={160} unoptimized className={className} />
  );

  if (!gallery) {
    return (
      <a href={url} target="_blank" rel="noreferrer" title={label} className="block">
        {image}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => gallery.open(index)}
      title={label}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {image}
    </button>
  );
}
