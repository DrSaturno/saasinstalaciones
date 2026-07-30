"use client";

/**
 * Chip de filtro con contador, del patrón que ya usaban proyectos, órdenes,
 * locaciones y coordinación cada uno por su cuenta.
 *
 * `aria-pressed` en vez de `aria-selected`: son botones de alternancia, no
 * opciones de un listbox.
 */
export function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "hover:bg-muted"
      }`}
    >
      {label}
      <span className="ml-2 font-mono text-xs opacity-70">{count}</span>
    </button>
  );
}
