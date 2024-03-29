/**
 * @jest-environment jsdom
 */

import { Library } from "@/web/client/pages/library/library";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import { RouteContext } from "@/web/client/router/router_v2";

console.debug = jest.fn();

jest.mock("@/web/utils/rpc/client_rpc");

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApiFull;
mockCallApi.mockResolvedValue({
  data: [
    {
      author: "Caesar",
      name: "DBG",
      id: "DBG",
      urlAuthor: "caesar",
      urlName: "dbg",
    },
  ],
});

describe("library view", () => {
  it("shows items", async () => {
    render(<Library />);

    await screen.findByText(/Welcome/);
    await screen.findByText(/DBG/);
    await screen.findByText(/Caesar/);
  });

  it("handles item click", async () => {
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}>
        <Library />
      </RouteContext.Provider>
    );

    const dbgWork = await screen.findByText(/Caesar/);
    await user.click(dbgWork);

    expect(mockNav).toHaveBeenCalledWith({
      path: "/work/caesar/dbg",
      params: { pg: "1" },
    });
  });

  it("handles error", async () => {
    mockCallApi.mockRejectedValue("Error");
    render(<Library />);
    await screen.findByText(/Error loading/);
  });
});
