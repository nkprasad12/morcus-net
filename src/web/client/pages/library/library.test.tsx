/**
 * @jest-environment jsdom
 */

global.structuredClone = (x) => JSON.parse(JSON.stringify(x));
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { Library } from "@/web/client/pages/library/library";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import { RouteContext } from "@/web/client/router/router_v2";

console.debug = jest.fn();

jest.mock("@/web/utils/rpc/client_rpc");

beforeEach(() => {
  // eslint-disable-next-line no-global-assign
  indexedDB = new IDBFactory();
});

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApiFull;
mockCallApi.mockResolvedValue({
  data: [
    {
      author: "Caesar",
      name: "DBG",
      id: "phi002",
      urlAuthor: "caesar",
      urlName: "dbg",
    },
    {
      author: "Sallust",
      name: "Catalina",
      id: "phi001",
      urlAuthor: "sallust",
      urlName: "catalina",
    },
  ],
});

describe("library view", () => {
  it("shows items", async () => {
    render(<Library />);

    await screen.findByText(/Welcome/);
    await screen.findByText(/DBG/);
    await screen.findByText(/Caesar/);
    await screen.findByText(/Sallust/);
    await screen.findByText(/Catalina/);
  });

  it("allows filter by full id", async () => {
    render(<Library />);
    await screen.findByText(/Welcome/);

    const search = screen.getByRole("combobox");
    await user.click(search);
    await user.type(search, "phi001");

    expect(screen.queryByText("DBG")).toBeNull();
    expect(screen.queryByText("Sallust")).not.toBeNull();
    expect(screen.queryByText("Catalina")).not.toBeNull();
  });

  it("has working filter", async () => {
    render(<Library />);
    await screen.findByText(/Welcome/);

    const search = screen.getByRole("combobox");
    await user.click(search);
    await user.type(search, "Cat");

    expect(screen.queryByText("DBG")).toBeNull();
    expect(screen.queryByText("Sallust")).not.toBeNull();
    expect(screen.queryByText("Catalina")).not.toBeNull();
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
      params: {},
    });
  });

  it("handles error", async () => {
    mockCallApi.mockRejectedValue("Error");
    render(<Library />);
    await screen.findByText(/Error loading/);
  });
});
