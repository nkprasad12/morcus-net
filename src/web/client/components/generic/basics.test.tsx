/**
 * @jest-environment jsdom
 */

import { SpanButton, SpanLink } from "@/web/client/components/generic/basics";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";

describe("SpanButton", () => {
  it("shows child contents", () => {
    render(<SpanButton onClick={() => {}}>Foo</SpanButton>);
    expect(screen.getByText("Foo")).toBeDefined();
  });

  it("responds to enter", async () => {
    const onClick = jest.fn();
    render(<SpanButton onClick={onClick}>Foo</SpanButton>);
    screen.getByText("Foo").focus();
    onClick.mockClear();

    await user.keyboard("[Enter]");

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("responds to space", async () => {
    const onClick = jest.fn();
    render(<SpanButton onClick={onClick}>Foo</SpanButton>);
    screen.getByText("Foo").focus();
    onClick.mockClear();

    await user.keyboard(" ");

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("responds to clicks", async () => {
    const onClick = jest.fn();
    render(<SpanButton onClick={onClick}>Foo</SpanButton>);

    await user.click(screen.getByText("Foo"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("SpanLink", () => {
  it("shows child contents", () => {
    render(
      <SpanLink id="bar" onClick={() => {}}>
        Foo
      </SpanLink>
    );
    expect(screen.getByText("Foo")).toBeDefined();
  });

  it("responds to enter", async () => {
    const onClick = jest.fn();
    render(
      <SpanLink id="id" onClick={onClick}>
        Foo
      </SpanLink>
    );
    screen.getByText("Foo").focus();
    onClick.mockClear();

    await user.keyboard("[Enter]");

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("responds to clicks", async () => {
    const onClick = jest.fn();
    render(
      <SpanLink id="id" onClick={onClick}>
        Foo
      </SpanLink>
    );

    await user.click(screen.getByText("Foo"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
