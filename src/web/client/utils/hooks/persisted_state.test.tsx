/**
 * @jest-environment jsdom
 */

import type { NotFunction } from "@/web/client/utils/hooks/common";
import {
  getStored,
  usePersistedState,
} from "@/web/client/utils/hooks/persisted_state";
import { encodeMessage, isNumber } from "@/web/utils/rpc/parsing";
import { act, render } from "@testing-library/react";
import { useEffect, type MutableRefObject } from "react";

const KEY = "testKey";

function TestComponent<T extends NotFunction>(props: {
  storageKey: string;
  defaultValue: T;
  xRef: MutableRefObject<T>;
  setXRef?: MutableRefObject<((t: T) => unknown) | undefined>;
}) {
  const { xRef, setXRef } = props;
  const [x, setX] = usePersistedState(props.defaultValue, props.storageKey);

  useEffect(() => {
    if (setXRef) {
      setXRef.current = setX;
    }
  }, [setXRef, setX]);

  useEffect(() => {
    xRef.current = x;
  }, [xRef, x]);

  return <div />;
}

describe("usePersistedState", () => {
  it("uses default if no value is stored", () => {
    const xRef: MutableRefObject<number> = { current: -100 };
    render(<TestComponent xRef={xRef} storageKey={KEY} defaultValue={57} />);
    expect(xRef.current).toBe(57);
  });

  it("uses stored value if available", () => {
    localStorage.setItem(KEY, encodeMessage(42));
    const xRef: MutableRefObject<number> = { current: -100 };
    render(<TestComponent xRef={xRef} storageKey={KEY} defaultValue={57} />);

    expect(xRef.current).toBe(42);
  });

  it("updates local storage with set value", async () => {
    const xRef: MutableRefObject<number> = { current: -100 };
    const setXRef: MutableRefObject<((x: number) => void) | undefined> = {
      current: undefined,
    };

    render(
      <TestComponent
        xRef={xRef}
        storageKey={KEY}
        defaultValue={57}
        setXRef={setXRef}
      />
    );

    await act(async () => {
      setXRef.current?.(42);
    });

    expect(xRef.current).toBe(42);
    expect(getStored(KEY, isNumber)).toBe(42);
  });

  it("notifies other listeners", async () => {
    const xRef1: MutableRefObject<number> = { current: -100 };
    const xRef2: MutableRefObject<number> = { current: -100 };
    const setXRef: MutableRefObject<((x: number) => void) | undefined> = {
      current: undefined,
    };
    render(
      <div>
        <TestComponent
          xRef={xRef1}
          storageKey={KEY}
          defaultValue={57}
          setXRef={setXRef}
        />
        <TestComponent xRef={xRef2} storageKey={KEY} defaultValue={57} />
      </div>
    );
    expect(xRef2.current).toBe(57);

    await act(async () => {
      setXRef.current?.(42);
    });

    expect(xRef2.current).toBe(42);
  });

  afterEach(() => localStorage.clear());
});
