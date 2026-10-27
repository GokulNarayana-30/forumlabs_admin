import { describe, it, expect } from 'vitest';
import {
  presetRange,
  addDays,
  todayIstYmd,
  validateRange,
  formatBasisPoints,
  periodLabel,
  formatAsOf,
  formatMissingDays,
} from './revenue-range';

describe('revenue-range', () => {
  const today = '2026-10-27';

  it('presetRange computes accurate UTC ranges without host-zone drift', () => {
    expect(presetRange('last7', today)).toEqual({
      from: '2026-10-21',
      to: '2026-10-27',
      granularity: 'day',
    });
    expect(presetRange('last30', today)).toEqual({
      from: '2026-09-28',
      to: '2026-10-27',
      granularity: 'day',
    });
    expect(presetRange('last12weeks', today)).toEqual({
      from: '2026-08-05',
      to: '2026-10-27',
      granularity: 'week',
    });
    expect(presetRange('last12months', today)).toEqual({
      from: '2025-10-28',
      to: '2026-10-27',
      granularity: 'month',
    });
  });

  it('addDays handles month/year roll-overs with UTC dates', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('todayIstYmd formats date in Asia/Kolkata timezone', () => {
    // 05:00 UTC on 27 Oct is 10:30 IST on 27 Oct
    expect(todayIstYmd(new Date('2026-10-27T05:00:00.000Z'))).toBe('2026-10-27');
    // 18:45 UTC on 26 Oct is 00:15 IST on 27 Oct
    expect(todayIstYmd(new Date('2026-10-26T18:45:00.000Z'))).toBe('2026-10-27');
  });

  it('validateRange mirrors server caps and validates bounds', () => {
    // Day granularity max 93 days
    expect(
      validateRange({ from: '2026-07-27', to: '2026-10-27', granularity: 'day', today }),
    ).toBeNull();
    expect(validateRange({ from: '2026-07-26', to: '2026-10-27', granularity: 'day', today })).toBe(
      'from',
    );

    // Week / Month granularity max 400 days
    expect(
      validateRange({ from: '2025-09-23', to: '2026-10-27', granularity: 'week', today }),
    ).toBeNull();
    expect(
      validateRange({ from: '2025-09-22', to: '2026-10-27', granularity: 'week', today }),
    ).toBe('from');
    expect(
      validateRange({ from: '2025-09-23', to: '2026-10-27', granularity: 'month', today }),
    ).toBeNull();
    expect(
      validateRange({ from: '2025-09-22', to: '2026-10-27', granularity: 'month', today }),
    ).toBe('from');

    // to after today names 'to'
    expect(validateRange({ from: '2026-10-01', to: '2026-10-28', granularity: 'day', today })).toBe(
      'to',
    );

    // from after to names 'to'
    expect(validateRange({ from: '2026-10-25', to: '2026-10-20', granularity: 'day', today })).toBe(
      'to',
    );

    // Malformed dates
    expect(validateRange({ from: 'invalid', to: '2026-10-27', granularity: 'day', today })).toBe(
      'from',
    );
    expect(validateRange({ from: '2026-10-01', to: 'invalid', granularity: 'day', today })).toBe(
      'to',
    );
  });

  it('formatBasisPoints formats basis points as percentages', () => {
    expect(formatBasisPoints(5000)).toBe('50.0%');
    expect(formatBasisPoints(3333)).toBe('33.3%');
    expect(formatBasisPoints(0)).toBe('0.0%');
    expect(formatBasisPoints(null)).toBe('-');
    expect(formatBasisPoints(undefined)).toBe('-');
  });

  it('periodLabel formats periods according to granularity in IST', () => {
    expect(periodLabel('2026-10-19', 'week')).toBe('Week of 19 Oct 2026');
    expect(periodLabel('2026-10-19', 'month')).toBe('Oct 2026');
    expect(periodLabel('2026-10-19', 'day')).toBe('19 Oct 2026');
  });

  it('formatAsOf formats ISO timestamp to IST display string', () => {
    expect(formatAsOf('2026-10-24T02:00:00.000Z')).toBe('24 Oct 2026, 7:30 am IST');
    expect(formatAsOf(null)).toBe('-');
    expect(formatAsOf(undefined)).toBe('-');
  });

  it('formatMissingDays formats list of missing computed days', () => {
    expect(formatMissingDays(['2026-10-25'])).toBe('No figures yet for 1 day: 25 Oct 2026');
    expect(formatMissingDays(['2026-10-25', '2026-10-26'])).toBe(
      'No figures yet for 2 days: 25 Oct 2026, 26 Oct 2026',
    );
    expect(formatMissingDays([])).toBe('');
  });
});
