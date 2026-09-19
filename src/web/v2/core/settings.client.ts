import { isBoolean, isNumber, Validator } from "@/web/utils/rpc/parsing";
import { storage } from "@/web/v2/core/storage.client";

/**
 * Typed LocalStorage settings store for UI V2.
 */

export interface GlobalSettings {
  darkMode?: boolean;
  highlightStrength?: number;
  autoOpenLogeion?: boolean;
  inflectedSearch?: boolean;
}

export const GLOBAL_SETTINGS_KEY = "GlobalSettings";

export type FieldCheckers<T> = {
  [K in keyof T]-?: Validator<NonNullable<T[K]>>;
};

/**
 * Extracts and validates properties from an unknown value based on a schema of validators.
 * Invalid or undefined fields are omitted from the returned partial object.
 */
export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function pickValid<T extends object>(
  raw: unknown,
  checkers: FieldCheckers<T>
): Partial<T> {
  if (!isRecord(raw)) {
    return {};
  }
  const result: Partial<T> = {};
  for (const property in checkers) {
    if (Object.prototype.hasOwnProperty.call(checkers, property)) {
      const val = raw[property];
      const checker = checkers[property];
      if (val !== undefined && checker(val)) {
        Reflect.set(result, property, val);
      }
    }
  }
  return result;
}

const GLOBAL_SETTINGS_CHECKERS: FieldCheckers<GlobalSettings> = {
  darkMode: isBoolean,
  highlightStrength: isNumber,
  autoOpenLogeion: isBoolean,
  inflectedSearch: isBoolean,
};

export function parseSettings(raw: string | null): GlobalSettings {
  if (!raw) return {};
  try {
    return pickValid<GlobalSettings>(JSON.parse(raw), GLOBAL_SETTINGS_CHECKERS);
  } catch {
    return {};
  }
}

export const settingsStore = {
  get(): GlobalSettings {
    return parseSettings(storage.get(GLOBAL_SETTINGS_KEY));
  },

  update(patch: Partial<GlobalSettings>): GlobalSettings {
    const current = settingsStore.get();
    const next = { ...current, ...patch };
    storage.setJson(GLOBAL_SETTINGS_KEY, next);
    return next;
  },
};
