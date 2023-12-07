/**
 * @jest-environment jsdom
 */

import { Library } from "@/web/client/pages/library/library";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import { RouteContext } from "@/web/client/components/router";

jest.mock("@/web/utils/rpc/client_rpc");

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApiFull;
mockCallApi.mockResolvedValue({
  data: [{ author: "Caesar", name: "DBG", id: "DBG" }],
});

describe("library view", () => {
  it("shows items", async () => {
    render(<Library />);

    await screen.findByText("Welcome to the library.");
    await screen.findByText(/DBG/);
    await screen.findByText(/Caesar/);
  });

  it("shows items", async () => {
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}
      >
        <Library />
      </RouteContext.Provider>
    );

    const dbgWork = await screen.findByText(/Caesar/);
    await user.click(dbgWork);

    expect(mockNav).toHaveBeenCalledWith({ path: "/work/DBG" });
  });
});
