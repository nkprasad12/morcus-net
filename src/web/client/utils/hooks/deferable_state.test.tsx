/**
 * @jest-environment jsdom
 */

import type { SetStateType } from "@/web/client/utils/hooks/common";
import { useDeferableState } from "@/web/client/utils/hooks/deferable_state";
import { act, render } from "@testing-library/react";
import { useEffect, type MutableRefObject, type RefObject } from "react";

function TestComponent(props: {
  xRef: MutableRefObject<number>;
  setXRef: MutableRefObject<SetStateType<number>>;
  xRefRef: MutableRefObject<RefObject<number>>;
}) {
  const [x, setX, xRef] = useDeferableState<number>(57);

  useEffect(() => {
    props.xRef.current = x;
    props.setXRef.current = setX;
    props.xRefRef.current = xRef;
  });

  return <div>{x}</div>;
}

describe("useDeferableState", () => {
  it("has expected default value", () => {
    const xRef: MutableRefObject<number> = { current: 0 };
    const setXRef: MutableRefObject<SetStateType<number>> = {
      current: () => {},
    };
    const xRefRef: MutableRefObject<RefObject<number>> = {
      current: { current: 0 },
    };

    render(<TestComponent xRef={xRef} setXRef={setXRef} xRefRef={xRefRef} />);

    expect(xRef.current).toBe(57);
    expect(xRefRef.current.current).toBe(57);
  });

  it("updates values but not refs on regular update", () => {
    const xRef: MutableRefObject<number> = { current: 0 };
    const setXRef: MutableRefObject<SetStateType<number>> = {
      current: () => {},
    };
    const xRefRef: MutableRefObject<RefObject<number>> = {
      current: { current: 0 },
    };
    render(<TestComponent xRef={xRef} setXRef={setXRef} xRefRef={xRefRef} />);
    const oldSetX: SetStateType<number> = setXRef.current;
    const oldXRef: RefObject<number> = xRefRef.current;

    act(() => setXRef.current(26));

    expect(xRef.current).toBe(26);
    expect(xRefRef.current.current).toBe(26);
    expect(oldSetX).toBe(setXRef.current);
    expect(oldXRef).toBe(xRefRef.current);
  });

  it("updates values but not refs on dispatch", () => {
    const xRef: MutableRefObject<number> = { current: 0 };
    const setXRef: MutableRefObject<SetStateType<number>> = {
      current: () => {},
    };
    const xRefRef: MutableRefObject<RefObject<number>> = {
      current: { current: 0 },
    };
    render(<TestComponent xRef={xRef} setXRef={setXRef} xRefRef={xRefRef} />);
    const oldSetX: SetStateType<number> = setXRef.current;
    const oldXRef: RefObject<number> = xRefRef.current;

    act(() => setXRef.current((old) => old * 2));

    expect(xRef.current).toBe(114);
    expect(xRefRef.current.current).toBe(114);
    expect(oldSetX).toBe(setXRef.current);
    expect(oldXRef).toBe(xRefRef.current);
  });
});
