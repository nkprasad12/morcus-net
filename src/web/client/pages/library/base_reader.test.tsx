/**
 * @jest-environment jsdom
 */

import {
  handleSideTap,
  makeOnDrag,
} from "@/web/client/pages/library/base_reader";

global.window.innerHeight = 5757;
global.window.innerWidth = 420;

describe("handleSideTap", () => {
  it("does not invoke the listener on a middle tap", () => {
    const listener = jest.fn();
    handleSideTap({ clientX: 210 }, listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it("invokes the listener on a left tap", () => {
    const listener = jest.fn();
    handleSideTap({ clientX: 20 }, listener);
    expect(listener).toHaveBeenCalledWith("Right", 1);
  });

  it("invokes the listener on a right tap", () => {
    const listener = jest.fn();
    handleSideTap({ clientX: 400 }, listener);
    expect(listener).toHaveBeenCalledWith("Left", 1);
  });
});

describe("makeOnDrag", () => {
  const MAX_SIZE = 500;

  let dragStartLen: React.MutableRefObject<number | undefined>;
  let dragStartPos: React.MutableRefObject<number | undefined>;
  let currentLen: number = 5;
  let setCurrentLen: jest.Mock;
  let onDrag: (currentPos: number) => boolean;

  function setupCallback(options?: {
    minRatio?: number;
    maxRatio?: number;
    reverse?: boolean;
  }) {
    dragStartLen = { current: 50 };
    dragStartPos = { current: 100 };
    setCurrentLen = jest.fn((cb) => {
      currentLen = cb(currentLen);
    });
    onDrag = makeOnDrag(
      dragStartLen,
      dragStartPos,
      setCurrentLen,
      () => MAX_SIZE,
      options?.minRatio,
      options?.maxRatio,
      options?.reverse
    );
  }

  beforeEach(() => {
    setupCallback();
  });

  it("returns false if dragStartLen is undefined", () => {
    dragStartLen.current = undefined;
    const result = onDrag(100);
    expect(result).toBe(false);
  });

  it("sets dragStartPos if undefined", () => {
    dragStartLen.current = 50;
    onDrag(100);
    expect(dragStartPos.current).toBe(100);
  });

  it("updates length correctly", () => {
    dragStartLen.current = 50;
    dragStartPos.current = 100;

    onDrag(80);
    expect(currentLen).toBe(70); // 50 + (100 - 80)
  });

  it("respects minRatio and maxRatio", () => {
    dragStartLen.current = 60;
    dragStartPos.current = 120;

    onDrag(195);
    expect(currentLen).toBe(0);
    onDrag(-500);
    expect(currentLen).toBe(MAX_SIZE);
  });

  it("respects custom minRatio and maxRatio", () => {
    setupCallback({ minRatio: 0.1, maxRatio: 0.9 });
    dragStartLen.current = 55;
    dragStartPos.current = 100;

    onDrag(110);
    expect(currentLen).toBe(50); // 0.1 * 500
    onDrag(-500);
    expect(currentLen).toBe(450); // 0.9 * 500
  });

  it("handles reverse dragging", () => {
    setupCallback({ reverse: true });
    dragStartLen.current = 50;
    dragStartPos.current = 100;

    onDrag(80);
    expect(currentLen).toBe(30); // 50 - (100 - 80)
  });
});
