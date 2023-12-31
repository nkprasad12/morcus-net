/**
 * @jest-environment jsdom
 */

import user from "@testing-library/user-event";
import { callApi, callApiFull } from "@/web/utils/rpc/client_rpc";
import { render, screen } from "@testing-library/react";
import { ReadingPage } from "@/web/client/pages/library/reader";
import { ClientPaths } from "@/web/client/routing/client_paths";
import { ProcessedWork } from "@/common/library/library_types";
import { XmlNode } from "@/common/xml/xml_node";
import { invalidateWorkCache } from "@/web/client/pages/library/work_cache";
import { RouteContext, Router } from "@/web/client/router/router_v2";
import { checkPresent } from "@/common/assert";
import { PagePath } from "@/web/client/router/paths";

jest.mock("@/web/utils/rpc/client_rpc");
window.HTMLElement.prototype.scrollIntoView = jest.fn();
window.HTMLElement.prototype.scroll = jest.fn();

const WORK_PAGE = ClientPaths.WORK_PAGE;
// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApi;
// @ts-ignore
const mockCallApiFull: jest.Mock<any, any, any> = callApiFull;

const urlFor = (id: string) =>
  checkPresent(PagePath.toUrlPath(WORK_PAGE, { workId: id }));
const PROCESSED_WORK: ProcessedWork = {
  info: { title: "DBG", author: "Caesar" },
  textParts: ["chapter", "section"],
  root: {
    id: [],
    children: [
      {
        id: ["1"],
        children: [
          {
            id: ["1", "1"],
            children: [new XmlNode("span", [], ["Gallia est omnis"])],
          },
          {
            id: ["1", "2"],
            children: [new XmlNode("span", [], [" divisa in partes tres"])],
          },
        ],
      },
    ],
  },
};

const PROCESSED_WORK_MULTI_CHAPTER: ProcessedWork = {
  info: { title: "DBG", author: "Caesar" },
  textParts: ["chapter", "section"],
  root: {
    id: [],
    children: [
      {
        id: ["1"],
        children: [
          {
            id: ["1", "1"],
            children: [new XmlNode("span", [], ["Gallia est omnis"])],
          },
        ],
      },
      {
        id: ["2"],
        children: [
          {
            id: ["2", "1"],
            children: [new XmlNode("span", [], [" divisa in partes tres"])],
          },
        ],
      },
    ],
  },
};

const PROCESSED_WORK_VARIANTS: ProcessedWork = {
  info: { title: "DBG", author: "Caesar" },
  textParts: ["chapter", "section"],
  root: {
    id: [],
    children: [
      {
        id: ["1"],
        children: [
          {
            id: ["1", "1"],
            children: [
              new XmlNode(
                "span",
                [],
                [new XmlNode("libLat", [["target", "omnis"]], ["Omnis"])]
              ),
            ],
          },
          {
            id: ["1", "2"],
            children: [
              new XmlNode("span", [], [new XmlNode("libLat", [], ["est"])]),
            ],
          },
          {
            id: ["1", "3"],
            children: [
              new XmlNode(
                "span",
                [],
                [new XmlNode("latLink", [["alt", "gap"]])]
              ),
            ],
          },
        ],
      },
    ],
  },
};

describe("Reading UI", () => {
  beforeAll(() => {
    invalidateWorkCache();
    mockCallApiFull.mockResolvedValue({ data: { LS: [] } });
  });
  afterEach(() => {
    invalidateWorkCache();
    mockCallApiFull.mockClear();
  });

  it("fetches the expected resource", () => {
    mockCallApi.mockReturnValue(new Promise(() => {}));
    const testId = "caesar";

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlFor(testId) },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    expect(mockCallApi).toHaveBeenCalledWith(expect.anything(), testId);
  });

  it("shows an initial loading message", async () => {
    mockCallApi.mockReturnValue(new Promise(() => {}));
    const testId = "caesar";

    render(
      <RouteContext.Provider
        value={{
          route: { path: `${WORK_PAGE}/${testId}` },
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
          route: { path: urlFor(testId) },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    await screen.findByText(/error/);
  });

  it("shows work contents on success", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK);

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlFor("dbg") },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    await screen.findByText(/DBG/);
    await screen.findByText(/Gallia est omnis/);
  });

  it("shows marked up contents", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_VARIANTS);

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlFor("dbg") },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    await screen.findByText(/\[gap\]/);
    await user.click(await screen.findByText(/Omnis/));
    // Note the lower case, since the target is omnis.
    expect(mockCallApiFull).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: "/api/dicts/fused" }),
      expect.objectContaining({ query: "omnis" })
    );
    await user.click(await screen.findByText(/est/));
    expect(mockCallApiFull).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: "/api/dicts/fused" }),
      expect.objectContaining({ query: "est" })
    );
  });

  it("shows correct contents for page", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);

    render(
      <RouteContext.Provider
        value={{
          route: {
            path: urlFor("dbg"),
            params: { q: "2" },
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
    const path = urlFor("dbg");
    render(
      <Router.TestRoot initial={{ path }} updateListener={mockNav}>
        <ReadingPage />
      </Router.TestRoot>
    );
    await screen.findByText(/DBG/);

    await user.click(screen.queryByLabelText("next section")!);

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path, params: { q: "2" } })
    );
  });

  it("uses correct nav updates on next page key", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);
    const mockNav = jest.fn();
    const path = urlFor("dbg");
    render(
      <Router.TestRoot initial={{ path }} updateListener={mockNav}>
        <ReadingPage />
      </Router.TestRoot>
    );
    await screen.findByText(/DBG/);

    await user.keyboard("[ArrowRight]");

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path, params: { q: "2" } })
    );
  });

  it("uses correct nav updates on previous page button", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);
    const mockNav = jest.fn();
    const path = urlFor("dbg");
    render(
      <Router.TestRoot
        initial={{ path, params: { q: "2" } }}
        updateListener={mockNav}>
        <ReadingPage />
      </Router.TestRoot>
    );
    await screen.findByText(/DBG/);

    await user.keyboard("[ArrowLeft]");

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path, params: { q: "1" } })
    );
  });

  it("uses correct nav updates on previous page key", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);
    const mockNav = jest.fn();
    const path = urlFor("dbg");
    render(
      <Router.TestRoot
        initial={{ path, params: { q: "2" } }}
        updateListener={mockNav}>
        <ReadingPage />
      </Router.TestRoot>
    );
    await screen.findByText(/DBG/);

    await user.click(screen.queryByLabelText("previous section")!);

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path, params: { q: "1" } })
    );
  });

  // TODO: Figure out why this test doesn't work.
  it.skip("shows settings page", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK);
    const mockNav = jest.fn();
    render(
      <RouteContext.Provider
        value={{
          route: {
            path: urlFor("dbg"),
            params: { q: "1" },
          },
          navigateTo: mockNav,
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );

    await user.click(screen.queryByLabelText("Reader settings")!);

    await screen.findByText(/Reader settings/);
  });

  it("shows page specified from URL", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK);

    render(
      <RouteContext.Provider
        value={{
          route: {
            path: urlFor("dbg"),
            params: { q: "1" },
          },
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
          route: { path: urlFor("dbg") },
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
          route: { path: urlFor("dbg") },
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
          route: { path: urlFor("dbg") },
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

  it("shows settings tab", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);

    render(
      <RouteContext.Provider
        value={{
          route: { path: urlFor("dbg") },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/Gallia/);

    await user.click(screen.queryByLabelText("Reader settings")!);

    await screen.findByText(/Layout/);
    await screen.findByText(/Main column/);
    await screen.findByText(/Side column/);
  });
});
