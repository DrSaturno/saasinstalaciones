const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export type BusinessCalendar = {
  holidays?: ReadonlySet<string>;
  weekendDays?: ReadonlySet<number>;
};

function parseDateKey(value: string): Date {
  const match = DATE_KEY.exec(value);
  if (!match) throw new Error("invalid_date_key");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("invalid_date_key");
  }
  return date;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isBusinessDay(dateKey: string, calendar: BusinessCalendar = {}): boolean {
  const date = parseDateKey(dateKey);
  const weekendDays = calendar.weekendDays ?? new Set([0, 6]);
  return !weekendDays.has(date.getUTCDay()) && !calendar.holidays?.has(dateKey);
}

export function addBusinessDays(
  dateKey: string,
  amount: number,
  calendar: BusinessCalendar = {},
): string {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("invalid_business_day_amount");
  const cursor = parseDateKey(dateKey);
  let remaining = amount;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isBusinessDay(toDateKey(cursor), calendar)) remaining -= 1;
  }
  return toDateKey(cursor);
}

export function businessDaysUntil(
  fromDateKey: string,
  untilDateKey: string,
  calendar: BusinessCalendar = {},
): number {
  const cursor = parseDateKey(fromDateKey);
  const limit = parseDateKey(untilDateKey);
  if (limit.getTime() < cursor.getTime()) return -businessDaysUntil(untilDateKey, fromDateKey, calendar);

  let count = 0;
  while (cursor.getTime() < limit.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isBusinessDay(toDateKey(cursor), calendar)) count += 1;
  }
  return count;
}

export function canCancelWithoutReview(input: {
  requestedDate: string;
  scheduledDate: string;
  requiredNoticeDays?: number;
  calendar?: BusinessCalendar;
}): boolean {
  return (
    businessDaysUntil(input.requestedDate, input.scheduledDate, input.calendar) >=
    (input.requiredNoticeDays ?? 2)
  );
}

export function rescheduleResponseDeadline(input: {
  notifiedDate: string;
  responseWindowDays?: number;
  calendar?: BusinessCalendar;
}): string {
  return addBusinessDays(
    input.notifiedDate,
    input.responseWindowDays ?? 2,
    input.calendar,
  );
}
