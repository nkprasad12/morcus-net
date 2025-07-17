/**
 * @jest-environment jsdom
 */

import { checkPresent } from "@/common/assert";
import {
  TouchEndData,
  handleTouchEnd,
  handleTouchMove,
  MIN_SWIPE_SIZE,
  SwipeDirection,
  SwipeGestureListener,
  SwipeListeners,
  useSwipeListener,
} from "@/web/client/mobile/gestures";
import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
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

  it("updates with current and previous touch on move", () => {
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

    expect(onSwipeEnd).toHaveBeenCalledWith("Left", 0.5, {
      x: expect.closeTo(0.5119),
      y: expect.closeTo(0.0012),
    });
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

    expect(onSwipeEnd).toHaveBeenCalledWith(
      "Left",
      expect.closeTo(0.94798),
      expect.anything()
    );
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

    expect(onSwipeEnd).toHaveBeenCalledWith("Right", 0.5, {
      x: expect.closeTo(0.011),
      y: expect.closeTo(0.001),
    });
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

describe("Gesture handling", () => {
  // Mock Date.now for simulating elapsed time between events
  const originalDateNow = Date.now;
  let mockTime = 1000;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      value: 1000,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      writable: true,
    });

    // Mock Date.now to control timing
    mockTime = 1000;
    Date.now = jest.fn(() => mockTime);
  });

  afterEach(() => {
    // Restore original Date.now
    Date.now = originalDateNow;
  });

  describe("SwipeGestureListener", () => {
    const mockSwipeEnd = jest.fn();
    const mockSwipeProgress = jest.fn();
    const mockSwipeCancel = jest.fn();

    const TestComponent = () => {
      const listeners: SwipeListeners = {
        onSwipeEnd: mockSwipeEnd,
        onSwipeProgress: mockSwipeProgress,
        onSwipeCancel: mockSwipeCancel,
      };
      useSwipeListener(listeners);

      return <div>Swipe Test</div>;
    };

    beforeEach(() => {
      mockSwipeEnd.mockClear();
      mockSwipeProgress.mockClear();
      mockSwipeCancel.mockClear();
    });

    function simulateTouches(clientXes: number[]) {
      if (clientXes.length < 2) {
        throw new Error("At least two clientX values are required");
      }

      act(() => {
        const gestureElement = checkPresent(
          screen.getByText("Swipe Test").parentElement
        );
        // The touch data for touch start is ignored.
        fireEvent.touchStart(gestureElement, {
          touches: [{ clientX: 1000, clientY: 400 }],
        });
        for (let i = 0; i < clientXes.length; i++) {
          mockTime += 20; // Simulate time passing
          fireEvent.touchMove(gestureElement, {
            touches: [{ clientX: clientXes[i], clientY: 400 }],
          });
        }
        fireEvent.touchEnd(gestureElement);
      });
    }

    test("calls back on successful swipes", () => {
      render(
        <SwipeGestureListener>
          <TestComponent />
        </SwipeGestureListener>
      );

      simulateTouches([700, 600]);

      expect(mockSwipeProgress).toHaveBeenCalled();
      const direction = mockSwipeProgress.mock.calls[0][0] as SwipeDirection;
      expect(direction).toBe("Left");

      expect(mockSwipeEnd).toHaveBeenCalled();
      const args = mockSwipeEnd.mock.calls[0];
      expect(args[0]).toBe("Left");
      expect(args[1]).toBeGreaterThan(MIN_SWIPE_SIZE);
      // The first touch is used in the
      expect(args[2]).toEqual({ x: 0.7, y: 0.5 });
      expect(mockSwipeCancel).not.toHaveBeenCalled();
    });

    test("calls back on cancelled swipe", () => {
      render(
        <SwipeGestureListener>
          <TestComponent />
        </SwipeGestureListener>
      );

      simulateTouches([800, 750, 800]);

      expect(mockSwipeProgress).toHaveBeenCalled();
      expect(mockSwipeEnd).not.toHaveBeenCalled();
      expect(mockSwipeCancel).toHaveBeenCalled();
    });
  });
});
