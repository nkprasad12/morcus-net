/**
 * Generic cookie parsing and serialization utilities for UI V2.
 *
 * Isomorphic: safe to use in both Node.js SSR and client browser code.
 */

/** One year in seconds (365 days). */
export const COOKIE_MAX_AGE_ONE_YEAR = 31536000;

/**
 * Reads a single named cookie value out of a raw cookie string
 * (e.g. an HTTP `Cookie` request header or browser `document.cookie`).
 *
 * Returns null when the header is absent or does not contain the named cookie.
 */
export function readCookie(
  cookieString: string | undefined | null,
  name: string
): string | null {
  if (!cookieString) return null;
  for (const part of cookieString.split(";")) {
    const [rawName, ...valParts] = part.trim().split("=");
    if (rawName.trim() === name) {
      const rawVal = valParts.join("=").trim();
      try {
        return decodeURIComponent(rawVal);
      } catch {
        return rawVal;
      }
    }
  }
  return null;
}

/**
 * Serializes a cookie name and value with standard attributes:
 * `; Path=/; Max-Age=31536000; SameSite=Lax`
 */
export function formatCookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE_ONE_YEAR}; SameSite=Lax`;
}
