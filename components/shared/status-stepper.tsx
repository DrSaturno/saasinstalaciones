import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import { ORDER_STATUS } from "@/lib/domain/status";
import { STATUS_ICONS } from "@/components/shared/status-badge";
import type { OrderStatus } from "@/types/database";

/** Ciclo de vida lineal de una orden (cancelada queda fuera de la línea). */
const STEPS: OrderStatus[] = [
  "pendiente",
  "relevamiento",
  "planificada",
  "en_camino",
  "en_sitio",
  "en_proceso",
  "en_revision",
  "finalizada",
];

/**
 * Línea de progreso de la máquina de estados. Marca hechos (verde), actual
 * (primary con glow) y pendientes (muted). Si está cancelada, muestra una franja.
 */
export function StatusStepper({ status }: { status: OrderStatus }) {
  const t = useTranslations("Status");

  if (status === "cancelada") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-destructive">
        <Ban className="size-4 shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium">{t(ORDER_STATUS.cancelada.key)}</span>
      </div>
    );
  }

  const currentIndex = STEPS.indexOf(status);

  return (
    <ol className="flex items-start">
      {STEPS.map((step, index) => {
        const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "pending";
        const Icon = STATUS_ICONS[step];
        const nodeClass =
          state === "done"
            ? "border-success bg-success text-white"
            : state === "current"
              ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
              : "border-border bg-card text-muted-foreground";
        const labelClass =
          state === "pending" ? "text-muted-foreground" : "font-medium text-foreground";
        return (
          <li key={step} className="flex flex-1 flex-col items-center gap-2 last:flex-none">
            <div className="flex w-full items-center">
              {index > 0 ? (
                <span
                  className={`h-0.5 flex-1 ${index <= currentIndex ? "bg-success" : "bg-border"}`}
                  aria-hidden="true"
                />
              ) : (
                <span className="flex-1" aria-hidden="true" />
              )}
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors ${nodeClass}`}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              {index < STEPS.length - 1 ? (
                <span
                  className={`h-0.5 flex-1 ${index < currentIndex ? "bg-success" : "bg-border"}`}
                  aria-hidden="true"
                />
              ) : (
                <span className="flex-1" aria-hidden="true" />
              )}
            </div>
            <span className={`px-1 text-center text-[11px] leading-tight ${labelClass}`}>
              {t(ORDER_STATUS[step].key)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
