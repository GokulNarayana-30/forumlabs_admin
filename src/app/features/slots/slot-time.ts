/** Slot windows are IST minutes from midnight; these helpers show and offer them as clock times. */

/** 390 -> "06:30". */
export function formatMinute(minute: number): string {
  const hh = String(Math.floor(minute / 60)).padStart(2, '0');
  const mm = String(minute % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** "06:00 - 07:30". */
export function windowTimeLabel(startMinute: number, endMinute: number): string {
  return `${formatMinute(startMinute)} - ${formatMinute(endMinute)}`;
}

/** Quarter-hour choices between 05:00 and 21:00, the range the API accepts. */
export function timeOptions(
  fromMinute = 5 * 60,
  toMinute = 21 * 60,
): { value: number; label: string }[] {
  const out: { value: number; label: string }[] = [];
  for (let m = fromMinute; m <= toMinute; m += 15) out.push({ value: m, label: formatMinute(m) });
  return out;
}
