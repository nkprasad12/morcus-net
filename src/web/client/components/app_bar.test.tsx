/**
 * @jest-environment jsdom
 */

import { describe, expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import { ResponsiveAppBar } from "@/web/client/components/app_bar";

jest.mock("@mui/material/useMediaQuery", () => {
  return {
    __esModule: true,
    default: jest.fn(() => false),
  };
});
import useMediaQuery from "@mui/material/useMediaQuery";
import {
  SettingsHandler,
  getGlobalSettings,
} from "@/web/client/components/global_flags";
import { RouteContext } from "@/web/client/router/router_v2";

describe("App Bar View", () => {
  const pages: ResponsiveAppBar.Page[] = [
    {
      name: "Gallia",
      path: "/gallia",
    },
    {
      name: "Omnis",
      path: "/omnis",
    },
    {
      name: "IconPage",
      path: "/settings",
      notInMainSection: true,
    },
  ];

  test("shows menu buttons", () => {
    render(<ResponsiveAppBar pages={pages} openIssueDialog={() => {}} />);

    expect(screen.getAllByText(pages[0].name)[0]).toBeDefined();
    expect(screen.getAllByText(pages[1].name)[0]).toBeDefined();
  });

  test("does not show icon menu buttons", () => {
    render(<ResponsiveAppBar pages={pages} openIssueDialog={() => {}} />);
    expect(screen.queryByText(pages[2].name)).toBeNull();
  });

  test("handles menu clicks", async () => {
    const mockSetPage = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ navigateTo: mockSetPage, route: { path: pages[0].path } }}>
        <ResponsiveAppBar pages={pages} openIssueDialog={() => {}} />
      </RouteContext.Provider>
    );

    await user.click(screen.getAllByText(pages[0].name)[0]);

    expect(mockSetPage).toBeCalledTimes(1);
    expect(mockSetPage).toBeCalledWith({ path: pages[0].path });
  });

  test("icon menu clicks", async () => {
    const mockSetPage = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ navigateTo: mockSetPage, route: { path: pages[0].path } }}>
        <ResponsiveAppBar pages={pages} openIssueDialog={() => {}} />
      </RouteContext.Provider>
    );

    await user.click(screen.getByLabelText("site settings"));

    expect(mockSetPage).toBeCalledTimes(1);
    expect(mockSetPage).toBeCalledWith({ path: "/settings" });
  });

  test("handles issue clicks", async () => {
    const mockReportIssue = jest.fn(() => {});
    render(
      <ResponsiveAppBar pages={pages} openIssueDialog={mockReportIssue} />
    );

    await user.click(screen.getByLabelText("report an issue"));

    expect(mockReportIssue).toBeCalledTimes(1);
  });

  test("handles dark mode clicks", async () => {
    localStorage.setItem("GlobalSettings", JSON.stringify({}));
    render(
      <SettingsHandler>
        <ResponsiveAppBar pages={pages} openIssueDialog={() => {}} />
      </SettingsHandler>
    );

    await user.click(screen.getByLabelText("dark mode"));
    expect(getGlobalSettings().darkMode).toBe(true);

    await user.click(screen.getByLabelText("light mode"));
    expect(getGlobalSettings().darkMode).toBe(false);
  });

  test("shows drawer on click", async () => {
    // @ts-ignore
    useMediaQuery.mockImplementation(() => true);
    render(<ResponsiveAppBar pages={pages} openIssueDialog={() => {}} />);

    expect(screen.getAllByText(pages[0].name)).toHaveLength(1);
    expect(screen.getAllByText(pages[1].name)).toHaveLength(1);
    await user.click(screen.getByLabelText("site pages"));

    // The Drawer should now show the options too.
    expect(screen.getAllByText(pages[0].name)).toHaveLength(2);
    expect(screen.getAllByText(pages[1].name)).toHaveLength(2);
  });
});
