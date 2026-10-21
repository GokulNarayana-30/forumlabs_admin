/**
 * Dates in the marketing screens are Indian Standard Time (UTC+05:30, no daylight saving), whatever
 * timezone the browser is in. A stored instant is shown as IST wall time in a `datetime-local` input
 * and is sent back with an explicit +05:30 offset, so opening a record and saving unrelated fields
 * never moves its start or end.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** An API instant (ISO 8601) as `YYYY-MM-DDTHH:mm` IST wall time; '' for null or an unreadable value. */
export function instantToIstInput(instant: string | null | undefined): string {
  if (!instant) return '';
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) return '';
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** `YYYY-MM-DDTHH:mm` IST wall time as an ISO instant with the +05:30 offset; null when empty or invalid. */
export function istInputToInstant(input: string | null | undefined): string | null {
  if (!input) return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(input);
  if (!match) return null;
  const ms = Date.parse(`${match[1]}T${match[2]}:00+05:30`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * The value to send for a date the user did not touch. If the input still shows what
 * `instantToIstInput(original)` produced, the original instant (seconds included) is kept as it was
 * stored; only an edited input is converted.
 */
export function instantOrOriginal(
  input: string,
  original: string | null | undefined,
): string | null {
  if (!input) return null;
  if (original && instantToIstInput(original) === input) return original;
  return istInputToInstant(input);
}
