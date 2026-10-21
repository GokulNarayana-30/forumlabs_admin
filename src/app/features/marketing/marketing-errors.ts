import { ApiClientError } from '../../core/api/api-client.service';

/**
 * The text to show for a failed marketing request. The API's own contract message is safe to show
 * (it never holds personal values); anything else gets the screen's fallback. 503 is named, because
 * "try again shortly" is the only useful advice there.
 */
export function marketingErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    if (error.status === 503 && error.details?.['push'] === 'down') {
      return 'Push notifications are not connected yet, so campaigns cannot be test-sent or scheduled.';
    }
    if (error.status === 503) return 'Marketing is temporarily unavailable. Try again shortly.';
    if (error.message) return error.message;
  }
  return fallback;
}
