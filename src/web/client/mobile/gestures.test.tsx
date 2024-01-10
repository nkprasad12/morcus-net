/**
 * @jest-environment jsdom
 */

import {
  TouchEndData,
  handleTouchEnd,
  handleTouchMove,
} from "@/web/client/mobile/gestures";

global.window.innerHeight = 5757;
global.window.innerWidth = 420;

const realDate = Date.now;
const mockDate = jest.fn();
Date.now = mockDate;

function getEvent(
  clientX: number,
  clientY: number
): React.TouchEvent<HTMLElement> {
  return {
    // @ts-ignore
    touches: [{ clientX, clientY }],
  };
}

afterAll(() => {
  Date.now = realDate;
});

describe("handleTouchMove", () => {
  it("adds touch data as start and current on initial", () => {
    const isSwiping = { current: false };
    const ref = { current: null };
    const event = getEvent(5, 7);
    mockDate.mockReturnValue(57);

    handleTouchMove(event, ref, isSwiping);

    const touchData = { p: { x: 5, y: 7 }, t: 57 };
    expect(ref.current).toEqual([touchData, touchData]);
    expect(isSwiping.current).toBe(false);
  });

  it("adds touch data as start and current on initial", () => {
    const isSwiping = { current: false };
    const ref = { current: null };
    const event1 = getEvent(5, 7);
    const event2 = getEvent(57, 57);

    mockDate.mockReturnValue(57);
    handleTouchMove(event1, ref, isSwiping);
    mockDate.mockReturnValue(5757);
    handleTouchMove(event2, ref, isSwiping);

    const touchData1 = { p: { x: 5, y: 7 }, t: 57 };
    const touchData2 = { p: { x: 57, y: 57 }, t: 5757 };
    expect(ref.current).toEqual([touchData1, touchData2]);
  });

  it("invokes on swipe progress if needed", () => {
    const isSwiping = { current: false };
    const ref = { current: null };
    const onSwipeProgress = jest.fn();

    mockDate.mockReturnValue(57);
    handleTouchMove(getEvent(5, 7), ref, isSwiping, { onSwipeProgress });
    mockDate.mockReturnValue(58);
    handleTouchMove(getEvent(150, 7), ref, isSwiping, { onSwipeProgress });
    mockDate.mockReturnValue(59);
    handleTouchMove(getEvent(300, 7), ref, isSwiping, { onSwipeProgress });

    expect(isSwiping.current).toBe(true);
    expect(onSwipeProgress).toHaveBeenCalledTimes(2);
  });

  it("invokes on swipe cancel if needed", () => {
    const isSwiping = { current: false };
    const ref = { current: null };
    const onSwipeCancel = jest.fn();

    mockDate.mockReturnValue(57);
    handleTouchMove(getEvent(5, 7), ref, isSwiping, { onSwipeCancel });
    mockDate.mockReturnValue(58);
    handleTouchMove(getEvent(150, 7), ref, isSwiping, { onSwipeCancel });
    mockDate.mockReturnValue(59);
    handleTouchMove(getEvent(300, 7), ref, isSwiping, { onSwipeCancel });
    handleTouchMove(getEvent(300, 300), ref, isSwiping, { onSwipeCancel });

    expect(isSwiping.current).toBe(false);
    expect(onSwipeCancel).toHaveBeenCalled();
  });
});

