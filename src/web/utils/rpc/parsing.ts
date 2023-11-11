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

/**
 * Serializes the input object.
 *
 * @param t The object to serialize.
 * @param registry The registry containing serialization steps for classes.
 * @param isInUrl Whether the object will be sent as part of a URL.
 * @returns A serialized string representation of the input.
 */
export function encodeMessage<T>(
  t: T,
  registry?: Serialization<any>[],
  isInUrl?: boolean
): string {
  const serialized = JSON.stringify({ w: t }, (_key, value) => {
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
  return isInUrl === true ? encodeURIComponent(serialized) : serialized;
}

/**
 * Deserialized a serialized message.
 *
 * @param t The serialized string.
 * @param validator A function used to validate whether the raw string
 *                  conforms to the expected shape.
 * @param registry A registry of serializations for class objects.
 * @param isFromUrl Whether the the serialized string was received URL encoded.
 *
 * @returns The serialized object, if valid.
 */
export function decodeMessage<T>(
  t: string,
  validator: Validator<T>,
  registry?: Serialization<any>[],
  isFromUrl?: boolean
): T {
  const decoded = isFromUrl ? decodeURIComponent(t) : t;
  const result = JSON.parse(decoded, (_key, value) => {
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
    result.w,
    "Received improperly wrapped message!"
  );
  if (!validator(data)) {
    throw new Error("Invalid message received!");
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

export function isAny(x: unknown): x is any {
  return true;
}

export type Class<T> = { new (...args: any[]): T };

export function typeOf(type: "string"): (x: unknown) => x is string;
export function typeOf(type: "boolean"): (x: unknown) => x is boolean;
export function typeOf(type: "number"): (x: unknown) => x is number;
export function typeOf(type: "object"): (x: unknown) => x is object;
export function typeOf(type: "string" | "boolean" | "number" | "object") {
  return (x: unknown) => typeof x === type;
}

export function instanceOf<T>(c: Class<T>): (x: unknown) => x is T {
  return (x): x is T => x instanceof c;
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

export function isRecord<V>(
  vVal: (v: unknown) => v is V
): (x: unknown) => x is Record<string, V> {
  return (x): x is Record<string, V> => {
    if (typeof x !== "object" || x === null) {
      return false;
    }
    for (const [_, value] of Object.entries(x)) {
      if (!vVal(value)) {
        return false;
      }
    }
    return true;
  };
}

export function maybeUndefined<T>(
  checker: (x: unknown) => x is T
): (x: unknown) => x is T | undefined {
  return (x: unknown): x is T | undefined => {
    return x === undefined || checker(x);
  };
}

export function matches<T>(
  fieldCheckers: [string, (x: unknown) => boolean][]
): (x: unknown) => x is T {
  return (x: unknown): x is T => {
    if (x === null) {
      return false;
    }
    if (typeof x !== "object") {
      return false;
    }
    for (const [name, checker] of fieldCheckers) {
      // @ts-ignore
      const value = x[name];
      if (!checker(value)) {
        return false;
      }
    }
    return true;
  };
}
