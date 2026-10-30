"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import { addProjectExpense, deleteProjectExpense } from "@/lib/actions/project-expenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderCurrency } from "@/types/database";

export type ProjectExpenseRow = {
  id: string;
  concept: string;
  amount: number;
  expenseDate: string;
  createdByName: string;
};

/**
 * Otros costos de un proyecto (bloque 6). Visible sólo para quien pasa
 * `auth_can_see_commercials` — el llamador decide si renderiza esto o no,
 * la RLS de `project_expenses` es la última palabra.
 */
export function ProjectExpensesPanel({
  projectId,
  currency,
  expenses,
}: {
  projectId: string;
  currency: OrderCurrency;
  expenses: ProjectExpenseRow[];
}) {
  const t = useTranslations("ProjectExpenses");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));

  const money = (value: number) =>
    format.number(value, { style: "currency", currency, maximumFractionDigits: 0 });

  const submit = () => {
    const parsedAmount = Number(amount);
    if (!concept.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    startTransition(async () => {
      const res = await addProjectExpense({ projectId, concept: concept.trim(), amount: parsedAmount, expenseDate });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("saved"));
      setConcept("");
      setAmount("");
      router.refresh();
    });
  };

  const remove = (expense: ProjectExpenseRow) => {
    if (!window.confirm(t("deleteConfirm", { concept: expense.concept }))) return;
    startTransition(async () => {
      const res = await deleteProjectExpense(expense.id, projectId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("deleted"));
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Receipt className="size-4 text-primary" aria-hidden="true" />
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("description")}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-5">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-concept">{t("concept")}</Label>
            <Input
              id="expense-concept"
              value={concept}
              placeholder={t("conceptPlaceholder")}
              onChange={(event) => setConcept(event.target.value)}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-amount">{t("amount")}</Label>
            <Input
              id="expense-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-date">{t("date")}</Label>
            <Input
              id="expense-date"
              type="date"
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
              disabled={pending}
            />
          </div>
          <Button onClick={submit} disabled={pending || !concept.trim() || !amount}>
            {pending ? t("adding") : t("add")}
          </Button>
        </div>

        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="divide-y rounded-xl border">
            {expenses.map((expense) => (
              <div key={expense.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{expense.concept}</p>
                  <p className="text-xs text-muted-foreground">
                    {format.dateTime(new Date(`${expense.expenseDate}T12:00:00`), { dateStyle: "medium" })}
                    {" · "}
                    {t("loadedBy")}: {expense.createdByName}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold">{money(expense.amount)}</span>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(expense)}>
                    {t("delete")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
