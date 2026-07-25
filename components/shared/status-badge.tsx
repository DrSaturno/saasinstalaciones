import {
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { ORDER_STATUS, SITE_STATUS } from "@/lib/domain/status";
import { useTranslations } from "next-intl";
import type { OrderStatus, SiteStatus } from "@/types/database";

/** Ícono por estado — capa visual, no de dominio. Compartido con el stepper. */
export const STATUS_ICONS: Record<string, LucideIcon> = {
  sin_ordenes: Clock,
  pendiente: Clock,
  relevamiento: ClipboardList,
  planificada: CalendarCheck,
  en_proceso: Wrench,
  en_revision: ClipboardCheck,
  finalizada: CheckCircle2,
  cancelada: XCircle,
};

/** Chip pastel de estado con ícono — mismo lenguaje visual para órdenes y puntos. */
export function StatusBadge({
  status,
  kind = "site",
}: {
  status: OrderStatus | SiteStatus;
  kind?: "site" | "order";
}) {
  const t = useTranslations("Status");
  const map = kind === "order" ? ORDER_STATUS : SITE_STATUS;
  const style = (map as Record<string, { key: Parameters<typeof t>[0]; bg: string; fg: string }>)[
    status
  ];
  if (!style) return null;
  const Icon = STATUS_ICONS[status];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden="true" /> : null}
      {t(style.key)}
    </span>
  );
}
