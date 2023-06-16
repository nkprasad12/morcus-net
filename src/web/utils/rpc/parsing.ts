import { checkPresent } from "@/common/assert";

const PLACEHOLDER = "SERIALIZABLE_PLACEHOLDER";

export type Validator<T> = (t: unknown) => t is T;

export interface Serializable<T> {
  serialize: (t: T) => string;
  deserialize: (data: string) => T;
}

export interface Serialization<T> extends Serializable<T> {
  name: string;
  validator: Validator<T>;
}

export function encodeMessage<T>(
  t: T,
  registry?: Serialization<any>[]
): string {
  return JSON.stringify({ wrappedData: t }, (_key, value) => {
    for (const cls of registry || []) {
      if (!cls.validator(value)) {
        continue;
      }
      const result: { [key: string]: string } = {};
      result[PLACEHOLDER + cls.name] = cls.serialize(value);
      return result;
    }
    return value;
  });
}

export function decodeMessage<T>(
  t: string,
  validator: Validator<T>,
  registry?: Serialization<any>[]
): T {
  const result = JSON.parse(t, (_key, value) => {
    for (const serializable of registry || []) {
      const registered = value[PLACEHOLDER + serializable.name];
      if (registered === undefined) {
        continue;
      }
      return serializable.deserialize(registered);
    }
    return value;
  });
  const data: unknown = checkPresent(
    result.wrappedData,
    "Received improperly wrapped message!"
  );
  if (!validator(data)) {
    throw Error("Invalid message received!");
  }
  return data;
}

export function isString(x: unknown): x is string {
  return typeof x === "string";
}

export function isNumber(x: unknown): x is number {
  return typeof x === "number";
}

export function isBoolean(x: unknown): x is boolean {
  return typeof x === "boolean";
}

export function isArray<T>(
  tVal: (t: unknown) => t is T
): (x: unknown) => x is T[] {
  return (x): x is T[] => {
    if (!Array.isArray(x)) {
      return false;
    }
    for (const t of x) {
      if (!tVal(t)) {
        return false;
      }
    }
    return true;
  };
}
