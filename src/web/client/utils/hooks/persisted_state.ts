import {
  type NotFunction,
  type SetStateType,
} from "@/web/client/utils/hooks/common";
import {
  Validator,
  decodeMessage,
  encodeMessage,
  isBoolean,
  isNumber,
} from "@/web/utils/rpc/parsing";
import { useEffect, useState } from "react";

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

export function usePersistedState<T extends NotFunction>(
  defaultValue: T,
  storageKey: string,
  validator: Validator<T>
): [T, SetStateType<T>] {
  const [value, setValue] = useState<T>(
    () => getStored(storageKey, validator) || defaultValue
  );
  useEffect(() => {
    localStorage.setItem(storageKey, encodeMessage(value));
  }, [value, storageKey]);
  return [value, setValue];
}

export function usePersistedNumber(defaultValue: number, storageKey: string) {
  return usePersistedState(defaultValue, storageKey, isNumber);
}

export function usePersistedBool(defaultValue: boolean, storageKey: string) {
  return usePersistedState(defaultValue, storageKey, isBoolean);
}
