/**
 * @jest-environment jsdom
 */

import React from "react";

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
    await screen.findByText(/divisa/);
    await screen.findByText(/Gallia/);
  });
});
