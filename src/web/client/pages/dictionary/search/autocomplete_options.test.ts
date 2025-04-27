import { callApi } from "@/web/utils/rpc/client_rpc";
import { autocompleteOptions } from "@/web/client/pages/dictionary/search/autocomplete_options";
// @ts-ignore
import { FusedAutocompleteFetcher } from "@/web/client/pages/dictionary/search/fused_autocomplete_fetcher";
import { DictInfo } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";

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
        ...original.FusedAutocompleteFetcher,
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
      const finalResult: Record<string, string[]> = {};
      for (const dict in result) {
        if (request.dicts && !request.dicts.includes(dict)) {
          continue;
        }
        finalResult[dict] = result[dict].filter((w) =>
          request.query.startsWith("-")
            ? w.endsWith(request.query.slice(1))
            : w.startsWith(request.query)
        );
      }
      return Promise.resolve(finalResult);
    });
  }
}

const LD1: DictInfo = {
  key: "LS",
  displayName: "Lewis and Short",
  languages: { from: "La", to: "En" },
  tags: ["Classical"],
};
const GAF: DictInfo = {
  key: LatinDict.Gaffiot.key,
  displayName: "Gaffiot",
  languages: { from: "La", to: "Fr" },
  tags: ["Classical"],
};
const ED1: DictInfo = {
  key: "SH",
  displayName: "Smith and Hall",
  languages: { from: "En", to: "La" },
  tags: ["Classical"],
};
const ED2: DictInfo = {
  key: "RA",
  displayName: "Riddle Arnold",
  languages: { from: "En", to: "La" },
  tags: ["Classical"],
};

const LS_LIST = [
  "ab",
  "abago",
  "dives",
  "insunt",
  "jam",
  "oīo",
  "occīdo",
  "occĭdo",
  "sab",
  "sad",
];
const SH_LIST = ["away", "now", "dives", "inside", "jab", "sac"];
const RA_LIST = ["dives"];
const GAF_LIST = ["abago", "oĭō", "occĭdō", "occīdō"];
const ALL_DICTS = {
  LS: LS_LIST,
  SH: SH_LIST,
  RA: RA_LIST,
  [GAF.key]: GAF_LIST,
};

describe("autocompleteOptions", () => {
  it("returns empty on empty", async () => {
    expect(await autocompleteOptions("", [LD1])).toEqual([]);
  });

  it("handles underlying error", async () => {
    setApiResult(new Error());
    const result = await autocompleteOptions("ab", [LD1]);
    expect(result).toEqual([]);
  });

  it("returns expected substrings", async () => {
    setApiResult(ALL_DICTS);
    const result = await autocompleteOptions("aba", [LD1]);
    expect(result).toStrictEqual([["La", "abago"]]);
  });

  it("returns expected suffixes", async () => {
    setApiResult(ALL_DICTS);
    const result = await autocompleteOptions("-ab", [LD1]);
    expect(result).toStrictEqual([
      ["La", "ab"],
      ["La", "sab"],
    ]);
  });

  it("fetches alternate character completions for Latin only", async () => {
    setApiResult(ALL_DICTS);
    const result = await autocompleteOptions("i", [LD1, ED1]);
    expect(result).toStrictEqual([
      ["En", "inside"],
      ["La", "insunt"],
      ["La", "jam"],
    ]);
  });

  it("orders results from multiple dictionaries", async () => {
    setApiResult(ALL_DICTS);
    const result = await autocompleteOptions("sa", [LD1, ED1]);
    expect(result).toStrictEqual([
      ["La", "sab"],
      ["En", "sac"],
      ["La", "sad"],
    ]);
  });

  it("displays correct results on dict settings change to exclude", async () => {
    setApiResult(ALL_DICTS);
    await autocompleteOptions("sa", [LD1, ED1]);

    const result = await autocompleteOptions("sa", [LD1]);

    expect(result).toStrictEqual([
      ["La", "sab"],
      ["La", "sad"],
    ]);
  });

  it("displays correct results on dict settings change to include more", async () => {
    setApiResult({ LS: LS_LIST });
    await autocompleteOptions("sa", [LD1]);

    setApiResult(ALL_DICTS);
    const result = await autocompleteOptions("sa", [LD1, ED1]);

    expect(result).toStrictEqual([
      ["La", "sab"],
      ["En", "sac"],
      ["La", "sad"],
    ]);
  });

  it("displays correct options with internal character", async () => {
    setApiResult(ALL_DICTS);
    const result = await autocompleteOptions("insv", [LD1, ED1]);
    expect(result).toStrictEqual([["La", "insunt"]]);
  });

  it("dedupes results from same language dictionary", async () => {
    setApiResult(ALL_DICTS);
    const result = await autocompleteOptions("d", [ED1, ED2]);
    expect(result).toStrictEqual([["En", "dives"]]);
  });

  it("splits results from different language dictionary", async () => {
    setApiResult(ALL_DICTS);
    const result = await autocompleteOptions("d", [LD1, ED1, ED2]);
    expect(result).toStrictEqual([
      ["La", "dives"],
      ["En", "dives"],
    ]);
  });

  it("combines vowel compatible results in same language", async () => {
    setApiResult(ALL_DICTS);
    const result = await autocompleteOptions("o", [LD1, GAF]);
    expect(result).toStrictEqual([
      ["La", "occīdō"],
      ["La", "occĭdō"],
      ["La", "oīo"],
      ["La", "oĭō"],
    ]);
  });
});
