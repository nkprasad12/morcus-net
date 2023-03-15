/**
 * @jest-environment jsdom
 */

import { describe, expect, test } from "@jest/globals";
import { act, render, screen, waitFor } from "@testing-library/react";
import user from "@testing-library/user-event";
import React from "react";
import { SinglePageApp } from "./single_page_app";

describe("Single Page App View", () => {
  const pages: SinglePageApp.Page[] = [
    {
      name: "Gallia",
      path: "/gallia",
    },
    {
      name: "Omnis",
      path: "/omnis",
    },
  ];
  const wirings: SinglePageApp.Wiring[] = [
    {
      paths: [/\/gallia/, /^\/$/],
      content: (_) => <div>GalliaPage</div>,
    },
    {
      paths: [/\/omnis/],
      content: (_) => <div>OmnisPage</div>,
    },
    {
      paths: [/\/(.*)/],
      content: (groups) => <div>ErrorPage{groups[0]}</div>,
    },
  ];

  test("shows correct initial content", () => {
    render(
      <SinglePageApp pages={pages} initialPage={"/gallia"} wirings={wirings} />
    );

    expect(screen.queryByText("GalliaPage")).not.toBeNull();
    expect(screen.queryByText("OmnisPage")).toBeNull();
  });

  test("checks all matches and pipes groups", () => {
    render(
      <SinglePageApp
        pages={pages}
        initialPage={"/notyetknown"}
        wirings={wirings}
      />
    );

    expect(screen.queryByText("GalliaPage")).toBeNull();
    expect(screen.queryByText("OmnisPage")).toBeNull();
    expect(screen.queryByText("ErrorPagenotyetknown")).not.toBeNull();
  });

  test("handles multiple paths per page", () => {
    render(<SinglePageApp pages={pages} initialPage={"/"} wirings={wirings} />);

    expect(screen.queryByText("GalliaPage")).not.toBeNull();
    expect(screen.queryByText("OmnisPage")).toBeNull();
    expect(screen.queryByText("ErrorPage")).toBeNull();
  });

  test("updates content on navigation", async () => {
    render(
      <SinglePageApp pages={pages} initialPage={"/gallia"} wirings={wirings} />
    );
    expect(screen.queryByText("OmnisPage")).toBeNull();

    await user.click(screen.getAllByText("Omnis")[0]);

    expect(screen.queryByText("GalliaPage")).toBeNull();
    expect(screen.queryByText("OmnisPage")).not.toBeNull();
  });

  test("updates history state on navigation", async () => {
    render(
      <SinglePageApp pages={pages} initialPage={"/gallia"} wirings={wirings} />
    );
    history.pushState("", "", "");

    await user.click(screen.getAllByText("Omnis")[0]);

    expect(history.state).toBe("/omnis");
  });

  test("adds listener for history state changes on first render", async () => {
    const mockAddEventListener = jest.fn();
    window.addEventListener = mockAddEventListener;

    render(
      <SinglePageApp pages={pages} initialPage={"/gallia"} wirings={wirings} />
    );

    const popstateCalls = mockAddEventListener.mock.calls.filter(
      (call) => call[0] === "popstate"
    );
    expect(popstateCalls).toHaveLength(1);
  });

  test("does not add state change listener on subsequent renders", async () => {
    const mockAddEventListener = jest.fn();
    window.addEventListener = mockAddEventListener;
    render(
      <SinglePageApp pages={pages} initialPage={"/gallia"} wirings={wirings} />
    );
    await user.click(screen.getAllByText("Gallia")[0]);

    const popstateCalls = mockAddEventListener.mock.calls.filter(
      (call) => call[0] === "popstate"
    );
    expect(popstateCalls).toHaveLength(1);
  });

  test("responds to history state changes", async () => {
    const mockAddEventListener = jest.fn();
    window.addEventListener = mockAddEventListener;
    render(
      <SinglePageApp pages={pages} initialPage={"/omnis"} wirings={wirings} />
    );
    expect(screen.queryByText("OmnisPage")).not.toBeNull();

    act(() => {
      mockAddEventListener.mock.lastCall![1]();
    });

    await waitFor(() => {
      expect(screen.queryByText("OmnisPage")).toBeNull();
      expect(screen.queryByText("GalliaPage")).not.toBeNull();
    });
  });
});
