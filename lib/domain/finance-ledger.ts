/** Monetary boundaries use cents. Database values are exact numeric(14,2). */
export function cents(value: number | string): number {
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error("invalid_amount");
  const [whole, decimals = ""] = text.split(".");
  const result = Number(BigInt(whole) * BigInt(100) + BigInt(decimals.padEnd(2, "0")));
  if (!Number.isSafeInteger(result)) throw new Error("invalid_amount");
  return result;
}

export type AllocationCandidate = { id: string; amount: number; paid: number; reserved: number };

/** Largest remainder allocation; ties use stable IDs, never input order. */
export function suggestChequeAllocations(amount: number, candidates: AllocationCandidate[]) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("invalid_amount");
  if (new Set(candidates.map((row) => row.id)).size !== candidates.length) throw new Error("duplicate_entry");
  const available = candidates.map((row) => {
    if (![row.amount, row.paid, row.reserved].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new Error("invalid_amount");
    return { id: row.id, balance: Math.max(0, row.amount - row.paid - row.reserved) };
  }).filter((row) => row.balance > 0).sort((a, b) => a.id.localeCompare(b.id));
  const total = available.reduce((sum, row) => sum + BigInt(row.balance), BigInt(0));
  if (BigInt(amount) > total) return { allocations: [], excess: Number(BigInt(amount) - total) };
  const rows = available.map((row) => {
    const numerator = BigInt(amount) * BigInt(row.balance);
    return { id: row.id, amount: Number(numerator / total), remainder: numerator % total };
  });
  const remaining = amount - rows.reduce((sum, row) => sum + row.amount, 0);
  const ranked = [...rows].sort((a, b) => a.remainder === b.remainder ? a.id.localeCompare(b.id) : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; i < remaining; i++) ranked[i].amount++;
  return { allocations: rows.filter((row) => row.amount > 0).map(({ id, amount: value }) => ({ entry_id: id, amount: value / 100 })), excess: 0 };
}

export function entryBalance(amount: number, paid: number, reserved = 0) {
  return { pending: Math.max(0, amount - paid), credit: Math.max(0, paid - amount), available: Math.max(0, amount - paid - reserved) };
}

export type FinancePeriod = "day" | "week" | "fortnight" | "month" | "quarter" | "semester" | "year" | "custom";
export function financePeriodRange(today: string, period: FinancePeriod, from?: string, to?: string) {
  const date = new Date(`${today}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== today) throw new Error("invalid_date");
  const year = date.getUTCFullYear(), month = date.getUTCMonth(), day = date.getUTCDate();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const at = (m: number, d: number) => new Date(Date.UTC(year, m, d, 12));
  if (period === "custom") {
    for (const value of [from, to]) {
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || iso(new Date(`${value}T12:00:00Z`)) !== value) throw new Error("invalid_range");
    }
    if (from! > to!) throw new Error("invalid_range");
    return { from: from!, to: to! };
  }
  if (period === "day") return { from: today, to: today };
  if (period === "week") {
    const start = at(month, day - ((date.getUTCDay() + 6) % 7));
    const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
    return { from: iso(start), to: iso(end) };
  }
  if (period === "fortnight") return { from: iso(at(month, day <= 15 ? 1 : 16)), to: iso(day <= 15 ? at(month, 15) : at(month + 1, 0)) };
  const months = { month: 1, quarter: 3, semester: 6, year: 12 }[period];
  const start = Math.floor(month / months) * months;
  return { from: iso(at(start, 1)), to: iso(at(start + months, 0)) };
}

export function chequeMaturity(issuedOn: string, term: 30 | 60 | 90 | 120) {
  const date = new Date(`${issuedOn}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== issuedOn) throw new Error("invalid_date");
  date.setUTCDate(date.getUTCDate() + term);
  return date.toISOString().slice(0, 10);
}
