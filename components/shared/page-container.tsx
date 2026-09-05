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
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-container"
      className={cn("mx-auto w-full max-w-[1480px]", className)}
      {...props}
    />
  );
}
