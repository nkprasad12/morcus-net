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

describe("Single Page App View", () => {
  const pages: SinglePageApp.Page[] = [GALLIA_PAGE, OMNIS_PAGE];
  const experimentPages: SinglePageApp.Page[] = [
    { ...GALLIA_PAGE, experimental: true },
    OMNIS_PAGE,
  ];
  const pagesWithSubpages: SinglePageApp.Page[] = [
    { ...GALLIA_PAGE, paths: [PagePath.of("/gallia/:est")!] },
  ];

  it("shows correct initial content", () => {
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/gallia" }, navigateTo: mockNav }}>
        <SinglePageApp pages={pages} />
      </RouteContext.Provider>
    );

    expect(screen.queryByText("GalliaPage")).not.toBeNull();
    expect(screen.queryByText("OmnisPage")).toBeNull();
  });

  it("shows all pages in experiment mode", () => {
    localStorage.setItem(
      "GlobalSettings",
      JSON.stringify({
        experimentalMode: true,
      })
    );
    const mockNav = jest.fn(() => {});
    render(
      <SettingsHandler>
        <RouteContext.Provider
          value={{ route: { path: "/gallia" }, navigateTo: mockNav }}>
          <SinglePageApp pages={experimentPages} />
        </RouteContext.Provider>
      </SettingsHandler>
    );

    expect(screen.queryAllByText("Gallia")).not.toHaveLength(0);
    expect(screen.queryAllByText("Omnis")).not.toHaveLength(0);
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

  it("hides pages in experiment mode", () => {
    localStorage.setItem(
      "GlobalSettings",
      JSON.stringify({
        experimentalMode: false,
      })
    );
    const mockNav = jest.fn(() => {});
    render(
      <SettingsHandler>
        <RouteContext.Provider
          value={{ route: { path: "/gallia" }, navigateTo: mockNav }}>
          <SinglePageApp pages={experimentPages} />
        </RouteContext.Provider>
      </SettingsHandler>
    );

    expect(screen.queryAllByText("Gallia")).toHaveLength(0);
    expect(screen.queryAllByText("Omnis")).not.toHaveLength(0);
  });

  it("shows navigation on bad path", () => {
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/g" }, navigateTo: mockNav }}>
        <SinglePageApp pages={pages} />
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
        <SinglePageApp pages={pages} />
      </RouteContext.Provider>
    );

    await user.click(screen.getAllByText("Omnis")[0]);

    expect(mockNav).toHaveBeenCalledWith({ path: "/omnis" });
  });
});
