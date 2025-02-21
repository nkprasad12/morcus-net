/**
 * @jest-environment jsdom
 */

import "fake-indexeddb/auto";
import user from "@testing-library/user-event";
import { callApi, callApiFull } from "@/web/utils/rpc/client_rpc";
import { render, screen } from "@testing-library/react";
import { ReadingPage, SwipeFeedback } from "@/web/client/pages/library/reader";
import { ClientPaths } from "@/web/client/routing/client_paths";
import {
  ProcessedWork2,
  type DocumentInfo,
  type NavTreeNode,
} from "@/common/library/library_types";
import { XmlNode } from "@/common/xml/xml_node";
import {
  RouteContext,
  Router,
  type RouteInfo,
} from "@/web/client/router/router_v2";
import { checkPresent } from "@/common/assert";
import { FakeBroadcastChannel } from "@/web/client/offline/fake_broadcast_channel";

global.BroadcastChannel = FakeBroadcastChannel as any;
jest.mock("@/web/client/utils/media_query", () => {
  return {
    ...jest.requireActual("@/web/client/utils/media_query"),
    useMediaQuery: jest.fn(),
  };
});
import { useMediaQuery } from "@/web/client/utils/media_query";
import { silenceErroneousWarnings } from "@/web/client/test_utils";

jest.mock("@/web/utils/rpc/client_rpc");

silenceErroneousWarnings([["Failed for testing"]]);

console.debug = jest.fn();
window.HTMLElement.prototype.scrollIntoView = jest.fn();
window.HTMLElement.prototype.scroll = jest.fn();
window.HTMLElement.prototype.scrollTo = jest.fn();
window.scrollTo = jest.fn();

beforeAll(() => {
  // js-dom doesn't yet support `dialog`.
  HTMLDialogElement.prototype.show = jest.fn();
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
});

const WORK_PAGE = ClientPaths.WORK_PAGE;
const WORK_BY_NAME = ClientPaths.WORK_BY_NAME;
const DBG_INFO: DocumentInfo = {
  title: "DBG",
  author: "Caesar",
  workId: "dbg",
};

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApi;
// @ts-ignore
const mockCallApiFull: jest.Mock<any, any, any> = callApiFull;

const urlByIdFor = (workId: string) =>
  checkPresent(WORK_PAGE.toUrlPath({ workId }));
const urlByNameFor = (name: string, author: string) =>
  checkPresent(WORK_BY_NAME.toUrlPath({ name, author }));

const ONE_CHAPTER_NAV_TREE: NavTreeNode = {
  id: [],
  children: [{ id: ["1"], children: [] }],
};
const TWO_CHAPTER_NAV_TREE: NavTreeNode = {
  id: [],
  children: [
    { id: ["1"], children: [] },
    { id: ["2"], children: [] },
  ],
};
const PROCESSED_WORK: ProcessedWork2 = {
  info: DBG_INFO,
  textParts: ["chapter", "section"],
  rows: [
    [["1", "1"], new XmlNode("span", [], ["Gallia est omnis"])],
    [["1", "2"], new XmlNode("span", [], [" divisa in partes tres"])],
  ],
  pages: [{ id: ["1"], rows: [0, 2] }],
  navTree: ONE_CHAPTER_NAV_TREE,
};

const WORK_WITH_NOTES: ProcessedWork2 = {
  info: DBG_INFO,
  textParts: ["chapter", "section"],
  rows: [
    [
      ["1", "1"],
      new XmlNode(
        "span",
        [],
        ["Gallia est omnis", new XmlNode("note", [["noteId", "0"]])]
      ),
    ],
    [
      ["1", "2"],
      new XmlNode(
        "span",
        [],
        [" divisa in partes tres", new XmlNode("note", [["noteId", "1"]])]
      ),
    ],
  ],
  pages: [{ id: ["1"], rows: [0, 2] }],
  navTree: ONE_CHAPTER_NAV_TREE,
  notes: [new XmlNode("span", [], ["I am a note tooltip"])],
};

