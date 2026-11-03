import type { FinanceDemoEntry } from "@/lib/domain/finance-demo";

export type FinanceDemoTransaction = {
  id: string;
  entryId: string;
  amount: number;
  occurredOn: string;
  method: "transfer" | "cash" | "check" | "card" | "other";
  proofName: string;
};

export const financeDemoTransactionsKey = "seinstala-finance-demo-transactions-v1";

export function readFinanceDemoTransactions(): FinanceDemoTransaction[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(financeDemoTransactionsKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is FinanceDemoTransaction =>
      !!row && typeof row === "object" &&
      typeof row.id === "string" && typeof row.entryId === "string" &&
      typeof row.amount === "number" && Number.isFinite(row.amount) && row.amount > 0 &&
      typeof row.occurredOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.occurredOn) &&
      ["transfer", "cash", "check", "card", "other"].includes(row.method) &&
      typeof row.proofName === "string");
  } catch {
    return [];
  }
}

export function financeDemoOpenAmount(entry: FinanceDemoEntry, transactions: FinanceDemoTransaction[]): number {
  if (entry.status === "settled") return 0;
  const paidCents = transactions.filter((row) => row.entryId === entry.id)
    .reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  return Math.max(0, Math.round(entry.amount * 100) - paidCents) / 100;
}
