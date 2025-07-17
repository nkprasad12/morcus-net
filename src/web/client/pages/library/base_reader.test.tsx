/**
 * @jest-environment jsdom
 */

import { handleSideTap } from "@/web/client/pages/library/base_reader";

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
    expect(listener).toHaveBeenCalledWith("Right", 1, expect.anything());
  });

  it("invokes the listener on a right tap", () => {
    const listener = jest.fn();
    handleSideTap({ clientX: 400 }, listener);
    expect(listener).toHaveBeenCalledWith("Left", 1, expect.anything());
  });
});
