"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, BookOpen } from "lucide-react";

const STEPS = ["order", "sunday", "approve", "notify", "invoice", "pay", "proof"] as const;
const WHO: Record<(typeof STEPS)[number], "operations" | "system" | "owner" | "supplier" | "finance"> = {
  order: "operations", sunday: "system", approve: "owner", notify: "system", invoice: "supplier", pay: "finance", proof: "finance",
};
const WHO_CLASS = {
  operations: "bg-slate-100 text-slate-700", system: "bg-slate-100 text-slate-700", owner: "bg-sky-50 text-sky-800",
  supplier: "bg-violet-50 text-violet-800", finance: "bg-emerald-50 text-emerald-800",
};
const STATES = ["review", "awaitingInvoice", "ready", "settled", "void", "planned", "realized", "chequePending"] as const;
const QUESTIONS = ["noInvoice", "changeAmount", "fixedExpense", "collection", "proof", "amba"] as const;
const LINKS = [
  { href: "/finance/approvals", key: "approvals" }, { href: "/finance/payments", key: "payments" },
  { href: "/finance/expenses", key: "expenses" }, { href: "/finance/collections", key: "collections" },
] as const;

/**
 * «¿Cómo funciona?» (FLX-81): el circuito paso a paso, qué significa cada
 * estado y las dudas más comunes, en lenguaje llano. Sólo texto: no consulta datos,
 * así la misma pantalla sirve en la app y en la demo local.
 */
export function FinanceHelpContent() {
  const t = useTranslations("FinanceHelpPage");
  return (
    <main className="mx-auto max-w-4xl space-y-8 pb-12">
      <header>
        <h1 className="finance-title flex items-center gap-3"><BookOpen className="size-7 text-primary" aria-hidden="true" />{t("title")}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[#718391]">{t("intro")}</p>
      </header>

      <section aria-labelledby="help-steps" className="space-y-4">
        <h2 id="help-steps" className="text-base font-semibold">{t("stepsTitle")}</h2>
        <ol className="space-y-3">
          {STEPS.map((step, index) => (
            <li key={step} className="finance-card flex gap-4 p-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-white">{index + 1}</span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {t(`steps.${step}.title`)}
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${WHO_CLASS[WHO[step]]}`}>{t(`who.${WHO[step]}`)}</span>
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-[#5f7687]">{t(`steps.${step}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm leading-relaxed text-violet-950">{t("lateInvoice")}</p>
      </section>

      <section aria-labelledby="help-states" className="space-y-4">
        <h2 id="help-states" className="text-base font-semibold">{t("statesTitle")}</h2>
        <dl className="finance-card divide-y divide-[#edf1f5]">
          {STATES.map((state) => (
            <div key={state} className="grid gap-1 px-5 py-4 sm:grid-cols-[180px_1fr] sm:gap-4">
              <dt className="text-sm font-semibold">{t(`states.${state}.name`)}</dt>
              <dd className="text-sm leading-relaxed text-[#5f7687]">{t(`states.${state}.meaning`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="help-questions" className="space-y-4">
        <h2 id="help-questions" className="text-base font-semibold">{t("questionsTitle")}</h2>
        <div className="space-y-2">
          {QUESTIONS.map((question) => (
            <details key={question} className="finance-card px-5 py-4">
              <summary className="cursor-pointer text-sm font-medium">{t(`questions.${question}.q`)}</summary>
              <p className="mt-3 text-sm leading-relaxed text-[#5f7687]">{t(`questions.${question}.a`)}</p>
            </details>
          ))}
        </div>
      </section>

      <nav aria-label={t("shortcutsTitle")} className="flex flex-wrap gap-2">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="finance-button">{t(`shortcuts.${link.key}`)}<ArrowRight className="size-4" aria-hidden="true" /></Link>
        ))}
      </nav>
    </main>
  );
}
