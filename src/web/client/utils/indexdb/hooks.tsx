import { Closeable } from "@/web/client/utils/indexdb/types";
import { useEffect, useState } from "react";

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
