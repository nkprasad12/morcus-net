import { checkPresent } from "@/common/assert";

const SERIALIZABLE_PREFIX = "SERIALIZABLE_PREFIX";

export type Validator<T> = (t: unknown) => t is T;
export interface Serializable<T> {
  name: string;
  validator: Validator<T>;
  toString: (t: T) => string;
  fromString: (data: string) => T;
}

export function encodeMessage<T>(t: T, registry?: Serializable<any>[]): string {
  return JSON.stringify({ wrappedData: t }, (_key, value) => {
    for (const serializable of registry || []) {
      if (!serializable.validator(t)) {
        continue;
      }
      // const result: { [key: string]: string } = {};
      // const key = (result[SERIALIZABLE_PREFIX + serializable.name] =
      //   serializable.toString(t));
      // return result;
    }
    return value;
  });
}

export function decodeMessage<T>(
  t: string,
  validator: Validator<T>,
  registry?: Serializable<any>[]
): T {
  const result = JSON.parse(t, (key, value) => {
    for (const serializable of registry || []) {
      const propName = SERIALIZABLE_PREFIX + serializable.name;
      if (key !== propName) {
        continue;
      }
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

export function isArray<T>(x: unknown, tVal: (t: unknown) => t is T): x is T[] {
  if (!Array.isArray(x)) {
    return false;
  }
  for (const t of x) {
    if (!tVal(t)) {
      return false;
    }
  }
  return true;
}
