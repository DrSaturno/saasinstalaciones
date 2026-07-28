import Image from "next/image";

/**
 * Miniaturas de las fotos de un avance. Abren la imagen completa en pestaña
 * nueva usando la misma URL firmada, que vive 30 minutos.
 */
export function UpdatePhotos({
  photos,
  urlByPath,
  openLabel,
}: {
  photos: unknown;
  urlByPath: Map<string, string>;
  openLabel: string;
}) {
  if (!Array.isArray(photos) || photos.length === 0) return null;

  const items = photos
    .filter((photo): photo is string => typeof photo === "string")
    .map((path) => ({ path, url: urlByPath.get(path) }))
    .filter((item): item is { path: string; url: string } => Boolean(item.url));

  if (items.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((item) => (
        <a
          key={item.path}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          title={openLabel}
          className="block"
        >
          <Image
            src={item.url}
            alt=""
            width={160}
            height={160}
            unoptimized
            className="size-20 rounded-lg border object-cover transition-opacity hover:opacity-80"
          />
        </a>
      ))}
    </div>
  );
}