const WORK_WITH_FLAVOR_TEXT: ProcessedWork2 = {
  info: DBG_INFO,
  textParts: ["chapter", "section"],
  rows: [
    [["1", "1"], new XmlNode("span", [], ["Gallia est omnis"])],
    [["1"], new XmlNode("span", [], ["I am a header"])],
    [["1", "2"], new XmlNode("span", [], [" divisa in partes tres"])],
  ],
  pages: [{ id: ["1"], rows: [0, 3] }],
  navTree: ONE_CHAPTER_NAV_TREE,
};

const PROCESSED_WORK_MULTI_CHAPTER: ProcessedWork2 = {
  info: DBG_INFO,
  textParts: ["chapter", "section"],
  rows: [
    [["1", "1"], new XmlNode("span", [], ["Gallia est omnis"])],
    [["2", "1"], new XmlNode("span", [], [" divisa in partes tres"])],
  ],
  pages: [
    { id: ["1"], rows: [0, 1] },
    { id: ["2"], rows: [1, 2] },
  ],
  navTree: TWO_CHAPTER_NAV_TREE,
};

const PROCESSED_WORK_VARIANTS: ProcessedWork2 = {
  info: DBG_INFO,
  textParts: ["chapter", "section"],
  rows: [
    [
      ["1", "1"],
      new XmlNode("span", [], ["omnis ", new XmlNode("span", [], ["deleted"])]),
    ],
    [
      ["2", "1"],
      new XmlNode(
        "b",
        [],
        [" divisa in partes tres", new XmlNode("gap", [], [])]
      ),
    ],
  ],
  pages: [
    { id: ["1"], rows: [0, 1] },
    { id: ["2"], rows: [1, 2] },
  ],
  navTree: TWO_CHAPTER_NAV_TREE,
};

const findOnScreen = (text: string) => {
  // Passing function to `getByText`
  return screen.getByText((_, element) => {
    const hasText = (element: Element | null) => element?.textContent === text;
    const elementHasText = hasText(element);
    const childrenDontHaveText = Array.from(element?.children || []).every(
      (child) => !hasText(child)
    );
    return elementHasText && childrenDontHaveText;
  });
};

