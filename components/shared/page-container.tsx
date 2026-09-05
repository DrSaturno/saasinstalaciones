import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Ancho máximo de página.
 *
 * Existe porque `max-w-[1480px]` estaba repetido **28 veces** a mano en las
 * pantallas. Un número mágico copiado 28 veces no es una decisión de diseño:
 * es una que nadie puede cambiar sin buscar y reemplazar.
 */
export function PageContainer({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  // `asChild` para que la pantalla conserve su landmark real (`<main>`) en vez
  // de quedar envuelta en un `<div>` que no significa nada para un lector.
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="page-container"
      className={cn("mx-auto w-full max-w-[1480px]", className)}
      {...props}
    />
  );
}
