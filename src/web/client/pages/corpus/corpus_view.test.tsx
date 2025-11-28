/**
 * @jest-environment jsdom
 */

import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/extend-expect";

import { CorpusQueryPage } from "@/web/client/pages/corpus/corpus_view";
import { RouteContext } from "@/web/client/router/router_v2";
import { callApiFull } from "@/web/utils/rpc/client_rpc";

jest.mock("@/web/utils/rpc/client_rpc");

// Replace the real SearchBox with a simple input so tests can assert placeholder.
// The SearchBox in the real app wires many props; here we only expose placeholderText and ariaLabel.
jest.mock(
  "@/web/client/components/generic/search",
  () => ({
    SearchBox: (props: any) => (
      <input
        data-testid="mock-searchbox"
        placeholder={props.placeholderText}
        aria-label={props.ariaLabel}
        onChange={(e) => props.onInput?.((e as any).target.value)}
        onKeyDown={(e) => {
          if ((e as any).key === "Enter") props.onRawEnter?.();
        }}
      />
    ),
  }),
  { virtual: true }
);
jest.mock("@/web/client/utils/media_query", () => {
  return {
    ...jest.requireActual("@/web/client/utils/media_query"),
    useMediaQuery: jest.fn(),
  };
});

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApiFull;

beforeEach(() => {
  mockCallApi.mockReset();
  mockCallApi.mockResolvedValue("");
});

afterEach(() => {
  cleanup();
});

describe("CorpusQueryPage", () => {
  test("renders search input placeholder and help summary", () => {
    render(
      <RouteContext.Provider
        value={{
          route: { path: "/corpus" },
          navigateTo: jest.fn(),
        }}>
        <CorpusQueryPage />
      </RouteContext.Provider>
    );

    // The mocked SearchBox renders an input with the placeholder.
    expect(
      screen.getByPlaceholderText("Enter corpus query")
    ).toBeInTheDocument();

    // The help summary is static in this file.
    expect(screen.getByText("How to Write Queries")).toBeInTheDocument();
  });

  test("corpus loading state", () => {
    mockCallApi.mockImplementation(() => new Promise(() => {}));

    render(
      <RouteContext.Provider
        value={{
          route: { path: "/corpus", params: { q: "amo" } },
          navigateTo: jest.fn(),
        }}>
        <CorpusQueryPage />
      </RouteContext.Provider>
    );

    // The mocked useApiCall calls onLoading, so the results section should show "Loading results for: amo"
    expect(screen.getByText(/Loading results for: amo/)).toBeInTheDocument();
  });

  test("shows 'No results found' when query returns zero results", async () => {
    const mockResult = {
      nextPage: undefined,
      matches: [],
      resultStats: { estimatedResults: 0 },
    };

    mockCallApi.mockResolvedValue({ data: mockResult });

    render(
      <RouteContext.Provider
        value={{
          // use the same shape as other tests — the component reads the query from the route
          route: { path: "/corpus", params: { q: "noresults" } },
          navigateTo: jest.fn(),
        }}>
        <CorpusQueryPage />
      </RouteContext.Provider>
    );

    // Wait for the onResult to resolve and the UI to update.
    expect(await screen.findByText(/No results found for/)).toBeInTheDocument();
    // The query text should be present as well.
    expect(screen.getByText("noresults")).toBeInTheDocument();
  });
});
