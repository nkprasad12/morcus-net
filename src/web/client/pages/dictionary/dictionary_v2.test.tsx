/**
 * @jest-environment jsdom
 */

import { XmlNode } from "@/common/xml/xml_node";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { render, screen, waitFor } from "@testing-library/react";
import user from "@testing-library/user-event";
import React from "react";

import {
  DictionaryViewV2,
  ERROR_STATE_MESSAGE,
  NO_RESULTS_MESSAGE,
} from "@/web/client/pages/dictionary/dictionary_v2";
import { RouteContext } from "@/web/client/components/router";

jest.mock("@mui/material/useMediaQuery", () => {
  return {
    __esModule: true,
    default: jest.fn(() => false),
  };
});
import { useMediaQuery } from "@mui/material";

window.HTMLElement.prototype.scrollIntoView = jest.fn();
console.debug = jest.fn();

jest.mock("@/web/utils/rpc/client_rpc");

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApi;

describe("New Dictionary View", () => {
  afterEach(() => {
    mockCallApi.mockReset();
  });

  it("shows expected components", () => {
    render(<DictionaryViewV2 />);
    expect(screen.getByRole("combobox")).toBeDefined();
  });

  it("handles navigation on submit", async () => {
    mockCallApi.mockResolvedValue([]);
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}
      >
        <DictionaryViewV2 />
      </RouteContext.Provider>
    );
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "G");
    await user.type(searchBar, "{enter}");

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/", query: "G" })
    );
  });

  it("calls shows error on failure", async () => {
    mockCallApi.mockRejectedValue(new Error("Failure for test"));
    render(
      <RouteContext.Provider
        value={{ route: { path: "/", query: "Gallia" }, navigateTo: jest.fn() }}
      >
        <DictionaryViewV2 />
      </RouteContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(ERROR_STATE_MESSAGE)).toBeDefined();
    });
  });

  it("shows fetched result on large screen", async () => {
    const spyScrollTo = jest.fn();
    Object.defineProperty(global.window, "scrollTo", { value: spyScrollTo });
    const resultString = "France or whatever idk lol";
    mockCallApi.mockResolvedValue({
      LS: [
        {
          entry: new XmlNode("span", [["id", "n3"]], [resultString]),
          outline: {
            mainKey: "mainKey",
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
      ],
    });
    render(
      <RouteContext.Provider
        value={{ route: { path: "/", query: "Belgae" }, navigateTo: jest.fn() }}
      >
        <DictionaryViewV2 />
      </RouteContext.Provider>
    );

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi.mock.calls[0][1]).toStrictEqual({
      dicts: ["L&S", "S&H"],
      query: "Belgae",
      mode: 0,
    });
    await waitFor(() => {
      expect(screen.getByText(resultString)).toBeDefined();
      expect(screen.getByText("mainBlurb")).toBeDefined();
      expect(screen.getByText("sense1")).toBeDefined();
      expect(screen.getByText("sense2")).toBeDefined();
    });
    expect(screen.queryByLabelText("jump to outline")).toBeNull();
    expect(screen.queryByLabelText("jump to entry")).toBeNull();

    // Expect this to scroll since the linked section exists
    spyScrollTo.mockClear();
    await user.click(screen.getByText("B"));
    expect(spyScrollTo).toHaveBeenCalledTimes(1);

    // Expect this to no-op since the linked section does not exist
    spyScrollTo.mockClear();
    await user.click(screen.getByText("mainKey"));
    expect(spyScrollTo).toHaveBeenCalledTimes(0);
  });

  it("shows no results case", async () => {
    const spyScrollTo = jest.fn();
    Object.defineProperty(global.window, "scrollTo", { value: spyScrollTo });
    mockCallApi.mockResolvedValue({ LS: [] });
    render(
      <RouteContext.Provider
        value={{ route: { path: "/", query: "Belgae" }, navigateTo: jest.fn() }}
      >
        <DictionaryViewV2 />
      </RouteContext.Provider>
    );

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText(NO_RESULTS_MESSAGE)).toBeDefined();
    });
  });

  it("shows multi results case", async () => {
    const spyScrollTo = jest.fn();
    Object.defineProperty(global.window, "scrollTo", { value: spyScrollTo });
    mockCallApi.mockResolvedValue({
      LS: [
        {
          entry: new XmlNode("span", [["id", "n4"]], ["Entry1"]),
          outline: {
            mainKey: "mainKey1",
            mainSection: {
              text: "mainBlurb1",
              sectionId: "n1",
            },
          },
        },
        {
          entry: new XmlNode("span", [["id", "n3"]], ["Entry2"]),
          outline: {
            mainKey: "mainKey2",
            mainSection: {
              text: "mainBlurb2",
              sectionId: "n2",
            },
          },
        },
      ],
    });
    render(
      <RouteContext.Provider
        value={{ route: { path: "/", query: "Belgae" }, navigateTo: jest.fn() }}
      >
        <DictionaryViewV2 />
      </RouteContext.Provider>
    );

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText("Entry1")).toBeDefined();
      expect(screen.getByText("Entry2")).toBeDefined();
    });
  });

  it("shows fetched result on small screen", async () => {
    // @ts-ignore
    window.IntersectionObserver = jest.fn(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    }));
    // @ts-ignore
    useMediaQuery.mockImplementation(() => true);
    const spyScrollTo = jest.fn();
    Object.defineProperty(global.window, "scrollTo", { value: spyScrollTo });
    const resultString = "France or whatever idk lol";
    mockCallApi.mockResolvedValue({
      LS: [
        {
          entry: new XmlNode("span", [["id", "n3"]], [resultString]),
          outline: {
            mainKey: "mainKey",
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
      ],
    });
    render(
      <RouteContext.Provider
        value={{ route: { path: "/", query: "Belgae" }, navigateTo: jest.fn() }}
      >
        <DictionaryViewV2 />
      </RouteContext.Provider>
    );

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi.mock.calls[0][1]).toStrictEqual({
      dicts: ["L&S", "S&H"],
      query: "Belgae",
      mode: 0,
    });
    await waitFor(() => {
      expect(screen.getByText(resultString)).toBeDefined();
      expect(screen.getByText("mainBlurb")).toBeDefined();
      expect(screen.getByText("sense1")).toBeDefined();
      expect(screen.getByText("sense2")).toBeDefined();
    });

    // We're disabling floating nav for now
    // expect(screen.queryByLabelText("jump to outline")).not.toBeNull();
    // expect(screen.queryByLabelText("jump to entry")).not.toBeNull();

    // Expect this to scroll since the linked section exists
    spyScrollTo.mockClear();
    await user.click(screen.getByText("B"));
    expect(spyScrollTo).toHaveBeenCalledTimes(1);

    // Expect this to no-op since the linked section does not exist
    spyScrollTo.mockClear();
    await user.click(screen.getByText("mainKey"));
    expect(spyScrollTo).toHaveBeenCalledTimes(0);
  });
});
