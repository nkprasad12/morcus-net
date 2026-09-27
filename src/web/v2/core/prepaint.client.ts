/**
 * Pre-paint snapshot: the bundle's half of the fixed-size critical script
 * (`shell/critical_theme.client.ts`).
 *
 * Owners of layout-affecting preferences call {@link setPrepaint} with the
 * final value to put on <html>. It is applied now and recorded in one flat
 * localStorage object, which the critical script copies onto <html> before
 * first paint on the next load. The critical script never validates or maps
 * values, so adding a preference costs it no bytes; see "Pre-paint is a
 * scarce budget" in `dict/PREFERENCES.md` for which preferences qualify.
 *
 * Call it on every connect with the current value, not only on change, so a
 * stale snapshot (e.g. after V1 changed `GlobalSettings`) heals after one
 * load.
 */

import { storage } from "@/web/v2/core/storage.client";

/** localStorage key holding the pre-paint snapshot the critical script applies. */
export const PREPAINT_KEY = "morcus_prepaint";

export type PrepaintName = `--${string}` | `data-${string}`;

function isPrepaintName(name: string): name is PrepaintName {
  return name.startsWith("--") || name.startsWith("data-");
}

/** The stored snapshot; `{}` if absent, corrupt, or storage is unavailable. */
function readSnapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const parsed: unknown = JSON.parse(storage.get(PREPAINT_KEY) ?? "{}");
    if (typeof parsed === "object" && parsed !== null) {
      for (const [name, value] of Object.entries(parsed)) {
        if (typeof value === "string" && isPrepaintName(name)) {
          out[name] = value;
        }
      }
    }
  } catch {
    // Corrupt snapshot: start over.
  }
  return out;
}

/**
 * Applies `name` to <html> now and records it for the critical script to
 * apply before first paint on the next load. `name` must be a
 * `--custom-property` or a `data-*` attribute. `null` removes it. Values are
 * final strings: the bundle validates and maps; the critical script only
 * copies.
 */
export function setPrepaint(name: PrepaintName, value: string | null): void {
  // The type enforces this; the runtime check keeps anything else (an event
  // handler attribute, `style`) out of the snapshot the critical script
  // trusts.
  if (!isPrepaintName(name)) {
    throw new Error(`Not a pre-paint name: ${String(name)}`);
  }
  const root = document.documentElement;
  if (name.startsWith("--")) {
    if (value === null) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  } else if (value === null) {
    root.removeAttribute(name);
  } else {
    root.setAttribute(name, value);
  }

  // Read-modify-write, so owners in different chunks never clobber each
  // other. Silently skipped if storage is unavailable (sandboxed iframes).
  const snapshot = readSnapshot();
  if (snapshot[name] === (value ?? undefined)) return;
  if (value === null) delete snapshot[name];
  else snapshot[name] = value;
  storage.set(PREPAINT_KEY, JSON.stringify(snapshot));
}
