import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Una métrica con su contexto.
 *
 * La auditoría visual señaló que las métricas del tablero eran un número y una
 * etiqueta, nada más. Un número sin referencia no permite decidir: "12 órdenes
 * pendientes" no dice si eso está bien o mal. `hint` existe para poner al lado
 * la comparación que hace falta (sobre cuántas, respecto de cuándo).
 *
 * `emphasis` marca la métrica principal de la pantalla. La regla del sistema es
 * **un solo punto focal**: si todas las métricas pesan igual, la grilla vuelve
 * a ser plana aunque los colores hayan mejorado.
 */
export function Metric({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  emphasis = false,
  className,
}: {
  label: string;
  value: string | number;
  /** Contexto que hace interpretable el número: "de 40", "ayer 8". */
  hint?: string;
  icon?: LucideIcon;
  /** Sólo cuando el número **significa** bien o mal por sí mismo. */
  tone?: "neutral" | "success" | "warning" | "danger";
  emphasis?: boolean;
  className?: string;
}) {
  const toneClass = {
    neutral: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  }[tone];

  return (
    <div
      data-slot="metric"
      className={cn(
        "flex flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4",
        emphasis && "border-border-strong bg-surface-subtle",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <Icon className="size-4 shrink-0 text-brand" aria-hidden="true" />
        ) : null}
      </div>
      <div>
        <p
          className={cn(
            "font-mono font-semibold tracking-tight",
            emphasis ? "text-display" : "text-h1",
            toneClass,
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-1 text-caption text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
