export type ForecastEntry = {
  amount: number;
  currency: string;
  due_on: string | null;
  category: string;
  zone: string | null;
  source: string;
  status: string;
};

export function nextFinanceWeekday(from: string, isoWeekday: number): string {
  const date = new Date(`${from}T12:00:00Z`);
  const current = date.getUTCDay() || 7;
  const distance = (isoWeekday - current + 7) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + distance);
  return date.toISOString().slice(0, 10);
}

export function addFinanceDays(from: string, days: number): string {
  const date = new Date(`${from}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildFinanceForecast(entries: ForecastEntry[], today: string, days = 14) {
  const end = addFinanceDays(today, days);
  const forecast = new Map<string, number>();
  const fixed = new Map<string, number>();
  let unscheduled = 0;
  let importedReview = 0;
  for (const entry of entries) {
    if (entry.status === "settled" || entry.status === "void") continue;
    if (entry.source === "imported" && entry.status === "review") { importedReview++; continue; }
    if (entry.category === "fixed") fixed.set(entry.currency, (fixed.get(entry.currency) ?? 0) + entry.amount);
    if (!entry.due_on) { unscheduled++; continue; }
    if (entry.due_on < today || entry.due_on > end) continue;
    const key = `${entry.due_on}|${entry.zone ?? "other"}|${entry.currency}`;
    forecast.set(key, (forecast.get(key) ?? 0) + entry.amount);
  }
  return { forecast, fixed, unscheduled, importedReview, end };
}
