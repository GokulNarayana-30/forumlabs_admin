import { ApiClientError } from './api-client.service';

/**
 * The text a feature shows for a failed request: the API's contract message for an ApiClientError
 * (422 field problems, 409 key reuse, 403 and so on), otherwise the given fallback. Raw thrown values
 * are never shown (WR-21).
 */
export function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError && err.message) return err.message;
  return fallback;
}
