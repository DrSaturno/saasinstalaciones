"use client";

import { cn } from "@/lib/utils";

const STARS = [1, 2, 3, 4, 5] as const;

type StarRatingProps = {
  value: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
};

const SIZE_CLASS = {
  sm: "text-base gap-0.5",
  md: "text-2xl gap-1",
  lg: "text-3xl gap-1",
} as const;

/** Estrellas reutilizables: lectura en perfiles y edición al calificar. */
export function StarRating({
  value,
  onChange,
  disabled = false,
  size = "md",
  label = `${value} de 5 estrellas`,
}: StarRatingProps) {
  const editable = Boolean(onChange);

  return (
    <div
      className={cn("inline-flex items-center", SIZE_CLASS[size])}
      role={editable ? "group" : "img"}
      aria-label={label}
    >
      {STARS.map((star) => {
        const filled = star <= Math.round(value);
        return editable ? (
          <button
            key={star}
            type="button"
            disabled={disabled}
            aria-label={`${star} ${star === 1 ? "estrella" : "estrellas"}`}
            aria-pressed={star === value}
            onClick={() => onChange?.(star)}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg leading-none text-warning transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
              filled ? "text-warning" : "text-muted-foreground/35",
            )}
          >
            <span aria-hidden="true">{filled ? "★" : "☆"}</span>
          </button>
        ) : (
          <span
            key={star}
            aria-hidden="true"
            className={filled ? "text-warning" : "text-muted-foreground/30"}
          >
            {filled ? "★" : "☆"}
          </span>
        );
      })}
    </div>
  );
}
