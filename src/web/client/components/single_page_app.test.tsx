/**
 * @jest-environment jsdom
 */

import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import { describe, expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import { SinglePageApp } from "@/web/client/components/single_page_app";
import { SettingsHandler } from "@/web/client/components/global_flags";
import { RouteContext } from "@/web/client/router/router_v2";
import { PagePath } from "@/web/client/router/paths";
import { FakeBroadcastChannel } from "@/web/client/offline/fake_broadcast_channel";

jest.mock("@/web/client/utils/media_query");

global.BroadcastChannel = FakeBroadcastChannel as any;
console.debug = jest.fn();

beforeEach(() => {
  // eslint-disable-next-line no-global-assign
  indexedDB = new IDBFactory();
});

const GALLIA_PAGE: SinglePageApp.Page = {
  appBarConfig: {
    name: "Gallia",
    targetPath: "/gallia",
  },
  paths: [PagePath.of("/gallia")!],
  Content: () => <div>GalliaPage</div>,
};
const OMNIS_PAGE: SinglePageApp.Page = {
  appBarConfig: {
    name: "Omnis",
    targetPath: "/omnis",
  },
  paths: [PagePath.of("/omnis")!],
  Content: () => <div>OmnisPage</div>,
};
const DIVISA_PAGE: SinglePageApp.Page = {
  paths: [PagePath.of("/divisa")!],
  Content: () => <div>DivisaPage</div>,
};
const ALL_PAGES = [GALLIA_PAGE, OMNIS_PAGE, DIVISA_PAGE];

beforeAll(() => {
  // js-dom doesn't yet support `dialog`.
  HTMLDialogElement.prototype.show = jest.fn();
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
});

describe("Single Page App View", () => {
  const pagesWithSubpages: SinglePageApp.Page[] = [
    { ...GALLIA_PAGE, paths: [PagePath.of("/gallia/:est")!] },
  ];

  it("shows correct initial content", () => {
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/gallia" }, navigateTo: mockNav }}>
        <SinglePageApp pages={ALL_PAGES} />
      </RouteContext.Provider>
    );

    expect(screen.queryByText("GalliaPage")).not.toBeNull();
    expect(screen.queryByText("OmnisPage")).toBeNull();
  });

  it("shows only some pages in the app bar", () => {
    const mockNav = jest.fn(() => {});
    render(
      <SettingsHandler>
        <RouteContext.Provider
          value={{ route: { path: "/gallia" }, navigateTo: mockNav }}>
          <SinglePageApp pages={ALL_PAGES} />
        </RouteContext.Provider>
      </SettingsHandler>
    );

    expect(screen.queryAllByText("Gallia")).not.toHaveLength(0);
    expect(screen.queryAllByText("Omnis")).not.toHaveLength(0);
    expect(screen.queryAllByText("Divisa")).toHaveLength(0);
  });

  it("show page on subpage, if required", () => {
    const mockNav = jest.fn(() => {});
    render(
      <SettingsHandler>
        <RouteContext.Provider
          value={{ route: { path: "/gallia/bar" }, navigateTo: mockNav }}>
          <SinglePageApp pages={pagesWithSubpages} />
        </RouteContext.Provider>
      </SettingsHandler>
    );

    expect(screen.queryByText("GalliaPage")).not.toBeNull();
  });

  it("shows navigation on bad path", () => {
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/g" }, navigateTo: mockNav }}>
        <SinglePageApp pages={ALL_PAGES} />
      </RouteContext.Provider>
    );

    expect(screen.queryAllByText("Gallia")).not.toHaveLength(0);
    expect(screen.queryAllByText("Omnis")).not.toHaveLength(0);
  });

  test("updates context on navigation", async () => {
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/gallia" }, navigateTo: mockNav }}>
        <SinglePageApp pages={ALL_PAGES} />
      </RouteContext.Provider>
    );

    await user.click(screen.getAllByText("Omnis")[0]);

    expect(mockNav).toHaveBeenCalledWith({ path: "/omnis" });
  });
});
