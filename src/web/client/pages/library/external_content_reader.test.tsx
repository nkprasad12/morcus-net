/**
 * @jest-environment jsdom
 */

import { ExternalContentReader } from "@/web/client/pages/library/external_content_reader";
import {
  ContentIndex,
  SavedContent,
  BackendProviderContext,
} from "@/web/client/pages/library/external_content_storage";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import { callApi } from "@/web/utils/rpc/client_rpc";

jest.mock("@/web/utils/rpc/client_rpc");

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApi;

beforeEach(() => {
  mockCallApi.mockReset();
  mockCallApi.mockResolvedValue("");
});

function prepareReader() {
  const getContentIndex = jest.fn<Promise<ContentIndex[]>, any>(() =>
    Promise.resolve([])
  );
  const deleteContent = jest.fn(() => Promise.resolve([]));
  const saveContent = jest.fn(() => Promise.resolve([]));
  const loadContent = jest.fn<Promise<SavedContent>, any>(() =>
    Promise.reject()
  );

  return {
    getContentIndex,
    deleteContent,
    saveContent,
    loadContent,
    renderReader: () => {
      render(
        <BackendProviderContext.Provider
          value={{
            useBackend: () => ({
              getContentIndex,
              deleteContent,
              saveContent,
              loadContent,
            }),
          }}>
          <ExternalContentReader />
        </BackendProviderContext.Provider>
      );
    },
  };
}

describe("external reader", () => {
  it("shows default items with no saved content", async () => {
    const { renderReader } = prepareReader();
    renderReader();

    await screen.findByText(/Load Previous Import/);
    await screen.findByText(/No saved imports/);
    await screen.findByText(/Import Raw Text/);
  });

  it("shows items with saved content", async () => {
    const { renderReader, getContentIndex } = prepareReader();
    getContentIndex.mockResolvedValue([{ title: "DBG", storageKey: "key" }]);
    renderReader();

    await screen.findByText(/Load Previous Import/);
    await screen.findByText(/DBG/);
    await screen.findByText(/Import Raw Text/);
  });

  it("loads saved content upon click", async () => {
    const { renderReader, getContentIndex, loadContent } = prepareReader();
    getContentIndex.mockResolvedValue([{ title: "Met", storageKey: "key" }]);
    loadContent.mockResolvedValue({ title: "Met", content: "In nova fert" });
    renderReader();

    await screen.findByText(/Load Previous Import/);
    await screen.findByText(/Met/);
    await user.click(screen.getByText(/Met/));

    await screen.findByText(/Reading imported/);
    await screen.findByText("In");
    await screen.findByText("nova");
    await screen.findByText("fert");
  });

  it("deletes saved content", async () => {
    const { renderReader, getContentIndex, deleteContent } = prepareReader();
    getContentIndex.mockResolvedValue([{ title: "DBG", storageKey: "key" }]);
    renderReader();
    await screen.findByText(/Delete/);

    await user.click(screen.getByText(/Delete/));

    expect(deleteContent).toHaveBeenCalledTimes(1);
  });

  it("allows import via form", async () => {
    const { renderReader, saveContent } = prepareReader();
    renderReader();

    await user.click(screen.getByText(/Import Raw Text/));
    await user.click(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "DBG");

    await user.click(screen.getByLabelText("Text to import"));
    await user.type(
      screen.getByLabelText("Text to import"),
      "Gallia est omnis"
    );
    await user.click(screen.getByLabelText("Import text"));

    expect(saveContent).toHaveBeenCalledTimes(1);
    expect(saveContent).toHaveBeenCalledWith({
      title: "DBG",
      content: "Gallia est omnis",
    });
    await screen.findByText(/Reading imported/);
    await screen.findByText("Gallia");
    await screen.findByText("est");
    await screen.findByText("omnis");
  });

  it("allows import via link", async () => {
    mockCallApi.mockResolvedValue("Arma virumque");
    const { renderReader, saveContent } = prepareReader();
    renderReader();

    await user.click(screen.getByText(/Import From URL/));

    await user.click(screen.getByLabelText("Page URL"));
    await user.type(screen.getByLabelText("Page URL"), "foo.bar");
    await user.click(screen.getByLabelText("Import from link"));

    screen.debug();
    expect(saveContent).toHaveBeenCalledTimes(1);
    expect(saveContent).toHaveBeenCalledWith({
      title: "foo.bar",
      content: "Arma virumque",
    });
    await screen.findByText(/Reading imported/);
    await screen.findByText("Arma");
    await screen.findByText("virumque");
  });
});
