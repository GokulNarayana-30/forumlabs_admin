/**
 * Plain words for the reasons the API refuses a field action (the `kind` of the answer). Unknown kinds
 * keep the technical word so nothing is hidden.
 */
export function refusalText(action: string, kind: string): string {
  switch (kind) {
    case 'event_not_allowed':
      return `${action}: this booking cannot be updated now (it may be cancelled, or already past this step). Refresh the list.`;
    case 'payment_amount_mismatch':
      return `${action}: the amount does not match the booking total.`;
    case 'payment_missing':
      return `${action}: a payment must be recorded first.`;
    case 'reason_not_listed':
      return `${action}: choose one of the listed reasons.`;
    default:
      return `${action}: ${kind}`;
  }
}
