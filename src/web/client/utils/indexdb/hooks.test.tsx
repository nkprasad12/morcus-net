/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import { useCloseable } from "@/web/client/utils/indexdb/hooks";
import React from "react";

function TestComponent(props: { provider: () => any }) {
  const [clicks, setClicks] = React.useState(0);
  useCloseable(props.provider);
  return <button onClick={() => setClicks(clicks + 1)}>Click me</button>;
}

function renderWithHook(provider: () => unknown) {
  const { unmount } = render(<TestComponent provider={provider} />);
  return unmount;
}

describe("useCloseable", () => {
  it("only calls provider once", async () => {
    const close = jest.fn();
    const provider = jest.fn(() => ({ close }));
    renderWithHook(provider);

    await user.click(screen.getByText(/Click me/));
    await user.click(screen.getByText(/Click me/));
    await user.click(screen.getByText(/Click me/));

    expect(provider).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it("closes sync closeables", async () => {
    const close = jest.fn();
    const provider = jest.fn(() => ({ close }));
    const unmount = renderWithHook(provider);

    unmount();
    await new Promise((r) => setTimeout(r, 10));

    expect(provider).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes async closeables", async () => {
    const close = jest.fn();
    const provider = jest.fn(() => Promise.resolve({ close }));
    const unmount = renderWithHook(provider);

    unmount();
    await new Promise((r) => setTimeout(r, 10));

    expect(provider).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
