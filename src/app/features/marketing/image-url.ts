/**
 * The same image URL rule the API enforces (src/marketing/rules/image-url-validator.ts): https only,
 * at most 2048 characters, no credentials, and, when the allow-list is not empty, the host must be
 * a listed host or a dot-delimited subdomain of one. The URL is never fetched. Returns the problem
 * in plain words, or null when the URL is acceptable (an empty URL is allowed: the image is optional).
 */
export function imageUrlProblem(url: string, allowedHosts: readonly string[]): string | null {
  const value = url.trim();
  if (!value) return null;
  if (value.length > 2048) return 'Image URL must be at most 2048 characters.';

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return 'Invalid image URL format.';
  }
  if (parsed.protocol.toLowerCase() !== 'https:') return 'Image URL must use HTTPS.';
  if (parsed.username || parsed.password)
    return 'Image URL must not contain a username or password.';

  if (allowedHosts.length > 0) {
    const host = parsed.hostname.toLowerCase();
    const allowed = allowedHosts.some((raw) => {
      const h = raw.toLowerCase().trim();
      return host === h || host.endsWith(`.${h}`);
    });
    if (!allowed)
      return `Image host "${host}" is not in the allowed hosts (${allowedHosts.join(', ')}).`;
  }
  return null;
}
