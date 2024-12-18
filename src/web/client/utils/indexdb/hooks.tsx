import { assert } from "@/common/assert";
import { Closeable } from "@/web/client/utils/indexdb/types";
import { useEffect, useRef, useState } from "react";

export function useCloseable<T extends Closeable>(provider: () => T): T;
export function useCloseable<T extends Closeable>(
  provider: () => Promise<T>
): Promise<T>;
export function useCloseable<T extends Closeable>(
  provider: () => T | Promise<T>
): T | Promise<T> {
  // eslint-disable-next-line react/hook-use-state
  const [t, _setT] = useState(provider);
  useEffect(() => {
    const current = Promise.resolve(t);
    return () => {
      current.then((r) => r.close());
    };
  }, [t]);
  return t;
}

export function useUnchangeable<T>(
  value: NonNullable<T>,
  tag?: string
): NonNullable<T> {
  const ref = useRef<T>();
  assert(
    ref.current === undefined || ref.current === value,
    `${tag ?? "Value"} must be the same across renders.`
  );
  ref.current = value;
  return value;
}
