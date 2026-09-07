"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Tooltip accesible, en reemplazo del atributo `title` nativo.
 *
 * `title` parece resolver el problema y no lo resuelve: no aparece con foco de
 * teclado, es inalcanzable en touch (no hay hover en un teléfono, y media app
 * se usa desde uno), tarda cerca de un segundo en salir y no se puede estilar.
 *
 * Radix lo muestra con hover **y con foco**, lo asocia por `aria-describedby`
 * y lo cierra con Escape.
 *
 * Importante: un tooltip **describe**, no nombra. Un botón de sólo ícono
 * necesita igual su `aria-label`; si el nombre accesible dependiera del
 * tooltip, un lector no tendría cómo anunciarlo antes de enfocar.
 */

export function TooltipProvider({
  delayDuration = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

export function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props} />;
}

export function TooltipTrigger(
  props: React.ComponentProps<typeof TooltipPrimitive.Trigger>,
) {
  return <TooltipPrimitive.Trigger {...props} />;
}

export function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          // Fondo oscuro: el tooltip flota sobre contenido claro y necesita
          // separarse de él. Es de los pocos lugares donde la elevación se
          // gana con contraste y no con una sombra más.
          "z-50 max-w-64 rounded-md bg-foreground px-2.5 py-1.5 text-caption text-background shadow-overlay",
          "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
