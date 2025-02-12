/**
 * @jest-environment jsdom
 */

import "fake-indexeddb/auto";
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
import { RouteContext } from "@/web/client/router/router_v2";
import { FakeBroadcastChannel } from "@/web/client/offline/fake_broadcast_channel";

global.BroadcastChannel = FakeBroadcastChannel as any;

jest.mock("@/web/client/utils/media_query", () => {
  return {
    ...jest.requireActual("@/web/client/utils/media_query"),
    useMediaQuery: jest.fn(),
  };
});
import { useMediaQuery } from "@/web/client/utils/media_query";
import { GlobalSettingsContext } from "@/web/client/components/global_flags";
import { LatinDict } from "@/common/dictionaries/latin_dicts";

beforeAll(() => {
  // js-dom doesn't yet support `dialog`.
  HTMLDialogElement.prototype.show = jest.fn();
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
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

const ALL_DICT_KEYS = LatinDict.AVAILABLE.map((d) => d.key);
const FROM_LATIN_KEYS = LatinDict.AVAILABLE.filter(
  (d) => d.languages.from === "La" || d.languages.from === "*"
).map((d) => d.key);

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
      <RouteContext.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}>
        <DictionaryViewV2 />
      </RouteContext.Provider>
    );
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "G");
    await user.type(searchBar, "{enter}");

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/dicts",
        params: expect.objectContaining({ q: "G" }),
      })
    );
  });

  it("calls shows error on failure", async () => {
    mockCallApi.mockRejectedValue(new Error("Failure for test"));
    render(
      <RouteContext.Provider
        value={{
          route: { path: "/", params: { q: "Gallia" } },
          navigateTo: jest.fn(),
        }}>
        <DictionaryViewV2 />
      </RouteContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(ERROR_STATE_MESSAGE)).toBeDefined();
    });
  });

  it("respects lang filter in URL", async () => {
    mockCallApiMockResolvedValue({});
    render(
      <RouteContext.Provider
        value={{
          route: { path: "/", params: { q: "Belgae", lang: "En" } },
          navigateTo: jest.fn(),
        }}>
        <DictionaryViewV2 />
      </RouteContext.Provider>
    );

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi.mock.calls[0][1]).toStrictEqual({
      dicts: ["S&H", "R&A"],
      query: "Belgae",
      mode: 0,
      commitHash: undefined,
    });

    // We don't really care about this but we just want to wait for the
    // API promise to resolve so that React doesn't complain about updates
    // running outside of `act`.
    await waitFor(() => {
      expect(screen.getByText(/No results/)).toBeDefined();
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
      <RouteContext.Provider
        value={{
          route: { path: "/", params: { q: "Belgae" } },
          navigateTo: jest.fn(),
        }}>
        <DictionaryViewV2 />
      </RouteContext.Provider>
    );

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi.mock.calls[0][1]).toStrictEqual({
      dicts: ALL_DICT_KEYS,
      query: "Belgae",
      mode: 0,
      commitHash: undefined,
    });
    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === resultString)
      ).toBeDefined();
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
      <RouteContext.Provider
        value={{
          route: { path: "/", params: { q: "Belgae" } },
          navigateTo: jest.fn(),
        }}>
        <DictionaryViewV2 />
      </RouteContext.Provider>
    );

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(
        screen.getByText(
          (_, element) =>
            element?.textContent === NO_RESULTS_MESSAGE + " for Belgae."
        )
      ).toBeDefined();
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
      <RouteContext.Provider
        value={{
          route: { path: "/", params: { q: "Belgae" } },
          navigateTo: jest.fn(),
        }}>
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
      <RouteContext.Provider
        value={{
          route: { path: "/", params: { q: "Belgae" } },
          navigateTo: jest.fn(),
        }}>
        <DictionaryViewV2 />
      </RouteContext.Provider>
    );

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi.mock.calls[0][1]).toStrictEqual({
      dicts: ALL_DICT_KEYS,
      query: "Belgae",
      mode: 0,
      commitHash: undefined,
    });
    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === resultString)
      ).toBeDefined();
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
    render(
      <GlobalSettingsContext.Provider
        value={{
          data: { embeddedInflectedSearch: true },
          setData: () => {},
          mergeData: () => {},
        }}>
        <DictionaryViewV2 embedded initial="Belgae" />
      </GlobalSettingsContext.Provider>
    );

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi.mock.calls[0][1]).toStrictEqual({
      dicts: FROM_LATIN_KEYS,
      query: "Belgae",
      mode: 1,
      commitHash: undefined,
    });
    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === resultString)
      ).toBeDefined();
      expect(screen.getByText("mainBlurb")).toBeDefined();
      expect(screen.getByText("sense1")).toBeDefined();
      expect(screen.getByText("sense2")).toBeDefined();
    });
  });
});
