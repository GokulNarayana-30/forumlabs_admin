/**
 * The booking statuses in which the server accepts an assignment (order-event-decision): after the
 * sample is collected a dispatcher can no longer assign or reassign, so the screens hide the button.
 */
const ASSIGNABLE_STATUSES: readonly string[] = [
  'confirmed',
  'phlebotomist_assigned',
  'on_the_way',
  'arrived',
];

export function isAssignableStatus(status: string): boolean {
  return ASSIGNABLE_STATUSES.includes(status);
}
