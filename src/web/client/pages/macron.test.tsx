/**
 * @jest-environment jsdom
 */

import { describe, expect, test } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";
import user from "@testing-library/user-event";
import React from "react";

import { ERROR_MESSAGE, Macronizer } from "./macron";

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

describe("Macronizer View", () => {
  test("shows expected components", () => {
    render(<Macronizer />);

    expect(screen.getByRole("textbox")).toBeDefined();
    expect(screen.getByRole("button")).toBeDefined();
  });

  test("does not call server on empty submit", async () => {
    const mockFetch = replaceFetch(false);
    render(<Macronizer />);
    const submit = screen.getByRole("button");

    await user.click(submit);

    expect(mockFetch.mock.calls).toHaveLength(0);
  });

  test("calls server on submit", async () => {
    const mockFetch = replaceFetch(false);
    render(<Macronizer />);
    const inputBox = screen.getByRole("textbox");
    const submit = screen.getByRole("button");

    await user.type(inputBox, "Gallia est omnis");
    await user.click(submit);

    expect(mockFetch.mock.calls).toHaveLength(1);
    expect(mockFetch.mock.calls[0][0]).toContain("api/macronize/");
  });

  test("calls shows error on failure", async () => {
    replaceFetch(false);
    render(<Macronizer />);
    const inputBox = screen.getByRole("textbox");
    const submit = screen.getByRole("button");

    await user.type(inputBox, "Gallia est omnis");
    await user.click(submit);

    await waitFor(() => {
      expect(screen.getByText(ERROR_MESSAGE)).toBeDefined();
    });
  });

  test("shows result on success", async () => {
    replaceFetch(true, "in partēs trēs");
    render(<Macronizer />);
    const inputBox = screen.getByRole("textbox");
    const submit = screen.getByRole("button");

    await user.type(inputBox, "in partes tres");
    await user.click(submit);

    await waitFor(() => {
      expect(screen.getByText("in partēs trēs")).toBeDefined();
    });
  });
});
