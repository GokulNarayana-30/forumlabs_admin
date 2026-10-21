import { formatInr } from '../inr';

describe('shared integer-paise INR formatter', () => {
  it.each([
    [0, '₹0'],
    [50, '₹0.50'],
    [10050, '₹100.50'],
    [1250000, '₹12,500'],
    [125000000, '₹12,50,000'],
    [125000050, '₹12,50,000.50'],
  ])('formats %s paise as %s', (paise, expected) => expect(formatInr(paise)).toBe(expected));
  it.each([1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects non-integer or unsafe paise %s',
    (paise) => {
      expect(() => formatInr(paise)).toThrow(RangeError);
    },
  );
});
