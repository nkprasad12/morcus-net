/**
 * @jest-environment jsdom
 */

import user from "@testing-library/user-event";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { RouteContext } from "@/web/client/components/router";
import { render, screen } from "@testing-library/react";
import { ReadingPage } from "@/web/client/pages/library/reader";
import { WORK_PAGE } from "@/web/client/pages/library/common";
import { ProcessedWork } from "@/common/library/library_types";
import { XmlNode } from "@/common/xml/xml_node";
import { invalidateWorkCache } from "@/web/client/pages/library/work_cache";

jest.mock("@/web/utils/rpc/client_rpc");

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApi;

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

describe("Reading UI", () => {
  beforeAll(invalidateWorkCache);
  afterEach(invalidateWorkCache);

  it("fetches the expected resource", () => {
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
          route: { path: `${WORK_PAGE}/${testId}` },
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
          route: { path: `${WORK_PAGE}/dbg` },
          navigateTo: () => {},
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/DBG/);
    await screen.findByText(/Caesar/);
  });

  it("shows correct contents for page", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);

    render(
      <RouteContext.Provider
        value={{
          route: { path: `${WORK_PAGE}/dbg`, query: "2" },
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
    const path = `${WORK_PAGE}/dbg`;
    render(
      <RouteContext.Provider
        value={{
          route: { path },
          navigateTo: mockNav,
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/DBG/);

    await user.click(screen.queryByLabelText("next section")!);

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path, query: "2" })
    );
  });

  it("uses correct nav updates on next page key", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);
    const mockNav = jest.fn();
    const path = `${WORK_PAGE}/dbg`;
    render(
      <RouteContext.Provider
        value={{
          route: { path },
          navigateTo: mockNav,
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/DBG/);

    await user.keyboard("[ArrowRight]");

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path, query: "2" })
    );
  });

  it("uses correct nav updates on previous page button", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);
    const mockNav = jest.fn();
    const path = `${WORK_PAGE}/dbg`;
    render(
      <RouteContext.Provider
        value={{
          route: { path, query: "2" },
          navigateTo: mockNav,
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/DBG/);

    await user.keyboard("[ArrowLeft]");

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path, query: "1" })
    );
  });

  it("uses correct nav updates on previous page key", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK_MULTI_CHAPTER);
    const mockNav = jest.fn();
    const path = `${WORK_PAGE}/dbg`;
    render(
      <RouteContext.Provider
        value={{
          route: { path, query: "2" },
          navigateTo: mockNav,
        }}>
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/DBG/);

    await user.click(screen.queryByLabelText("previous section")!);

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path, query: "1" })
    );
  });

  // TODO: Figure out why this test doesn't work.
  it.skip("shows settings page", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK);
    const mockNav = jest.fn();
    render(
      <RouteContext.Provider
        value={{
          route: { path: `${WORK_PAGE}/dbg`, query: "1" },
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
          route: { path: `${WORK_PAGE}/dbg`, query: "1" },
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
          route: { path: `${WORK_PAGE}/dbg` },
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
          route: { path: `${WORK_PAGE}/dbg` },
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
          route: { path: `${WORK_PAGE}/dbg` },
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
          route: { path: `${WORK_PAGE}/dbg` },
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
