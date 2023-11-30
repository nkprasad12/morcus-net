/**
 * @jest-environment jsdom
 */

import React from "react";

import user from "@testing-library/user-event";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { RouteContext } from "@/web/client/components/router";
import { render, screen } from "@testing-library/react";
import { ReadingPage } from "@/web/client/pages/library/reader";
import { WORK_PAGE } from "@/web/client/pages/library/common";
import { ProcessedWork } from "@/common/library/library_types";
import { XmlNode } from "@/common/xml/xml_node";

jest.mock("@/web/utils/rpc/client_rpc");

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApi;

const PROCESSED_WORK: ProcessedWork = {
  info: { title: "DBG", author: "Caesar" },
  textParts: ["chapter", "section"],
  chunks: [
    [[1, 1], new XmlNode("span", [], ["Gallia est omnis"])],
    [[1, 2], new XmlNode("span", [], [" divisa in partes tres"])],
  ],
};

describe("Reading UI", () => {
  it("fetches the expected resource", () => {
    mockCallApi.mockReturnValue(new Promise(() => {}));
    const testId = "caesar";

    render(
      <RouteContext.Provider
        value={{
          route: { path: `${WORK_PAGE}/${testId}` },
          navigateTo: () => {},
        }}
      >
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
        }}
      >
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
        }}
      >
        <ReadingPage />
      </RouteContext.Provider>
    );

    await screen.findByText(/error/);
  });

  it("shows work contents on success", async () => {
    const result: ProcessedWork = {
      info: { title: "DBG", author: "Caesar" },
      textParts: ["chapter", "section"],
      chunks: [
        [[1, 1], new XmlNode("span", [], ["Gallia est omnis"])],
        [[1, 2], new XmlNode("span", [], [" divisa in partes tres"])],
      ],
    };
    mockCallApi.mockResolvedValue(result);

    render(
      <RouteContext.Provider
        value={{
          route: { path: `${WORK_PAGE}/dbg` },
          navigateTo: () => {},
        }}
      >
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/DBG/);
    await screen.findByText(/Caesar/);
  });

  it("shows next and previous page contents", async () => {
    const result: ProcessedWork = {
      info: { title: "DBG", author: "Caesar" },
      textParts: ["chapter", "section"],
      chunks: [
        [[1, 1], new XmlNode("span", [], ["Gallia est omnis"])],
        [[2, 1], new XmlNode("span", [], [" divisa in partes tres"])],
      ],
    };
    mockCallApi.mockResolvedValue(result);

    render(
      <RouteContext.Provider
        value={{
          route: { path: `${WORK_PAGE}/dbg` },
          navigateTo: () => {},
        }}
      >
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/DBG/);
    expect(screen.queryByText(/Gallia/)).toBeNull();
    expect(screen.queryByText(/divisa/)).toBeNull();

    // We should see only the second chunk.
    await user.click(screen.queryByLabelText("next section")!);
    await user.click(screen.queryByLabelText("next section")!);
    expect(screen.queryByText(/Gallia/)).toBeNull();
    expect(screen.queryByText(/divisa/)).not.toBeNull();

    // We should wee only the first chunk.
    await user.click(screen.queryByLabelText("previous section")!);
    expect(screen.queryByText(/Gallia/)).not.toBeNull();
    expect(screen.queryByText(/divisa/)).toBeNull();
  });

  it("uses correct nav updates", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK);
    const mockNav = jest.fn();
    render(
      <RouteContext.Provider
        value={{
          route: { path: `${WORK_PAGE}/dbg` },
          navigateTo: mockNav,
        }}
      >
        <ReadingPage />
      </RouteContext.Provider>
    );

    await user.click(screen.queryByLabelText("next section")!);

    expect(mockNav).not.toHaveBeenCalled();
    expect(window.location.href.includes("q=0")).toBe(true);
  });

  it("shows page specified from URL", async () => {
    mockCallApi.mockResolvedValue(PROCESSED_WORK);

    render(
      <RouteContext.Provider
        value={{
          route: { path: `${WORK_PAGE}/dbg`, query: "1" },
          navigateTo: () => {},
        }}
      >
        <ReadingPage />
      </RouteContext.Provider>
    );
    await screen.findByText(/Gallia/);
  });
});
