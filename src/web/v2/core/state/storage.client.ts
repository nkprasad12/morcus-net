/**
 * Safe, defensive browser localStorage utilities for UI V2.
 *
 * Gracefully handles environments where localStorage is disabled, throws
 * SecurityError (e.g. sandboxed iframes, private browsing mode), or is over quota.
 */

export const storage = {
  /**
   * Retrieves a string value, or null if unset or on storage error.
   */
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  /**
   * Stores a string value. Safely swallows errors (e.g. quota exceeded or disabled).
   */
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore storage errors
    }
  },

  /**
   * Removes a key from storage. Safely swallows errors.
   */
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage errors
    }
  },

  /**
   * Reads a boolean flag.
   * If unset or unparseable, returns defaultValue (default: false).
   */
  getBoolean(key: string, defaultValue = false): boolean {
    const raw = storage.get(key);
    if (raw === "true" || raw === '{"w":true}') return true;
    if (raw === "false" || raw === '{"w":false}') return false;
    return defaultValue;
  },

  /**
   * Persists a boolean flag as "true" or "false".
   */
  setBoolean(key: string, value: boolean): void {
    storage.set(key, String(value));
  },

  /**
   * Reads and parses raw JSON from storage.
   * Returns parsed value as unknown, or undefined if unset or invalid JSON.
   */
  getJson(key: string): unknown {
    const raw = storage.get(key);
    if (!raw) return undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed;
    } catch {
      return undefined;
    }
  },

  /**
   * Serializes and persists a value as JSON.
   */
  setJson(key: string, value: unknown): void {
    if (value === undefined) {
      storage.remove(key);
      return;
    }
    try {
      storage.set(key, JSON.stringify(value));
    } catch {
      // Ignore serialization/storage errors
    }
  },
};
