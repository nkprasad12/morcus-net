/**
 * @jest-environment jsdom
 */

import { textCallback, type Callback } from "@/web/client/utils/callback_utils";
import { render, screen, fireEvent } from "@testing-library/react";

describe("textCallback", () => {
  it("should call handler with the text content of the span element", () => {
    const handler: Callback<string, boolean> = jest.fn().mockReturnValue(true);
    const callback = textCallback(handler);
    render(
      <span onClick={callback}>
        <span>Test</span>
      </span>
    );

    fireEvent.click(screen.getByText("Test"));

    expect(handler).toHaveBeenCalledWith("Test");
  });

  it("should call handler with the text content of the correct span element", () => {
    const handler: Callback<string, boolean> = jest.fn().mockReturnValue(true);
    const callback = textCallback(handler);
    render(
      <span onClick={callback}>
        <span>Test</span>
        otherText
        <span>3rd</span>
      </span>
    );

    fireEvent.click(screen.getByText("3rd"));

    expect(handler).toHaveBeenCalledWith("3rd");
  });

  it("should not call handler if the target is not a span element", () => {
    const handler: Callback<string, boolean> = jest.fn();
    const callback = textCallback(handler);
    render(
      <div onClick={callback}>
        <div>Test</div>
      </div>
    );

    fireEvent.click(screen.getByText("Test"));

    expect(handler).not.toHaveBeenCalled();
  });

  it("should not call handler if the span element does not have the specified class", () => {
    const handler: Callback<string, boolean> = jest.fn();
    const callback = textCallback(handler, "test-class");
    render(
      <span onClick={callback}>
        <span>Test</span>
      </span>
    );

    fireEvent.click(screen.getByText("Test"));

    expect(handler).not.toHaveBeenCalled();
  });

  it("should call handler if the span element has the specified class", () => {
    const handler: Callback<string, boolean> = jest.fn().mockReturnValue(true);
    const callback = textCallback(handler, "test-class");
    render(
      <span onClick={callback}>
        <span className="test-class other">Test</span>
      </span>
    );

    fireEvent.click(screen.getByText("Test"));

    expect(handler).toHaveBeenCalledWith("Test");
  });

  it("should stop propagation if handler returns true", () => {
    const handler: Callback<string, boolean> = jest.fn().mockReturnValue(true);
    const callback = textCallback(handler);
    const outerOnClick = jest.fn();

    render(
      <span onClick={outerOnClick}>
        <span onClick={callback}>
          <span>Test</span>
        </span>
      </span>
    );
    fireEvent.click(screen.getByText("Test"));

    expect(outerOnClick).not.toHaveBeenCalled();
  });

  it("should not stop propagation if handler returns false", () => {
    const handler: Callback<string, boolean> = jest.fn().mockReturnValue(false);
    const callback = textCallback(handler);
    const outerOnClick = jest.fn();

    render(
      <span onClick={outerOnClick}>
        <span onClick={callback}>
          <span>Test</span>
        </span>
      </span>
    );
    fireEvent.click(screen.getByText("Test"));

    expect(outerOnClick).toHaveBeenCalled();
  });
});
