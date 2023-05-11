/**
 * @jest-environment jsdom
 */

import { describe, expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import React from "react";
import { SinglePageApp } from "./single_page_app";
import { RouteContext } from "./router";

describe("Single Page App View", () => {
  const pages: SinglePageApp.Page[] = [
    {
      name: "Gallia",
      path: "/gallia",
      content: () => <div>GalliaPage</div>,
    },
    {
      name: "Omnis",
      path: "/omnis",
      content: () => <div>OmnisPage</div>,
    },
  ];

  it("shows correct initial content", () => {
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/gallia" }, navigateTo: mockNav }}
      >
        <SinglePageApp pages={pages} />
      </RouteContext.Provider>
    );

    expect(screen.queryByText("GalliaPage")).not.toBeNull();
    expect(screen.queryByText("OmnisPage")).toBeNull();
  });

  it("shows navigation on bad path", () => {
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/g" }, navigateTo: mockNav }}
      >
        <SinglePageApp pages={pages} />
      </RouteContext.Provider>
    );

    expect(screen.queryAllByText("Gallia")).not.toHaveLength(0);
    expect(screen.queryAllByText("Omnis")).not.toHaveLength(0);
  });

  test("updates context on navigation", async () => {
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/gallia" }, navigateTo: mockNav }}
      >
        <SinglePageApp pages={pages} />
      </RouteContext.Provider>
    );

    await user.click(screen.getAllByText("Omnis")[0]);

    expect(mockNav).toHaveBeenCalledWith({ path: "/omnis" });
  });
});
