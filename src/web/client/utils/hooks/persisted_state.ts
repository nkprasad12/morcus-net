import { setMap } from "@/common/data_structures/collect_map";
import {
  useWrappedSetter,
  type NotFunction,
  type SetStateType,
} from "@/web/client/utils/hooks/common";
import {
  Validator,
  decodeMessage,
  encodeMessage,
  isBoolean,
  isNumber,
  isString,
} from "@/web/utils/rpc/parsing";
import { useCallback, useEffect, useState } from "react";

const BASIC_VALIDATORS = [isString, isBoolean, isNumber];

/** Exported ONLY for unit testing. Do not use. */
export const PERSISTED_LISTENERS = setMap<string, (x: any) => unknown>();

export function getStored<T>(
  key: string,
  validator: Validator<T>
): T | undefined {
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

function resolveValidatorFor<T>(
  t: T,
  maybeValidator?: Validator<T>
): Validator<T> {
  if (maybeValidator) return maybeValidator;
  for (const validator of BASIC_VALIDATORS) {
    // @ts-expect-error [We now know that the validator matches.]
    if (validator(t)) return validator;
  }
  throw new Error(
    `Pass in a custom validator or update the default validators.`
  );
}

export function usePersistedState<T extends NotFunction>(
  defaultValue: T,
  storageKey: string,
  maybeValidator?: Validator<T>
): [T, SetStateType<T>] {
  const validator = resolveValidatorFor(defaultValue, maybeValidator);
  const [value, setValue] = useState<T>(
    () => getStored(storageKey, validator) ?? defaultValue
  );

  useEffect(() => {
    PERSISTED_LISTENERS.add(storageKey, setValue);
    return () => {
      PERSISTED_LISTENERS.get(storageKey)?.delete(setValue);
    };
  }, [storageKey]);

  const onNewValue = useCallback(
    (t: T) => {
      localStorage.setItem(storageKey, encodeMessage(t));
      Array.from(PERSISTED_LISTENERS.get(storageKey)?.values() ?? []).forEach(
        (listener) => listener(t)
      );
    },
    [storageKey]
  );

  return [value, useWrappedSetter(setValue, onNewValue)];
}

export function usePersistedValue<T extends NotFunction>(
  defaultValue: T,
  storageKey: string
): T {
  return usePersistedState(defaultValue, storageKey)[0];
}
