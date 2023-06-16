/**
 * @jest-environment jsdom
 */

import { describe, expect, test } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";
import user from "@testing-library/user-event";
import React from "react";

import { Macronizer } from "./macron";
import { callApi } from "@/web/utils/rpc/client_rpc";

console.debug = jest.fn();

jest.mock("@/web/utils/rpc/client_rpc", () => {
  const originalModule = jest.requireActual("@/web/utils/rpc/client_rpc");
  return {
    __esModule: true,
    ...originalModule,
    callApi: jest.fn(),
  };
});

describe("Macronizer View", () => {
  afterEach(() => {
    // @ts-ignore
    callApi.mockReset();
  });

  test("shows expected components", () => {
    render(<Macronizer />);

    expect(screen.getByRole("textbox")).toBeDefined();
    expect(screen.getByRole("button")).toBeDefined();
  });

  test("does not call server on empty submit", async () => {
    render(<Macronizer />);
    const submit = screen.getByRole("button");

    await user.click(submit);

    // @ts-ignore
    expect(callApi.mock.calls).toHaveLength(0);
  });

  test("calls server on submit", async () => {
    render(<Macronizer />);
    const inputBox = screen.getByRole("textbox");
    const submit = screen.getByRole("button");

    await user.type(inputBox, "Gallia est omnis");
    await user.click(submit);

    expect(callApi).toHaveBeenCalledTimes(1);
  });

  test("calls shows error on failure", async () => {
    // @ts-ignore
    callApi.mockRejectedValue(new Error());
    render(<Macronizer />);
    const inputBox = screen.getByRole("textbox");
    const submit = screen.getByRole("button");

    await user.type(inputBox, "Gallia est omnis");
    await user.click(submit);

    await waitFor(() => {
      expect(screen.getByText("Error: please try again later.")).toBeDefined();
    });
  });

  test("shows result on success", async () => {
    // @ts-ignore
    callApi.mockReturnValue(Promise.resolve("in partēs trēs"));

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
