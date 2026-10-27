import type { BreakdownResult, RevenueSummaryResult } from './revenue.service';

type Row = Record<string, unknown>;
const earnedFields =
  'orders_count customers_count returning_customers_count gross_booked_paise offer_discount_paise coupon_cost_paise collection_fee_paise tax_paise earned_paise refunds_against_paise';
const collectedFields =
  'cash_collected_paise upi_collected_paise cash_refunded_paise upi_refunded_paise collections_count refunds_count net_cash_paise net_upi_paise net_collected_paise';
const moneyFields =
  'gross_paise offer_discount_paise coupon_cost_paise collection_fee_paise tax_paise earned_paise';
const dimensions = [
  'item',
  'item_kind',
  'category',
  'pincode',
  'coupon',
  'method',
  'doctor',
  'department',
];

function refuse(): never {
  throw new Error('We could not read the revenue figures. Try again.');
}
function record(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  return value as Row;
}
function text(value: unknown): void {
  if (typeof value !== 'string') refuse();
}
function nullableText(value: unknown): void {
  if (value !== null) text(value);
}
function integer(value: unknown): void {
  if (!Number.isSafeInteger(value)) refuse();
}
function integers(row: Row, names: string): void {
  for (const name of names.split(' ')) integer(row[name]);
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) refuse();
  return value;
}
function header(row: Row, kind: string): void {
  if (row['kind'] !== kind) refuse();
  text(row['from']);
  text(row['to']);
  nullableText(row['as_of']);
  for (const day of array(row['missing_days'])) text(day);
}
function period(row: Row): void {
  text(row['period_start']);
  integer(row['days_in_range']);
  if (typeof row['partial'] !== 'boolean') refuse();
}
function earned(row: Row): void {
  integers(row, earnedFields);
  for (const field of ['repeat_rate_bp', 'aov_paise']) if (row[field] !== null) integer(row[field]);
}

export function decodeRevenueSummary(value: unknown): RevenueSummaryResult {
  const row = record(value);
  header(row, 'revenue_summary');
  if (!['day', 'week', 'month'].includes(String(row['granularity']))) refuse();
  for (const [name, validate] of [
    ['earned', earned],
    ['collected', (r: Row) => integers(r, collectedFields)],
    ['bookings', (r: Row) => integers(r, 'placed_count cancelled_count')],
  ] as const) {
    const block = record(row[name]);
    validate(record(block['totals']));
    for (const item of array(block['periods'])) {
      const p = record(item);
      period(p);
      validate(p);
    }
  }
  return value as RevenueSummaryResult;
}

export function decodeRevenueBreakdown(value: unknown): BreakdownResult {
  const row = record(value);
  header(row, 'revenue_breakdown');
  if (
    !dimensions.includes(String(row['dimension'])) ||
    typeof row['sums_to_headline'] !== 'boolean'
  )
    refuse();
  nullableText(row['notice']);
  if (row['scope_label'] !== null && row['scope_label'] !== 'app_and_web_bookings_only') refuse();
  integers(record(row['headline']), 'orders_count ' + moneyFields);
  integers(record(row['totals']), 'orders_count units_count ' + moneyFields);
  for (const item of array(row['rows'])) {
    const r = record(item);
    text(r['key_id']);
    text(r['key_label']);
    if (![null, 'test', 'package', 'fee'].includes(r['item_kind'] as string | null)) refuse();
    integers(r, 'orders_count units_count ' + moneyFields);
  }
  return value as BreakdownResult;
}
