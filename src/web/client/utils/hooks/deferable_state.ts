import React from "react";
import {
  useUpdateableRef,
  type NotFunction,
  type SetStateType,
  useWrappedSetter,
} from "@/web/client/utils/hooks/common";

export function useDeferrableState<T extends NotFunction>(
  defaultValue: T
): [T, SetStateType<T>, React.RefObject<T>] {
  const [ref, setRef] = useUpdateableRef<T>(defaultValue);
  const [value, setValue] = React.useState<T>(defaultValue);
  return [value, useWrappedSetter(setValue, setRef), ref];
}
