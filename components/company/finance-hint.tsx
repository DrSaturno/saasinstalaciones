"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FinanceStage } from "@/lib/domain/finance-approval";

/**
 * Ayudas del módulo para quien no es técnico (FLX-80): cada estado y cada acción
 * importante explica qué significa al pasar el mouse, al enfocar con teclado y
 * —porque en un teléfono no hay hover— también al tocar.
 */
function useTapTooltip() {
  const [open, setOpen] = useState(false);
  return { open, onOpenChange: setOpen, toggle: () => setOpen((value) => !value) };
}

/** Signo de pregunta con explicación corta. `label` es el nombre accesible del botón. */
export function FinanceHelp({ text, label }: { text: string; label?: string }) {
  const t = useTranslations("FinanceApproval");
  const tip = useTapTooltip();
  return (
    <Tooltip open={tip.open} onOpenChange={tip.onOpenChange}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={tip.toggle}
          aria-label={label ?? t("whatIsThis")}
          className="inline-grid size-6 shrink-0 place-items-center rounded-full text-[#8ba0af] hover:bg-slate-100 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <CircleHelp className="size-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-xs leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  );
}

const STAGE_CLASSES: Record<FinanceStage, string> = {
  review: "bg-amber-50 text-amber-800 ring-amber-200/60",
  awaitingInvoice: "bg-violet-50 text-violet-800 ring-violet-200/60",
  ready: "bg-sky-50 text-sky-800 ring-sky-200/60",
  settled: "bg-emerald-50 text-emerald-800 ring-emerald-200/60",
  void: "bg-slate-100 text-slate-500 ring-slate-200",
};

/**
 * Estado de un pago o cobro, con su explicación. `direction` cambia el texto:
 * «listo para pagar» no es lo mismo que «listo para cobrar».
 */
export function FinanceStageBadge({ stage, direction }: { stage: FinanceStage; direction: string }) {
  const t = useTranslations("FinanceApproval");
  const tip = useTapTooltip();
  const side = direction === "receivable" ? "receivable" : "payable";
  return (
    <Tooltip open={tip.open} onOpenChange={tip.onOpenChange}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={tip.toggle}
          className={`inline-flex cursor-help items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STAGE_CLASSES[stage]}`}
        >
          <span className="size-1 rounded-full bg-current" aria-hidden="true" />
          {t(`stages.${side}.${stage}`)}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-xs leading-relaxed">{t(`stageHelp.${side}.${stage}`)}</TooltipContent>
    </Tooltip>
  );
}

/** Etiqueta con explicación para cualquier otro estado (movimientos de caja, cheques). */
export function FinanceTermBadge({ label, help, className }: { label: string; help: string; className: string }) {
  const tip = useTapTooltip();
  return (
    <Tooltip open={tip.open} onOpenChange={tip.onOpenChange}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={tip.toggle}
          className={`inline-flex cursor-help items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${className}`}
        >
          <span className="size-1 rounded-full bg-current" aria-hidden="true" />
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-xs leading-relaxed">{help}</TooltipContent>
    </Tooltip>
  );
}
