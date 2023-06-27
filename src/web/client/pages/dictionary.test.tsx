/**
 * @jest-environment jsdom
 */

import { XmlNode } from "@/common/lewis_and_short/xml_node";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { render, screen, waitFor } from "@testing-library/react";
import user from "@testing-library/user-event";
import React from "react";

import { Dictionary } from "./dictionary";
import { RouteContext } from "../components/router";

console.debug = jest.fn();

jest.mock("@/web/utils/rpc/client_rpc");

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApi;

describe("Dictionary View", () => {
  afterEach(() => {
    mockCallApi.mockReset();
  });

  it("shows expected components", () => {
    render(<Dictionary />);
    expect(screen.getByRole("combobox")).toBeDefined();
  });

  it("does not call server on empty submit", async () => {
    render(<Dictionary />);
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "{enter}");

    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it("calls server for autocomplete entries", async () => {
    mockCallApi.mockResolvedValue(["Goo"]);
    render(<Dictionary />);
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "G");

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi.mock.calls[0][1]).toBe("g");
  });

  it("handles autocomplete option clicks", async () => {
    mockCallApi.mockResolvedValue(["Goo"]);
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}
      >
        <Dictionary />
      </RouteContext.Provider>
    );
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "G");
    const option = screen.getByText("Goo");
    await user.click(option);

    expect(mockNav).toHaveBeenCalledWith({ path: "/", query: "Goo" });
  });

  it("handles navigation on submit", async () => {
    mockCallApi.mockResolvedValue([]);
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}
      >
        <Dictionary />
      </RouteContext.Provider>
    );
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "G");
    await user.type(searchBar, "{enter}");

    expect(mockNav).toHaveBeenCalledWith({ path: "/", query: "G" });
  });

  test("updates history state on submit", async () => {
    mockCallApi.mockResolvedValue(["Goo"]);
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}
      >
        <Dictionary />
      </RouteContext.Provider>
    );
    const searchBar = screen.getByRole("combobox");
    history.pushState("", "", "");

    await user.click(searchBar);
    await user.type(searchBar, "Gallia{enter}");

    expect(mockNav).toHaveBeenCalledWith({ path: "/", query: "Gallia" });
  });

  it("calls shows error on failure", async () => {
    mockCallApi.mockRejectedValue(new Error("Failure for test"));
    render(
      <RouteContext.Provider
        value={{ route: { path: "/", query: "Gallia" }, navigateTo: jest.fn() }}
      >
        <Dictionary />
      </RouteContext.Provider>
    );

    await waitFor(() => {
      expect(
        screen.getByText("Failed to fetch the entry. Please try again later.")
      ).toBeDefined();
    });
  });

  it("shows fetched result on success", async () => {
    const spyScrollTo = jest.fn();
    Object.defineProperty(global.window, "scrollTo", { value: spyScrollTo });
    const resultString = "France or whatever idk lol";
    mockCallApi.mockResolvedValue([
      {
        entry: new XmlNode("span", [["id", "n3"]], [resultString]),
        outline: {
          mainOrth: "mainOrth",
          mainSection: {
            text: "mainBlurb",
            sectionId: "n1",
          },
          senses: [
            {
              text: "sense1",
              level: 1,
              ordinal: "A",
              sectionId: "n2",
            },
            {
              text: "sense2",
              level: 1,
              ordinal: "B",
              sectionId: "n3",
            },
          ],
        },
      },
    ]);
    render(
      <RouteContext.Provider
        value={{ route: { path: "/", query: "Belgae" }, navigateTo: jest.fn() }}
      >
        <Dictionary />
      </RouteContext.Provider>
    );

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi.mock.calls[0][1]).toBe("Belgae");
    await waitFor(() => {
      expect(screen.getByText(resultString)).toBeDefined();
      expect(screen.getByText("mainBlurb")).toBeDefined();
      expect(screen.getByText("sense1")).toBeDefined();
      expect(screen.getByText("sense2")).toBeDefined();
    });

    // Expect this to scroll since the linked section exists
    spyScrollTo.mockClear();
    await user.click(screen.getByText("B."));
    expect(spyScrollTo).toHaveBeenCalledTimes(1);

    // Expect this to no-op since the linked section does not exist
    spyScrollTo.mockClear();
    await user.click(screen.getByText("mainOrth"));
    expect(spyScrollTo).toHaveBeenCalledTimes(0);
  });
});
