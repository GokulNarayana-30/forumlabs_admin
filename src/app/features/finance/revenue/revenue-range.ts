export type RevenuePreset = 'last7' | 'last30' | 'last12weeks' | 'last12months';
export type RevenueGranularity = 'day' | 'week' | 'month';

export interface RevenueRange {
  from: string;
  to: string;
  granularity: RevenueGranularity;
}

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns today's date in Asia/Kolkata (IST = UTC + 05:30) as YYYY-MM-DD.
 */
export function todayIstYmd(date = new Date()): string {
  const istMs = date.getTime() + (5 * 60 + 30) * 60 * 1000;
  const istDate = new Date(istMs);
  const y = istDate.getUTCFullYear();
  const m = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(istDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Pure date addition/subtraction using UTC date parts.
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const outY = dt.getUTCFullYear();
  const outM = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const outD = String(dt.getUTCDate()).padStart(2, '0');
  return `${outY}-${outM}-${outD}`;
}

/**
 * Returns preset ranges for today.
 */
export function presetRange(preset: RevenuePreset, today: string): RevenueRange {
  switch (preset) {
    case 'last7':
      return {
        from: addDays(today, -6),
        to: today,
        granularity: 'day',
      };
    case 'last30':
      return {
        from: addDays(today, -29),
        to: today,
        granularity: 'day',
      };
    case 'last12weeks':
      return {
        from: addDays(today, -83),
        to: today,
        granularity: 'week',
      };
    case 'last12months':
      return {
        from: addDays(today, -364),
        to: today,
        granularity: 'month',
      };
  }
}

/**
 * Validates a range against server limits (93 days for day granularity, 400 days for week/month).
 * Returns null if valid, or the name of the failing field ('from' | 'to').
 */
export function validateRange(options: {
  from: string;
  to: string;
  granularity: RevenueGranularity;
  today: string;
}): 'from' | 'to' | null {
  const { from, to, granularity, today } = options;
  if (!YMD_REGEX.test(from)) return 'from';
  if (!YMD_REGEX.test(to)) return 'to';

  const [fy, fm, fd] = from.split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const [ty, tm, td] = to.split('-').map(Number);
  const toUtc = Date.UTC(ty, tm - 1, td);
  const [oy, om, od] = today.split('-').map(Number);
  const todayUtc = Date.UTC(oy, om - 1, od);

  if (isNaN(fromUtc)) return 'from';
  if (isNaN(toUtc)) return 'to';
  if (toUtc > todayUtc) return 'to';
  if (fromUtc > toUtc) return 'to';

  const daysInclusive = Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000)) + 1;
  const maxDays = granularity === 'day' ? 93 : 400;
  if (daysInclusive > maxDays) return 'from';

  return null;
}

/**
 * Formats basis points (e.g. 2500 -> 25.0%, null -> -).
 */
export function formatBasisPoints(bp: number | null | undefined): string {
  if (bp === null || bp === undefined) return '-';
  return (bp / 100).toFixed(1) + '%';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Returns user-friendly period label based on granularity.
 */
export function periodLabel(periodStart: string, granularity: RevenueGranularity): string {
  if (!periodStart) return '';
  const [y, m, d] = periodStart.split('-').map(Number);
  const monthName = MONTHS[m - 1];
  if (granularity === 'month') {
    return `${monthName} ${y}`;
  }
  if (granularity === 'week') {
    return `Week of ${d} ${monthName} ${y}`;
  }
  return `${d} ${monthName} ${y}`;
}

/**
 * Formats API ISO timestamp to "DD MMM YYYY, H:mm am/pm IST".
 */
export function formatAsOf(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
    return `${formatted} IST`;
  } catch {
    return '-';
  }
}

/**
 * Formats missing computed days string.
 */
export function formatMissingDays(days: string[]): string {
  if (!days || days.length === 0) return '';
  const countStr = days.length === 1 ? '1 day' : `${days.length} days`;
  const formatted = days.map((d) => periodLabel(d, 'day')).join(', ');
  return `No figures yet for ${countStr}: ${formatted}`;
}
