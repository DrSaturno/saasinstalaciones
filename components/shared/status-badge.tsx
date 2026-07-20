import { ORDER_STATUS, SITE_STATUS } from "@/lib/domain/status";
import type { OrderStatus, SiteStatus } from "@/types/database";

/** Chip pastel de estado — mismo lenguaje visual para órdenes y puntos. */
export function StatusBadge({
  status,
  kind = "site",
}: {
  status: OrderStatus | SiteStatus;
  kind?: "site" | "order";
}) {
  const map = kind === "order" ? ORDER_STATUS : SITE_STATUS;
  const style = (map as Record<string, { label: string; bg: string; fg: string }>)[
    status
  ];
  if (!style) return null;

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {style.label}
    </span>
  );
}
