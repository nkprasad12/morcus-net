/**
 * Generic cookie parsing and serialization utilities for UI V2.
 *
 * Isomorphic: safe to use in both Node.js SSR and client browser code.
 */

export interface CookieSerializeOptions {
  /** Cookie path. Defaults to "/". */
  path?: string;
  /** Max-Age in seconds. Defaults to 31536000 (1 year). */
  maxAge?: number;
  /** SameSite attribute. Defaults to "Lax". */
  sameSite?: "Lax" | "Strict" | "None";
}

/** One year in seconds (365 days). */
export const COOKIE_MAX_AGE_ONE_YEAR = 31536000;

const DEFAULT_COOKIE_OPTIONS: Readonly<CookieSerializeOptions> = {
  path: "/",
  maxAge: COOKIE_MAX_AGE_ONE_YEAR,
  sameSite: "Lax",
};

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
 * Checks whether a named cookie is present in the cookie string.
 */
export function hasCookie(
  cookieString: string | undefined | null,
  name: string
): boolean {
  return readCookie(cookieString, name) !== null;
}

/**
 * Serializes a cookie name and value with standard attributes.
 * Defaults to: `; Path=/; Max-Age=31536000; SameSite=Lax`
 */
export function formatCookie(
  name: string,
  value: string,
  options?: CookieSerializeOptions
): string {
  const opts = { ...DEFAULT_COOKIE_OPTIONS, ...options };
  let cookie = `${name}=${encodeURIComponent(value)}`;

  if (opts.path) cookie += `; Path=${opts.path}`;
  if (typeof opts.maxAge === "number") cookie += `; Max-Age=${opts.maxAge}`;
  if (opts.sameSite) cookie += `; SameSite=${opts.sameSite}`;

  return cookie;
}
