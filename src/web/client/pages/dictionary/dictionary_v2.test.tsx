/**
 * @jest-environment jsdom
 */

import { XmlNode } from "@/common/xml/xml_node";
import { callApi, callApiFull } from "@/web/utils/rpc/client_rpc";
import { render, screen, waitFor } from "@testing-library/react";
import user from "@testing-library/user-event";

import { assertEqual } from "@/common/assert";
import {
  DictionaryViewV2,
  ERROR_STATE_MESSAGE,
  NO_RESULTS_MESSAGE,
} from "@/web/client/pages/dictionary/dictionary_v2";
import useMediaQuery from "@mui/material/useMediaQuery";
import { RouteContextV2 } from "@/web/client/router/router_v2";

jest.mock("@mui/material/useMediaQuery", () => {
  return {
    __esModule: true,
    default: jest.fn(() => false),
  };
});

window.HTMLElement.prototype.scrollIntoView = jest.fn();
console.debug = jest.fn();

jest.mock("@/web/utils/rpc/client_rpc");

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApiFull;
// @ts-ignore
const mockCallApiLegacy: jest.Mock<any, any, any> = callApi;

function mockCallApiMockResolvedValue(input: any) {
  mockCallApi.mockResolvedValue({ data: input });
  mockCallApiLegacy.mockResolvedValue(input);
}

describe("New Dictionary View", () => {
  afterEach(() => {
    mockCallApi.mockReset();
  });

  it("shows expected components", () => {
    render(<DictionaryViewV2 />);
    expect(screen.getByRole("combobox")).toBeDefined();
  });

  it("handles navigation on submit", async () => {
    mockCallApiMockResolvedValue([]);
    const mockNav = jest.fn(() => {});
    render(
      <RouteContextV2.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}>
        <DictionaryViewV2 />
      </RouteContextV2.Provider>
    );
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "G");
    await user.type(searchBar, "{enter}");

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/",
        params: expect.objectContaining({ q: "G" }),
      })
    );
  });

  it("calls shows error on failure", async () => {
    mockCallApi.mockRejectedValue(new Error("Failure for test"));
    render(
      <RouteContextV2.Provider
        value={{
          route: { path: "/", params: { q: "Gallia" } },
          navigateTo: jest.fn(),
        }}>
        <DictionaryViewV2 />
      </RouteContextV2.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(ERROR_STATE_MESSAGE)).toBeDefined();
    });
  });

  it("shows fetched result on large screen", async () => {
    const spyScrollTo = jest.fn();
    HTMLElement.prototype.scrollIntoView = spyScrollTo;
    const resultString = "France or whatever idk lol";
    mockCallApiMockResolvedValue({
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
      <RouteContextV2.Provider
        value={{
          route: { path: "/", params: { q: "Belgae" } },
          navigateTo: jest.fn(),
        }}>
        <DictionaryViewV2 />
      </RouteContextV2.Provider>
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
    const outlineMainKey = screen
      .getAllByText("mainKey")
      .filter((e) => e.className === "outlineHead");
    assertEqual(outlineMainKey.length, 1);
    await user.click(outlineMainKey[0]);
    expect(spyScrollTo).toHaveBeenCalledTimes(0);
  });

  it("shows no results case", async () => {
    const spyScrollTo = jest.fn();
    HTMLElement.prototype.scrollIntoView = spyScrollTo;
    mockCallApiMockResolvedValue({ LS: [] });
    render(
      <RouteContextV2.Provider
        value={{
          route: { path: "/", params: { q: "Belgae" } },
          navigateTo: jest.fn(),
        }}>
        <DictionaryViewV2 />
      </RouteContextV2.Provider>
    );

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText(NO_RESULTS_MESSAGE)).toBeDefined();
    });
  });

  it("shows multi results case", async () => {
    const spyScrollTo = jest.fn();
    HTMLElement.prototype.scrollIntoView = spyScrollTo;
    mockCallApiMockResolvedValue({
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
      <RouteContextV2.Provider
        value={{
          route: { path: "/", params: { q: "Belgae" } },
          navigateTo: jest.fn(),
        }}>
        <DictionaryViewV2 />
      </RouteContextV2.Provider>
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
    HTMLElement.prototype.scrollIntoView = spyScrollTo;
    const resultString = "France or whatever idk lol";
    mockCallApiMockResolvedValue({
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
      <RouteContextV2.Provider
        value={{
          route: { path: "/", params: { q: "Belgae" } },
          navigateTo: jest.fn(),
        }}>
        <DictionaryViewV2 />
      </RouteContextV2.Provider>
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
    const outlineMainKey = screen
      .getAllByText("mainKey")
      .filter((e) => e.className === "outlineHead");
    assertEqual(outlineMainKey.length, 1);
    await user.click(outlineMainKey[0]);
    expect(spyScrollTo).toHaveBeenCalledTimes(0);
  });

  it("shows fetched result on embedded view", async () => {
    // @ts-ignore
    window.IntersectionObserver = jest.fn(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    }));
    // @ts-ignore
    useMediaQuery.mockImplementation(() => true);
    const spyScrollTo = jest.fn();
    HTMLElement.prototype.scrollIntoView = spyScrollTo;
    const resultString = "France or whatever idk lol";
    mockCallApiMockResolvedValue({
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
    render(<DictionaryViewV2 embedded initial="Belgae" />);

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi.mock.calls[0][1]).toStrictEqual({
      dicts: ["L&S"],
      query: "Belgae",
      mode: 1,
    });
    await waitFor(() => {
      expect(screen.getByText(resultString)).toBeDefined();
      expect(screen.getByText("mainBlurb")).toBeDefined();
      expect(screen.getByText("sense1")).toBeDefined();
      expect(screen.getByText("sense2")).toBeDefined();
    });
  });
});
