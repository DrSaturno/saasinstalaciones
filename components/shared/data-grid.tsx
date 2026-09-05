"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Colección tabular accesible y responsive.
 *
 * Resuelve dos hallazgos que venían de auditorías distintas y que conviene
 * arreglar juntos, porque tocan las mismas cuatro pantallas:
 *
 *  - **UX-004 (funcional):** los encabezados y las filas eran `div` sueltos y
 *    la fila entera navegaba con `onClick`, sin rol, sin `tabIndex` ni evento
 *    de teclado. Nadie que use teclado o lector podía operar Órdenes, Sitios
 *    ni las dos agendas — las superficies más usadas del producto.
 *  - **UX-016 (visual):** esas tablas fuerzan 860–1060 px de ancho mínimo en
 *    un área diseñada a 375 px, así que en la calle se ve una fracción de fila.
 *
 * **Por qué patrón `grid` de ARIA y no `<table>`.** Estas tablas están
 * virtualizadas: las filas se posicionan en absoluto dentro de un contenedor
 * con scroll, y eso es incompatible con el layout de una tabla real. Cambiar a
 * `<table>` obligaría a tirar la virtualización, que existe porque hay listas
 * de miles de órdenes. El patrón `grid` de ARIA da la misma semántica
 * —encabezado asociado a celda, fila navegable, posición anunciada— sin pelear
 * con el posicionamiento. Es lo que recomienda la propia auditoría.
 *
 * En móvil no se renderiza la grilla: va una lista de tarjetas, que es la única
 * forma de que la información entre a 375 px sin barrido horizontal.
 */

export function DataGrid({
  rowCount,
  colCount,
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  rowCount: number;
  colCount: number;
  label: string;
}) {
  return (
    <div
      role="grid"
      aria-label={label}
      // +1 por la fila de encabezado: el lector anuncia "fila 3 de 21" contando
      // como cuenta la persona, no como cuenta el array.
      aria-rowcount={rowCount + 1}
      aria-colcount={colCount}
      className={cn("min-w-0", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function DataGridHeader({
  columns,
  template,
  className,
}: {
  columns: string[];
  /** `grid-template-columns`, compartido con las filas para que alineen. */
  template: string;
  className?: string;
}) {
  return (
    <div
      role="row"
      aria-rowindex={1}
      className={cn(
        "sticky top-0 z-10 grid gap-4 border-b border-border-strong bg-surface-sunken px-4 py-2.5 text-caption font-medium text-muted-foreground",
        className,
      )}
      style={{ gridTemplateColumns: template }}
    >
      {columns.map((column, index) => (
        <span key={column} role="columnheader" aria-colindex={index + 1}>
          {column}
        </span>
      ))}
    </div>
  );
}

/**
 * Fila navegable. Se activa con Enter o Espacio, igual que un enlace o botón.
 *
 * `aria-rowindex` es obligatorio con virtualización: como sólo existen en el
 * DOM las filas visibles, sin él un lector anunciaría "fila 1 de 20" para la
 * fila 500. Con él, la posición real se conserva.
 */
export function DataGridRow({
  href,
  rowIndex,
  template,
  className,
  children,
  style,
  ...props
}: Omit<React.ComponentProps<"div">, "onClick"> & {
  href: string;
  /** Índice 0-based dentro de los datos; el encabezado ocupa la fila 1. */
  rowIndex: number;
  template: string;
}) {
  const router = useRouter();
  const open = () => router.push(href);

  return (
    <div
      role="row"
      aria-rowindex={rowIndex + 2}
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        // El Espacio hace scroll si no se lo frena, y el foco se perdería.
        event.preventDefault();
        open();
      }}
      className={cn(
        "grid cursor-pointer items-center gap-4 border-b border-border px-4 text-sm transition-colors hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      style={{ gridTemplateColumns: template, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

export function DataGridCell({
  colIndex,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { colIndex: number }) {
  return (
    <div
      role="gridcell"
      aria-colindex={colIndex}
      className={cn("min-w-0", className)}
      {...props}
    >
      {children}
    </div>
  );
}
