/**
 * @jest-environment jsdom
 */

import { describe, expect, it } from "@jest/globals";
import { act, render, screen, waitFor } from "@testing-library/react";
import user from "@testing-library/user-event";
import React from "react";

import { Dictionary } from "./dictionary";

const realFetch = global.fetch;

afterAll(() => {
  global.fetch = realFetch;
});

function replaceFetch(ok: boolean = true, text: string = "") {
  const mockFetch = jest.fn((request) =>
    Promise.resolve({
      text: () => Promise.resolve(text),
      ok: ok,
      request: request,
    })
  );
  // @ts-ignore
  global.fetch = mockFetch;
  return mockFetch;
}

describe("Dictionary View", () => {
  it("shows expected components", () => {
    render(<Dictionary input="" />);
    expect(screen.getByRole("combobox")).toBeDefined();
  });

  it("does not call server on empty submit", async () => {
    const mockFetch = replaceFetch(false);
    render(<Dictionary input="" />);
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "{enter}");

    expect(mockFetch.mock.calls).toHaveLength(0);
  });

  it("calls server on submit", async () => {
    const mockFetch = replaceFetch(false);
    render(<Dictionary input="" />);
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "Gallia{enter}");

    expect(mockFetch.mock.calls).toHaveLength(1);
    expect(mockFetch.mock.calls[0][0]).toContain("api/dicts/ls/Gallia");
  });

  test("updates history state on submit", async () => {
    replaceFetch(false);
    render(<Dictionary input="" />);
    const searchBar = screen.getByRole("combobox");
    history.pushState("", "", "");

    await user.click(searchBar);
    await user.type(searchBar, "Gallia{enter}");

    expect(history.state).toBe("#Gallia");
  });

  it("calls shows error on failure", async () => {
    replaceFetch(false);
    render(<Dictionary input="" />);
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "Gallia{enter}");

    await waitFor(() => {
      expect(
        screen.getByText("Failed to fetch the entry. Please try again later.")
      ).toBeDefined();
    });
  });

  it("shows result on success", async () => {
    replaceFetch(true, "France or whatever idk lol");
    render(<Dictionary input="" />);
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "Gallia{enter}");

    await waitFor(() => {
      expect(screen.getByText("France or whatever idk lol")).toBeDefined();
    });
  });

  it("fetches result from props input", async () => {
    replaceFetch(true, "France or whatever idk lol");

    render(<Dictionary input="Gallia" />);

    await waitFor(() => {
      expect(screen.getByText("France or whatever idk lol")).toBeDefined();
    });
  });

  it("handles hash update", async () => {
    const mockAddEventListener = jest.fn();
    window.addEventListener = mockAddEventListener;
    render(<Dictionary input="" />);

    replaceFetch(true, "France or whatever idk lol");
    act(() => {
      mockAddEventListener.mock.lastCall![1]();
    });

    const hashchangeCalls = mockAddEventListener.mock.calls.filter(
      (call) => call[0] === "hashchange"
    );
    expect(hashchangeCalls).toHaveLength(1);
    await waitFor(() => {
      expect(screen.getByText("France or whatever idk lol")).toBeDefined();
    });
  });
});
