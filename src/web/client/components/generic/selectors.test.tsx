/**
 * @jest-environment jsdom
 */

import { NumberSelector } from "@/web/client/components/generic/selectors";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";

describe("Number Selector", () => {
  it("shows expected values", () => {
    const setValue = jest.fn();
    render(
      <NumberSelector
        min={20}
        max={40}
        step={5}
        value={25}
        setValue={setValue}
        label="Quantity"
        tag="Test"
      />
    );

    expect(screen.getByText("Quantity")).not.toBeNull();
    expect(screen.getByText("25")).not.toBeNull();
    expect(screen.getByLabelText("Decrease Test Quantity")).not.toBeNull();
    expect(screen.getByLabelText("Increase Test Quantity")).not.toBeNull();
  });

  it("handles increases and decreases", async () => {
    const setValue = jest.fn();
    render(
      <NumberSelector
        min={20}
        max={40}
        step={5}
        value={25}
        setValue={setValue}
        label="Quantity"
        tag="Test"
      />
    );
    const increment = screen.getByLabelText("Increase Test Quantity");
    const decrement = screen.getByLabelText("Decrease Test Quantity");

    await user.click(increment);
    expect(setValue).toHaveBeenCalledWith(30);
    await user.click(decrement);
    expect(setValue).toHaveBeenCalledWith(20);
  });

  it("handles min setting", async () => {
    const setValue = jest.fn();
    render(
      <NumberSelector
        min={20}
        max={40}
        step={5}
        value={20}
        setValue={setValue}
        label="Quantity"
        tag="Test"
      />
    );
    const decrement = screen.getByLabelText("Decrease Test Quantity");

    await user.click(decrement);
    expect(setValue).toHaveBeenCalledWith(20);
  });

  it("handles max setting", async () => {
    const setValue = jest.fn();
    render(
      <NumberSelector
        min={20}
        max={40}
        step={5}
        value={40}
        setValue={setValue}
        label="Quantity"
        tag="Test"
      />
    );
    const increment = screen.getByLabelText("Increase Test Quantity");

    await user.click(increment);
    expect(setValue).toHaveBeenCalledWith(40);
  });
});
