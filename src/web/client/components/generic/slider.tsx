/* istanbul ignore file */

import { safeParseInt } from "@/common/misc_utils";

export interface Cancelable {
  clear(): void;
}

// Corresponds to 10 frames at 60 Hz.
// A few bytes payload overhead when lodash/debounce is ~3 kB and debounce ~300 B.
export default function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait = 166
) {
  let timeout: ReturnType<typeof setTimeout>;
  function debounced(...args: Parameters<T>) {
    const later = () => {
      // @ts-ignore
      func.apply(this, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  }

  debounced.clear = () => {
    clearTimeout(timeout);
  };

  return debounced as T & Cancelable;
}

export function Slider(props: {
  label: string;
  value: number;
  setValue: (t: number) => any;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <>
      <label htmlFor={props.label}>{props.label}</label>
      <input
        type="range"
        id={props.label}
        name={props.label}
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={debounce((e) => {
          const value = safeParseInt(e.target.value);
          value === undefined
            ? console.log("Invalid value: %s", value)
            : props.setValue(value);
        })}
      />
    </>
  );
}