describe("handleTouchEnd", () => {
  it("handles null touchData", () => {
    const onSwipeEnd = jest.fn();
    const isSwiping = { current: true };
    const ref = { current: null };

    handleTouchEnd(ref, isSwiping, { onSwipeEnd });

    expect(isSwiping.current).toBe(false);
    expect(onSwipeEnd).not.toHaveBeenCalled();
  });

  it("handles swipe no longer in progress", () => {
    const onSwipeEnd = jest.fn();
    const isSwiping = { current: false };
    const touchData: TouchEndData = [
      { p: { x: 215, y: 7 }, t: 57 },
      { p: { x: 5, y: 7 }, t: 58 },
    ];
    const ref = { current: touchData };

    handleTouchEnd(ref, isSwiping, { onSwipeEnd });

    expect(isSwiping.current).toBe(false);
    expect(onSwipeEnd).not.toHaveBeenCalled();
    expect(ref.current).toBeNull();
  });

  it("detects left swipe gesture", () => {
    const onSwipeEnd = jest.fn();
    const isSwiping = { current: true };
    const touchData: TouchEndData = [
      { p: { x: 215, y: 7 }, t: 57 },
      { p: { x: 5, y: 7 }, t: 58 },
    ];
    const ref = { current: touchData };

    handleTouchEnd(ref, isSwiping, { onSwipeEnd });

    expect(onSwipeEnd).toHaveBeenCalledWith("Left", 0.5);
    expect(ref.current).toBeNull();
  });

  it("detects swipe gesture with angle", () => {
    const onSwipeEnd = jest.fn();
    const isSwiping = { current: true };
    const touchData: TouchEndData = [
      { p: { x: 400, y: 57 }, t: 57 },
      { p: { x: 5, y: 7 }, t: 58 },
    ];
    const ref = { current: touchData };

    handleTouchEnd(ref, isSwiping, { onSwipeEnd });

    expect(onSwipeEnd).toHaveBeenCalledWith("Left", expect.closeTo(0.94798));
    expect(ref.current).toBeNull();
  });

  it("detects right swipe gesture", () => {
    const onSwipeEnd = jest.fn();
    const isSwiping = { current: true };
    const touchData: TouchEndData = [
      { p: { x: 5, y: 7 }, t: 57 },
      { p: { x: 215, y: 7 }, t: 58 },
    ];
    const ref = { current: touchData };

    handleTouchEnd(ref, isSwiping, { onSwipeEnd });

    expect(onSwipeEnd).toHaveBeenCalledWith("Right", 0.5);
    expect(ref.current).toBeNull();
  });

  it("does not call back on small gesture", () => {
    const onSwipeEnd = jest.fn();
    const isSwiping = { current: true };
    const touchData: TouchEndData = [
      { p: { x: 5, y: 7 }, t: 57 },
      { p: { x: 10, y: 7 }, t: 58 },
    ];
    const ref = { current: touchData };

    handleTouchEnd(ref, isSwiping, { onSwipeEnd });

    expect(onSwipeEnd).not.toHaveBeenCalled();
    expect(ref.current).toBeNull();
  });

  it("does not call back on slow gesture", () => {
    const onSwipeEnd = jest.fn();
    const isSwiping = { current: true };
    const touchData: TouchEndData = [
      { p: { x: 5, y: 7 }, t: 57 },
      { p: { x: 400, y: 7 }, t: 6666658 },
    ];
    const ref = { current: touchData };

    handleTouchEnd(ref, isSwiping, { onSwipeEnd });

    expect(onSwipeEnd).not.toHaveBeenCalled();
    expect(ref.current).toBeNull();
  });

  it("does not call back on angular gesture", () => {
    const onSwipeEnd = jest.fn();
    const isSwiping = { current: true };
    const touchData: TouchEndData = [
      { p: { x: 5, y: 7 }, t: 57 },
      { p: { x: 400, y: 407 }, t: 58 },
    ];
    const ref = { current: touchData };

    handleTouchEnd(ref, isSwiping, { onSwipeEnd });

    expect(onSwipeEnd).not.toHaveBeenCalled();
    expect(ref.current).toBeNull();
  });

  it("does not call back on vertical swipe", () => {
    const onSwipeEnd = jest.fn();
    const isSwiping = { current: true };
    const touchData: TouchEndData = [
      { p: { x: 400, y: 500 }, t: 57 },
      { p: { x: 400, y: 7 }, t: 58 },
    ];
    const ref = { current: touchData };

    handleTouchEnd(ref, isSwiping, { onSwipeEnd });

    expect(onSwipeEnd).not.toHaveBeenCalled();
    expect(ref.current).toBeNull();
  });
});
