"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Banknote, CalendarClock, Repeat, Users } from "lucide-react";
import { toast } from "sonner";
import { useFinanceActions } from "@/components/company/finance-action-context";
import { FinanceHelp } from "@/components/company/finance-hint";

type ExpenseType = "fixed" | "payroll" | "oneoff";
const TYPES: { value: ExpenseType; icon: typeof Repeat }[] = [
  { value: "fixed", icon: Repeat }, { value: "payroll", icon: Users }, { value: "oneoff", icon: Banknote },
];
const ONE_OFF_CATEGORIES = ["variable", "service", "logistics", "motorcycle", "travel", "daily", "other"] as const;

/**
 * «Nuevo gasto» unificado (FLX-40/41). Primero se elige el tipo y recién ahí
 * aparecen los campos de ese tipo, con el rótulo que corresponde: un alquiler
 * no pide «proveedor», un sueldo pide «empleado».
 */
export function FinanceNewExpense({ suppliers, today, onSaved }: {
  suppliers: { id: string; name: string }[]; today: string; onSaved?: () => void;
}) {
  const t = useTranslations("FinanceExpense");
  const router = useRouter();
  const listId = useId();
  const [type, setType] = useState<ExpenseType | null>(null);
  const [pending, start] = useTransition();
  const { createFinanceExpense } = useFinanceActions();
  const month = today.slice(0, 7);

  return (
    <form className="space-y-5" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      start(async () => {
        const result = await createFinanceExpense(new FormData(form));
        if (result.error) { toast.error(result.error); return; }
        toast.success(t(type === "oneoff" ? "savedOneOff" : "savedRecurring"));
        form.reset(); setType(null); router.refresh(); onSaved?.();
      });
    }}>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">{t("typeQuestion")}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {TYPES.map(({ value, icon: Icon }) => (
            <label key={value} className={`flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-colors motion-reduce:transition-none ${type === value ? "border-primary bg-blue-50/60" : "border-[#dfe7ed] hover:border-[#b9cbd7]"}`}>
              <input type="radio" name="type" value={value} checked={type === value} onChange={() => setType(value)} className="sr-only" required />
              <Icon className={`size-5 ${type === value ? "text-primary" : "text-[#7c8d9b]"}`} aria-hidden="true" />
              <span className="text-sm font-semibold">{t(`types.${value}.title`)}</span>
              <span className="text-xs leading-relaxed text-[#718391]">{t(`types.${value}.hint`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {type && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs text-[#6b7f8f] sm:col-span-2">{t(`conceptLabel.${type}`)}
            <input name="concept" required minLength={2} maxLength={200} placeholder={t(`conceptPlaceholder.${type}`)} className="block w-full border" />
          </label>
          <label className="space-y-1.5 text-xs text-[#6b7f8f]">
            <span className="flex items-center gap-1">{t(`payeeLabel.${type}`)}{type === "fixed" && <FinanceHelp text={t("payeeOptionalHelp")} />}</span>
            <input name="payee" list={listId} required={type !== "fixed"} minLength={type === "fixed" ? undefined : 2} maxLength={160} placeholder={t(`payeePlaceholder.${type}`)} className="block w-full border" />
            <datalist id={listId}>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.name} />)}</datalist>
          </label>
          {type === "oneoff" && (
            <label className="space-y-1.5 text-xs text-[#6b7f8f]">{t("category")}
              <select name="category" defaultValue="variable" className="block w-full border">
                {ONE_OFF_CATEGORIES.map((category) => <option key={category} value={category}>{t(`categories.${category}`)}</option>)}
              </select>
            </label>
          )}
          <label className="space-y-1.5 text-xs text-[#6b7f8f]">
            <span className="flex items-center gap-1">{t(type === "oneoff" ? "amount" : "monthlyAmount")}<FinanceHelp text={t("amountHelp")} /></span>
            <span className="flex gap-2">
              <select name="currency" defaultValue="ARS" aria-label={t("currency")} className="border"><option>ARS</option><option>BRL</option></select>
              <input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required className="block w-full border tabular-nums" />
            </span>
          </label>
          {type === "oneoff" ? (
            <label className="space-y-1.5 text-xs text-[#6b7f8f]">{t("dueOn")}
              <input name="dueOn" type="date" required defaultValue={today} className="block w-full border" />
            </label>
          ) : (
            <>
              <label className="space-y-1.5 text-xs text-[#6b7f8f]">
                <span className="flex items-center gap-1">{t("dueDay")}<FinanceHelp text={t("dueDayHelp")} /></span>
                <input name="dueDay" type="number" min="1" max="31" required defaultValue={type === "payroll" ? 5 : 10} className="block w-full border" />
              </label>
              <label className="space-y-1.5 text-xs text-[#6b7f8f]">{t("startMonth")}
                <input name="startMonth" type="month" required defaultValue={month} className="block w-full border" />
              </label>
            </>
          )}
          <p className="flex items-start gap-2 rounded-lg bg-[#f6f9fc] p-3 text-xs leading-relaxed text-[#6b7f8f] sm:col-span-2">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            {t(`afterSave.${type}`)}
          </p>
          <button disabled={pending} className="finance-button finance-button-primary sm:col-span-2">{pending ? t("saving") : t("save")}</button>
        </div>
      )}
    </form>
  );
}

/** Genera las obligaciones del mes a partir de los gastos fijos y sueldos cargados. */
export function FinanceGenerateMonthButton({ month }: { month: string }) {
  const t = useTranslations("FinanceExpense");
  const router = useRouter();
  const [pending, start] = useTransition();
  const { generateFinanceExpenseMonth } = useFinanceActions();
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" disabled={pending} className="finance-button" onClick={() => start(async () => {
        const result = await generateFinanceExpenseMonth(month);
        if (result.error) toast.error(result.error); else { toast.success(t("monthGenerated")); router.refresh(); }
      })}>
        <Repeat className="size-4" aria-hidden="true" />{t("generateMonth", { month })}
      </button>
      <FinanceHelp text={t("generateMonthHelp")} />
    </span>
  );
}
