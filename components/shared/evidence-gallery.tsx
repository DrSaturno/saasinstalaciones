"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type GalleryImage = { url: string; label: string };

type GalleryContext = { open: (index: number) => void };

const Context = createContext<GalleryContext | null>(null);

/** Devuelve null fuera del proveedor para que una miniatura suelta siga siendo un link. */
export function useEvidenceGallery(): GalleryContext | null {
  return useContext(Context);
}

/**
 * Visor de imágenes a pantalla completa para la evidencia de una orden.
 *
 * Envuelve la lista entera en vez de vivir dentro de cada mensaje: así se
 * recorren TODAS las fotos de la orden de corrido, que es como se mira
 * evidencia — no de a una, volviendo atrás cada vez.
 */
export function EvidenceGallery({
  images,
  children,
}: {
  images: GalleryImage[];
  children: React.ReactNode;
}) {
  const t = useTranslations("OrderEvidence");
  const [index, setIndex] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const open = useCallback((next: number) => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    setIndex(next);
  }, []);

  const close = useCallback(() => {
    setIndex(null);
    // Volver el foco a la miniatura: sin esto, cerrar deja al teclado
    // arrancando desde el principio de la página.
    restoreRef.current?.focus();
  }, []);

  const step = useCallback(
    (delta: number) => {
      setIndex((current) => {
        if (current === null || images.length === 0) return current;
        return (current + delta + images.length) % images.length;
      });
    },
    [images.length],
  );

  useEffect(() => {
    if (index === null) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);

    // El fondo no debe scrollear detrás del visor.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [index, close, step]);

  const value = useMemo(() => ({ open }), [open]);
  const current = index === null ? null : images[index];

  return (
    <Context.Provider value={value}>
      {children}

      {current ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.label}
          className="fixed inset-0 z-50 flex flex-col bg-black/90 motion-safe:animate-in motion-safe:fade-in"
          onClick={close}
        >
          <div className="flex items-center justify-between gap-3 p-3 text-white">
            <span className="font-mono text-xs tabular-nums">
              {t("galleryCounter", { current: (index ?? 0) + 1, total: images.length })}
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label={t("galleryClose")}
              className="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          {/* El click en la imagen no cierra: cerrar es el fondo, la X o Escape. */}
          <div
            className="flex min-h-0 flex-1 items-center justify-center px-2 pb-3"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={current.url}
              alt={current.label}
              width={1600}
              height={1200}
              unoptimized
              className="max-h-full w-auto max-w-full object-contain"
            />
          </div>

          {images.length > 1 ? (
            <div
              className="flex items-center justify-center gap-4 pb-6"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label={t("galleryPrev")}
                className="flex size-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronLeft className="size-6" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label={t("galleryNext")}
                className="flex size-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronRight className="size-6" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Context.Provider>
  );
}
