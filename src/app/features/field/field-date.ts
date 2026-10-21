/**
 * Field screens work in Indian Standard Time (UTC+05:30), whatever timezone the phone or browser is
 * in. Dates are `YYYY-MM-DD` strings, the same form the API takes as `?date=`.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's date in IST. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** `date` moved by `days` calendar days (negative goes back). Returns the input when it is not a date. */
export function shiftDate(date: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) return date;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

/** e.g. "Tue 21 Oct 2026". */
export function formatFieldDate(date: string): string {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) return date;
  return new Date(ms).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
