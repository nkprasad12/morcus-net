/**
 * @jest-environment jsdom
 */

import { describe, expect, test } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";
import user from "@testing-library/user-event";
import React from "react";
import { ResponsiveAppBar } from "./app_bar";

describe("App Bar View", () => {
  const pages: ResponsiveAppBar.Page[] = [
    {
      name: "Gallia",
      path: "/gallia",
    },
    {
      name: "Omnis",
      path: "/omnis",
    },
  ];

  test("shows menu buttons", () => {
    render(<ResponsiveAppBar pages={pages} setPage={() => {}} />);

    expect(screen.getAllByText(pages[0].name)[0]).toBeDefined();
    expect(screen.getAllByText(pages[1].name)[0]).toBeDefined();
  });

  test("handles clicks", async () => {
    const mockSetPage = jest.fn(() => {});
    render(<ResponsiveAppBar pages={pages} setPage={mockSetPage} />);

    await user.click(screen.getAllByText(pages[0].name)[0]);

    expect(mockSetPage).toBeCalledTimes(1);
    expect(mockSetPage).toBeCalledWith(pages[0].path);
  });
});
