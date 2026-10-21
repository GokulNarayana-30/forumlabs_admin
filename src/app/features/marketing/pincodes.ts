/** Indian pincode: six digits, not starting with 0. */
const PINCODE = /^[1-9][0-9]{5}$/;

export interface PincodeParse {
  /** Distinct valid pincodes in the order typed. */
  pincodes: string[];
  /** Entries that are not pincodes, shown back to the staff member. */
  invalid: string[];
}

/** Splits free text on commas, spaces and new lines. Nothing is dropped silently. */
export function parsePincodes(text: string): PincodeParse {
  const entries = text
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const invalid = entries.filter((p) => !PINCODE.test(p));
  const pincodes = Array.from(new Set(entries.filter((p) => PINCODE.test(p))));
  return { pincodes, invalid };
}
