/**
 * @jest-environment jsdom
 */

import React from "react";
import { Library } from "@/web/client/pages/library/library";
import { render, screen } from "@testing-library/react";
import { callApi } from "@/web/utils/rpc/client_rpc";

jest.mock("@/web/utils/rpc/client_rpc");

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApi;

describe("library view", () => {
  it("shows items", async () => {
    mockCallApi.mockResolvedValue([
      { author: "Caesar", name: "DBG", id: "DBG" },
    ]);

    render(<Library />);

    await screen.findByText("Welcome to the library.");
    await screen.findByText(/DBG/);
    await screen.findByText(/Caesar/);
  });
});
