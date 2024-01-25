import { Closeable } from "@/web/client/utils/indexdb/types";
import { useEffect, useState } from "react";

export function useCloseable<T>(provider: () => T & Closeable): T;
export function useCloseable<T>(
  provider: () => Promise<T & Closeable>
): Promise<T>;
export function useCloseable<T>(
  provider: () => (T & Closeable) | Promise<T & Closeable>
): T | Promise<T> {
  // eslint-disable-next-line react/hook-use-state
  const [t, _setT] = useState(provider);
  useEffect(() => {
    return () => {
      Promise.resolve(t).then((r) => r.close());
    };
  }, [t]);
  return t;
}
