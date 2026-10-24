export type Validator<T> = (t: unknown) => t is T;

interface Serializable<T> {
  serialize: (t: T) => string;
  deserialize: (data: string) => T;
}

export interface Serialization<T> extends Serializable<T> {
  name: string;
  validator: Validator<T>;
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

export function isPair<T, U>(
  tVal: (t: unknown) => t is T,
  uVal: (t: unknown) => t is U
): (x: unknown) => x is [T, U] {
  return (x): x is [T, U] => {
    if (!Array.isArray(x) || x.length !== 2 || !tVal(x[0]) || !uVal(x[1])) {
      return false;
    }
    return true;
  };
}

export function isTriplet<T, U, V>(
  tVal: (t: unknown) => t is T,
  uVal: (t: unknown) => t is U,
  vVal: (t: unknown) => t is V
): (x: unknown) => x is [T, U, V] {
  return (x): x is [T, U, V] => {
    if (
      !Array.isArray(x) ||
      x.length !== 3 ||
      !tVal(x[0]) ||
      !uVal(x[1]) ||
      !vVal(x[2])
    ) {
      return false;
    }
    return true;
  };
}

export function isOneOf<T, U>(
  tVal: (t: unknown) => t is T,
  uVal: (t: unknown) => t is U
): (x: unknown) => x is T | U {
  return (x): x is T | U => {
    if (tVal(x)) {
      return true;
    }
    if (uVal(x)) {
      return true;
    }
    return false;
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

export function matchesObject<T extends object>(
  fieldCheckers: Record<keyof T, Validator<T[keyof T]>>
): (x: unknown) => x is T {
  return (x: unknown): x is T => {
    if (x === null) {
      return false;
    }
    if (typeof x !== "object") {
      return false;
    }
    for (const property in fieldCheckers) {
      // @ts-ignore
      const value = x[property];
      if (!fieldCheckers[property](value)) {
        return false;
      }
    }
    return true;
  };
}

export function isBoth<T, U>(
  tChecker: Validator<T>,
  uChecker: Validator<U>
): Validator<T & U> {
  return (x: unknown): x is T & U => tChecker(x) && uChecker(x);
}

export function isLiteral<T extends string | number | boolean>(
  literal: T
): Validator<T> {
  return (x: unknown): x is T => x === literal;
}