describe("Reading UI", () => {
  beforeAll(() => {
    mockCallApiFull.mockResolvedValue({ data: { LS: [] } });
  });
  afterEach(() => {
    mockCallApiFull.mockClear();
    // @ts-ignore
    useMediaQuery.mockImplementation(() => false);
  });

  it("fetches the expected resource by id", () => {
    mockCallApi.mockReturnValue(new Promise(() => {}));
    const testId = "caesar";

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByIdFor(testId) },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    expect(mockCallApi).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: testId })
    );
  });

  it("fetches the expected resource by name", () => {
    mockCallApi.mockReturnValue(new Promise(() => {}));
    const testAuthor = "caesar";
    const testName = "dbg";

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByNameFor(testName, testAuthor) },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    expect(mockCallApi).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        nameAndAuthor: { urlName: testName, urlAuthor: testAuthor },
      })
    );
  });

  it("shows error on invalid path", async () => {
    mockCallApi.mockReturnValue(new Promise(() => {}));

    render(
      <RouteContext.Provider
        value={{
          route: { path: "/dicts" },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    await screen.findByText(/error/);
  });

  it("shows an initial loading message", async () => {
    mockCallApi.mockReturnValue(new Promise(() => {}));
    const testId = "caesar";

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByIdFor(testId) },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    await screen.findByText(/Loading/);
  });

  it("shows an error message if needed", async () => {
    mockCallApi.mockRejectedValue("Failed for testing");
    const testId = "caesar";

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByIdFor(testId) },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    await screen.findByText(/error/);
  });

  it("shows flavor text in expected location", async () => {
    mockCallApi.mockResolvedValue(WORK_WITH_FLAVOR_TEXT);

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByIdFor("dbg"), params: { id: "1" } },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    await screen.findByText(/DBG/);
    expect(findOnScreen("I am a header")).not.toBeNull();
  });

  it("displays a work with notes", async () => {
    mockCallApi.mockResolvedValue(WORK_WITH_NOTES);

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByIdFor("dbg"), params: { id: "1" } },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    await screen.findByText(/DBG/);
    expect(screen.queryByText("I am a note tooltip")).toBeNull();
    const notes = await screen.findAllByLabelText("toggle note");
    // The second stub is not rendered because we only passed 1 note in the `work`.
    expect(notes).toHaveLength(1);
    await user.click(notes[0]);
    expect(screen.queryByText("I am a note tooltip")).not.toBeNull();
    await user.click(notes[0]);
    expect(screen.queryByText("I am a note tooltip")).toBeNull();
  });

  it("shows work contents on success on large screen", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK);

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByIdFor("dbg"), params: { id: "1" } },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    await screen.findByText(/DBG/);
    expect(findOnScreen("Gallia est omnis")).not.toBeNull();
  });

  it("shows work contents on success on mobile", async () => {
    // @ts-ignore
    useMediaQuery.mockImplementation(() => true);
    mockCallApi.mockResolvedValue(PROCESSED_WORK);

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByIdFor("dbg"), params: { id: "1" } },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    await screen.findByText(/DBG/);
    expect(findOnScreen("Gallia est omnis")).not.toBeNull();
  });

  it("shows marked up contents", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_VARIANTS);

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByIdFor("dbg"), params: { id: "2" } },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    await screen.findByText(/\[gap\]/);
    await user.click(await screen.findByText(/divisa/));
    expect(mockCallApiFull).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: "/api/dicts/fused" }),
      expect.objectContaining({ query: "divisa" })
    );
  });

  it("shows correct contents for page", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);

    render(
      <RouteContext.Provider
        value={{
          route: {
            path: urlByIdFor("dbg"),
            params: { id: "2" },
          },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/DBG/);

    expect(screen.queryByText(/Gallia/)).toBeNull();
    expect(screen.queryByText(/divisa/)).not.toBeNull();
  });

  it("uses correct nav updates on next page button", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);
    const mockNav = jest.fn();
    const path = urlByIdFor("dbg");
    render(
      <Router.TestRoot
        initial={{ path, params: { id: "1" } }}
        updateListener={mockNav}>
        <ReadingPage />
      </Router.TestRoot>
    );
    await screen.findByText(/DBG/);

    await user.click(screen.queryByLabelText("next section")!);

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path, params: { id: "2" } })
    );
  });

  it("uses correct nav updates on next page key", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);
    const mockNav = jest.fn();
    const path = urlByIdFor("dbg");
    render(
      <Router.TestRoot
        initial={{ path, params: { id: "1" } }}
        updateListener={mockNav}>
        <ReadingPage />
      </Router.TestRoot>
    );
    await screen.findByText(/DBG/);

    await user.keyboard("[ArrowRight]");

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path, params: { id: "2" } })
    );
  });

  it("uses correct nav updates on previous page button", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);
    const mockNav = jest.fn();
    const path = urlByIdFor("dbg");
    render(
      <Router.TestRoot
        initial={{ path, params: { id: "2" } }}
        updateListener={mockNav}>
        <ReadingPage />
      </Router.TestRoot>
    );
    await screen.findByText(/DBG/);

    await user.keyboard("[ArrowLeft]");

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path, params: { id: "1" } })
    );
  });

  it("uses correct nav updates on previous page key", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);
    const mockNav = jest.fn();
    const path = urlByIdFor("dbg");
    render(
      <Router.TestRoot
        initial={{ path, params: { id: "2" } }}
        updateListener={mockNav}>
        <ReadingPage />
      </Router.TestRoot>
    );
    await screen.findByText(/DBG/);

    await user.click(screen.queryByLabelText("previous section")!);

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path, params: { id: "1" } })
    );
  });

  it("shows settings page", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK);
    const mockNav = jest.fn();
    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByIdFor("dbg"), params: { id: "1" } },
          navigateTo: mockNav,
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    await user.click(screen.queryByLabelText("Reader settings")!);
    await screen.findByText(/Main.+settings/);
    expect(await screen.findAllByText(/Text size/)).toHaveLength(2);
  });

  it("shows page specified from URL", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK);

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByIdFor("dbg"), params: { id: "1" } },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/Gallia/);
  });

  it("shows empty dict tab", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK);

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByIdFor("dbg"), params: { id: "1" } },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/Gallia/);

    await user.click(screen.queryByLabelText("Dictionary")!);

    await screen.findByText(/Click on a word/);
  });

  it("shows navigation tab", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByIdFor("dbg"), params: { id: "1" } },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/Gallia/);

    await user.click(screen.queryByLabelText("Outline")!);

    // One from the main column and one from navigation.
    expect(await screen.findAllByText(/Chapter 1/)).toHaveLength(2);
    await screen.findByText(/Chapter 2/);
  });

  it("shows attribution tab", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByIdFor("dbg"), params: { id: "1" } },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/Gallia/);

    await user.click(screen.queryByLabelText("Attribution")!);

    await screen.findByText(/Author/);
    await screen.findByText(/CC-BY-SA-4.0/);
  });

  it("shows settings tab on desktop", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByIdFor("dbg"), params: { id: "1" } },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/Gallia/);

    await user.click(screen.queryByLabelText("Reader settings")!);

    await screen.findByText(/Main column/);
    await screen.findByText(/Side column/);
  });

  it("shows settings tab on mobile", async () => {
    // @ts-ignore
    useMediaQuery.mockImplementation(() => true);
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlByIdFor("dbg"), params: { id: "1" } },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/Gallia/);

    await user.click(screen.queryByLabelText("Reader settings")!);

    await screen.findByText(/Main panel/);
    await screen.findByText(/Drawer/);
  });

  it("redirects to initial page on no id", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);
    const mockNav = jest.fn();
    const originalRoute: RouteInfo = {
      path: urlByIdFor("dbg"),
      params: {},
    };

    render(
      <RouteContext.Provider
        value={{
          route: originalRoute,
          navigateTo: mockNav,
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    await screen.findByText(/Loading/);
    expect(mockNav).toHaveBeenCalled();
    const newRoute = mockNav.mock.calls[0][0](originalRoute);
    expect(newRoute).toStrictEqual({
      path: urlByIdFor("dbg"),
      params: { id: "1" },
      replace: true,
    });
  });

  it("resolves subsection ids of pages", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);
    const mockNav = jest.fn();
    const originalRoute: RouteInfo = {
      path: urlByIdFor("dbg"),
      params: { id: "1.1" },
    };

    render(
      <RouteContext.Provider
        value={{
          route: originalRoute,
          navigateTo: mockNav,
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/omnis/);
  });

  it("shows nav on invalid page", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);
    const mockNav = jest.fn();
    const originalRoute: RouteInfo = {
      path: urlByIdFor("dbg"),
      params: { id: "4.3" },
    };

    render(
      <RouteContext.Provider
        value={{
          route: originalRoute,
          navigateTo: mockNav,
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/Invalid section/);
  });
});

describe("SwipeFeedback", () => {
  it("Shows expected on full swipe", async () => {
    render(<SwipeFeedback overlayOpacity={1} swipeDir="Left" />);
    await screen.findByLabelText("Release for next page");
  });

  it("Shows expected on partial swipe", async () => {
    render(<SwipeFeedback overlayOpacity={0.57} swipeDir="Right" />);
    await screen.findByLabelText("Swipe for previous page");
  });
});
