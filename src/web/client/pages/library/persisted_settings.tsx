import {
  Validator,
  decodeMessage,
  encodeMessage,
  isNumber,
} from "@/web/utils/rpc/parsing";
import React from "react";

function getStored<T>(key: string, validator: Validator<T>): T | undefined {
  const stored = localStorage.getItem(key);
  if (stored === null) {
    return undefined;
  }
  try {
    return decodeMessage(stored, validator);
  } catch {
    return undefined;
  }
}

export function usePersistedState<T>(
  defaultValue: T,
  storageKey: string,
  validator: Validator<T>
): [T, (t: T) => any] {
  const stored = getStored(storageKey, validator);
  const [value, setValue] = React.useState<T>(stored || defaultValue);
  const wrappedSetter = (t: T) => {
    localStorage.setItem(storageKey, encodeMessage(t));
    setValue(t);
  };
  return [value, wrappedSetter];
}

export function usePersistedNumber(defaultValue: number, storageKey: string) {
  return usePersistedState(defaultValue, storageKey, isNumber);
}
