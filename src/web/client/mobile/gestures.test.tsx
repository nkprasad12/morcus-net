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
    const ref = { current: null };
    const event = getEvent(5, 7);
    mockDate.mockReturnValue(57);

    handleTouchMove(event, ref);

    const touchData = { p: { x: 5, y: 7 }, t: 57 };
    expect(ref.current).toEqual([touchData, touchData]);
  });

  it("adds touch data as start and current on initial", () => {
    const ref = { current: null };
    const event1 = getEvent(5, 7);
    const event2 = getEvent(57, 57);

    mockDate.mockReturnValue(57);
    handleTouchMove(event1, ref);
    mockDate.mockReturnValue(5757);
    handleTouchMove(event2, ref);

    const touchData1 = { p: { x: 5, y: 7 }, t: 57 };
    const touchData2 = { p: { x: 57, y: 57 }, t: 5757 };
    expect(ref.current).toEqual([touchData1, touchData2]);
  });
});

describe("handleTouchEnd", () => {
  it("handles null touchData", () => {
    const onSwipe = jest.fn();
    const ref = { current: null };

    handleTouchEnd(ref, onSwipe);

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("detects left swipe gesture", () => {
    const onSwipe = jest.fn();
    const touchData: TouchEndData = [
      { p: { x: 400, y: 7 }, t: 57 },
      { p: { x: 5, y: 7 }, t: 58 },
    ];
    const ref = { current: touchData };

    handleTouchEnd(ref, onSwipe);

    expect(onSwipe).toHaveBeenCalledWith("Left");
    expect(ref.current).toBeNull();
  });

  it("detects swipe gesture with angle", () => {
    const onSwipe = jest.fn();
    const touchData: TouchEndData = [
      { p: { x: 400, y: 57 }, t: 57 },
      { p: { x: 5, y: 7 }, t: 58 },
    ];
    const ref = { current: touchData };

    handleTouchEnd(ref, onSwipe);

    expect(onSwipe).toHaveBeenCalledWith("Left");
    expect(ref.current).toBeNull();
  });

  it("detects right swipe gesture", () => {
    const onSwipe = jest.fn();
    const touchData: TouchEndData = [
      { p: { x: 5, y: 7 }, t: 57 },
      { p: { x: 400, y: 7 }, t: 58 },
    ];
    const ref = { current: touchData };

    handleTouchEnd(ref, onSwipe);

    expect(onSwipe).toHaveBeenCalledWith("Right");
    expect(ref.current).toBeNull();
  });

  it("does not call back on small gesture", () => {
    const onSwipe = jest.fn();
    const touchData: TouchEndData = [
      { p: { x: 5, y: 7 }, t: 57 },
      { p: { x: 100, y: 7 }, t: 58 },
    ];
    const ref = { current: touchData };

    handleTouchEnd(ref, onSwipe);

    expect(onSwipe).not.toHaveBeenCalled();
    expect(ref.current).toBeNull();
  });

  it("does not call back on slow gesture", () => {
    const onSwipe = jest.fn();
    const touchData: TouchEndData = [
      { p: { x: 5, y: 7 }, t: 57 },
      { p: { x: 400, y: 7 }, t: 6666658 },
    ];
    const ref = { current: touchData };

    handleTouchEnd(ref, onSwipe);

    expect(onSwipe).not.toHaveBeenCalled();
    expect(ref.current).toBeNull();
  });

  it("does not call back on angular gesture", () => {
    const onSwipe = jest.fn();
    const touchData: TouchEndData = [
      { p: { x: 5, y: 7 }, t: 57 },
      { p: { x: 400, y: 407 }, t: 58 },
    ];
    const ref = { current: touchData };

    handleTouchEnd(ref, onSwipe);

    expect(onSwipe).not.toHaveBeenCalled();
    expect(ref.current).toBeNull();
  });

  it("does not call back on vertical swipe", () => {
    const onSwipe = jest.fn();
    const touchData: TouchEndData = [
      { p: { x: 400, y: 500 }, t: 57 },
      { p: { x: 400, y: 7 }, t: 58 },
    ];
    const ref = { current: touchData };

    handleTouchEnd(ref, onSwipe);

    expect(onSwipe).not.toHaveBeenCalled();
    expect(ref.current).toBeNull();
  });
});
