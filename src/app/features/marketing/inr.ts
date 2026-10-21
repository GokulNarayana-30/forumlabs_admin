/** Format integer paise exactly as INR, using Indian grouping and preserving nonzero paise. */
export function formatInr(paise: number): string {
  if (!Number.isSafeInteger(paise)) throw new RangeError('Expected integer paise');
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}
