/**
 * @jest-environment jsdom
 */

import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/extend-expect";

import {
  CorpusQueryPage,
  transformQuery,
} from "@/web/client/pages/corpus/corpus_view";
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

describe("transformQuery", () => {
  describe("simple queries", () => {
    it("should pass through single word unchanged", () => {
      expect(transformQuery("puella")).toBe("puella");
    });

    it("should pass through adjacent words unchanged", () => {
      expect(transformQuery("puella puer")).toBe("puella puer");
    });

    it("should handle work filters", () => {
      expect(transformQuery("#caesar puella")).toBe("[caesar] puella");
    });

    it("should transform proximity operators", () => {
      expect(transformQuery("puella ~5 puer")).toBe("puella 5~ puer");
    });

    it("should transform directed proximity operators", () => {
      expect(transformQuery("puella ~5> puer")).toBe("puella 5~> puer");
    });
  });

  describe("complex terms with logical operators", () => {
    it("should wrap unparenthesized 'and' terms in parentheses", () => {
      expect(transformQuery("puella and puer")).toBe("( puella and puer )");
    });

    it("should preserve existing parentheses", () => {
      expect(transformQuery("(puella and puer)")).toBe("( puella and puer )");
    });

    it("should handle multiple operators", () => {
      expect(transformQuery("puella or puer or amor")).toBe(
        "( puella or puer or amor )"
      );
    });
  });

  describe("complex scenarios", () => {
    it("should handle adjacent complex terms", () => {
      expect(transformQuery("puella and puer amor and bellum")).toBe(
        "( puella and puer ) ( amor and bellum )"
      );
    });

    it("should handle adjacent complex terms with missing close parentheses", () => {
      expect(transformQuery("puella and puer (amor and bellum")).toBe(
        "( puella and puer ) ( amor and bellum )"
      );
    });

    it("should handle complex terms with proximity", () => {
      expect(transformQuery("puella and puer ~5 amor")).toBe(
        "( puella and puer ) 5~ amor"
      );
    });

    it("should handle parenthesized term followed by simple term", () => {
      expect(transformQuery("(puella and puer) amor")).toBe(
        "( puella and puer ) amor"
      );
    });

    it("should handle simple term followed by parenthesized term", () => {
      expect(transformQuery("amor (puella and puer)")).toBe(
        "amor ( puella and puer )"
      );
    });

    it("should handle work filter with complex query", () => {
      expect(transformQuery("#caesar (puella and puer) ~5 amor")).toBe(
        "[caesar] ( puella and puer ) 5~ amor"
      );
    });

    it("should handle multiple parenthesized terms with proximity", () => {
      expect(transformQuery("(puella or puer) ~5 (amor and bellum)")).toBe(
        "( puella or puer ) 5~ ( amor and bellum )"
      );
    });

    it("should handle filters in complex terms", () => {
      expect(transformQuery("@lemma:amo and @case:genitive")).toBe(
        "( @lemma:amo and @case:genitive )"
      );
    });

    it("should handle mixed filters and words", () => {
      expect(transformQuery("puella and @lemma:puer ~3 @case:acc")).toBe(
        "( puella and @lemma:puer ) 3~ @case:acc"
      );
    });
  });

  describe("edge cases", () => {
    it("should handle empty query", () => {
      expect(transformQuery("")).toBe("");
    });

    it("should return query as-is on parse error", () => {
      // Invalid query: 'and' at start
      expect(transformQuery("and puella")).toBe("and puella");
    });

    it("should handle proximity at different positions", () => {
      expect(transformQuery("puella ~5 puer ~3 amor")).toBe(
        "puella 5~ puer 3~ amor"
      );
    });
  });
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

  test("disclaimer shows standard warning for simple queries", async () => {
    const mockResult = {
      nextPage: undefined,
      matches: [],
      resultStats: { estimatedResults: 0 },
    };
    mockCallApi.mockResolvedValue({ data: mockResult });

    render(
      <RouteContext.Provider
        value={{
          route: { path: "/corpus", params: { q: "simple" } },
          navigateTo: jest.fn(),
        }}>
        <CorpusQueryPage />
      </RouteContext.Provider>
    );

    expect(await screen.findByText(/No results found for/)).toBeInTheDocument();
    expect(
      screen.getByText(/This tool is a work in progress/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Your query includes inflection filters/)
    ).not.toBeInTheDocument();
  });

  test("disclaimer shows inflection warning for complex queries", async () => {
    const mockResult = {
      nextPage: undefined,
      matches: [],
      resultStats: { estimatedResults: 0 },
    };
    mockCallApi.mockResolvedValue({ data: mockResult });

    render(
      <RouteContext.Provider
        value={{
          route: { path: "/corpus", params: { q: "@lemma:amo" } },
          navigateTo: jest.fn(),
        }}>
        <CorpusQueryPage />
      </RouteContext.Provider>
    );

    expect(await screen.findByText(/No results found for/)).toBeInTheDocument();
    expect(
      screen.getByText(/This tool is a work in progress/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Your query includes inflection filters/)
    ).toBeInTheDocument();
  });
});
