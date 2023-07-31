import { callApi } from "@/web/utils/rpc/client_rpc";
import { autocompleteOptions } from "@/web/client/pages/dictionary/search/autocomplete_options";
// @ts-ignore
import { FusedAutocompleteFetcher } from "@/web/client/pages/dictionary/search/fused_autocomplete_fetcher";
import { DictInfo } from "@/common/dictionaries/dictionaries";

jest.mock("@/web/utils/rpc/client_rpc");
jest.mock(
  "@/web/client/pages/dictionary/search/fused_autocomplete_fetcher",
  () => {
    const original = jest.requireActual(
      "@/web/client/pages/dictionary/search/fused_autocomplete_fetcher"
    );
    return {
      ...original,
      FusedAutocompleteFetcher: {
        ...original.FusedAutoCompleteFetcher,
        get: () => new original.FusedAutocompleteFetcher(),
      },
    };
  }
);

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApi;

afterEach(() => {
  mockCallApi.mockReset();
});

function setApiResult(result: Record<string, string[]> | Error) {
  if (result instanceof Error) {
    mockCallApi.mockRejectedValue(result);
  } else {
    mockCallApi.mockImplementation((_, request) => {
      const prefix = request.query;
      const finalResult: Record<string, string[]> = {};
      for (const dict in result) {
        finalResult[dict] = result[dict].filter((w) => w.startsWith(prefix));
      }
      return Promise.resolve(finalResult);
    });
  }
}

const LS_LIST = ["ab", "abago", "insunt", "jam", "sab", "sad"];
const SH_LIST = ["away", "now", "inside", "jab", "sac"];
const ALL_DICTS = { LS: LS_LIST, SH: SH_LIST };

const LD1: DictInfo = {
  key: "LS",
  displayName: "Lewis and Short",
  languages: { from: "La", to: "En" },
  tags: ["Classical"],
};
const ED1: DictInfo = {
  key: "SH",
  displayName: "Smith and Hall",
  languages: { from: "En", to: "La" },
  tags: ["Classical"],
};

describe("autocompleteOptions", () => {
  it("handles underlying error", async () => {
    setApiResult(new Error());
    const result = await autocompleteOptions("ab", [LD1]);
    expect(result).toEqual([]);
  });

  it("returns expected substrings", async () => {
    setApiResult(ALL_DICTS);
    const result = await autocompleteOptions("aba", [LD1]);
    expect(result).toStrictEqual([[LD1, "abago"]]);
  });

  it("fetches alternate character completions for Latin only", async () => {
    setApiResult(ALL_DICTS);
    const result = await autocompleteOptions("i", [LD1, ED1]);
    expect(result).toStrictEqual([
      [ED1, "inside"],
      [LD1, "insunt"],
      [LD1, "jam"],
    ]);
  });

  it("orders results from multiple dictionaries", async () => {
    setApiResult(ALL_DICTS);
    const result = await autocompleteOptions("sa", [LD1, ED1]);
    expect(result).toStrictEqual([
      [LD1, "sab"],
      [ED1, "sac"],
      [LD1, "sad"],
    ]);
  });

  it("displays correct options with internal character", async () => {
    setApiResult(ALL_DICTS);
    const result = await autocompleteOptions("insv", [LD1, ED1]);
    expect(result).toStrictEqual([[LD1, "insunt"]]);
  });
});
