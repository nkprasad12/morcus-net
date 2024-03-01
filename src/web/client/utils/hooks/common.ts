import React, { type RefObject } from "react";

export type SetStateType<T> = React.Dispatch<React.SetStateAction<T>>;
export type NotFunction = boolean | string | number | object | null | undefined;

export function useWrappedSetter<T extends NotFunction>(
  setter: SetStateType<T>,
  consumer: (t: T) => any
): SetStateType<T> {
  return React.useCallback(
    (t: T | ((prev: T) => T)) => {
      if (typeof t !== "function") {
        consumer(t);
        setter(t);
      } else {
        setter((prev) => {
          const next = t(prev);
          consumer(next);
          return next;
        });
      }
    },
    [setter, consumer]
  );
}

export function useUpdateableRef<T>(initial: T): [RefObject<T>, (t: T) => any] {
  const ref = React.useRef<T>(initial);
  const setRef = React.useCallback((t: T) => {
    ref.current = t;
  }, []);
  return [ref, setRef];
}
