/**
 * @jest-environment jsdom
 */

import { useWakeLock } from "@/web/client/mobile/wake_lock";
import { render } from "@testing-library/react";

const realNav = navigator;

let mockRelease = jest.fn();
let mockRequest = jest.fn(() => Promise.resolve({ release: mockRelease }));

function TestComponent() {
  const extendLock = useWakeLock();
  return <div onClick={extendLock}>Extend</div>;
}

describe.skip("useWakeLock", () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => {
    jest.useRealTimers();
    // eslint-disable-next-line no-global-assign
    navigator = realNav;
  });

  beforeEach(() => {
    mockRelease = jest.fn();
    mockRequest = jest.fn(() => Promise.resolve({ release: mockRelease }));
    // eslint-disable-next-line no-global-assign
    navigator = {
      ...realNav,
      // @ts-ignore
      wakeLock: {
        // @ts-ignore
        request: mockRequest,
      },
    };
  });

  it("Handles error gracefully if there is no wake lock", () => {
    render(<TestComponent />);
  });

  it("Requests wake lock if there is a wake lock.", () => {
    render(<TestComponent />);
    expect(mockRequest).toHaveBeenCalled();
  });
});
