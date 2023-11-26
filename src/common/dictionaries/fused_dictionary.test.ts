import { EntryResult } from "@/common/dictionaries/dict_result";
import {
  CompletionsFusedRequest,
  DictInfo,
  Dictionary,
  DictsFusedRequest,
} from "@/common/dictionaries/dictionaries";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";

console.log = jest.fn();

class FakeDict implements Dictionary {
  readonly fakeGetEntry = jest.fn((i, e) => Promise.reject(new Error()));
  readonly fakeGetEntryById = jest.fn((i) => Promise.reject(new Error()));
  readonly fakeGetCompletions = jest.fn((i, e) => Promise.resolve(["a", "b"]));

  constructor(readonly info: DictInfo) {}

  getEntry(
    input: string,
    extras?: ServerExtras | undefined
  ): Promise<EntryResult[]> {
    return this.fakeGetEntry(input, extras);
  }

  getEntryById(id: string): Promise<EntryResult | undefined> {
    return this.fakeGetEntryById(id);
  }

  getCompletions(
    input: string,
    extras?: ServerExtras | undefined
  ): Promise<string[]> {
    return this.fakeGetCompletions(input, extras);
  }
}

describe("FusedDictionary", () => {
  it("handles all failures gracefully", async () => {
    const fakeLs = new FakeDict(LatinDict.LewisAndShort);
    const fakeSh = new FakeDict(LatinDict.SmithAndHall);
    const dict = new FusedDictionary([fakeLs, fakeSh]);
    const request: CompletionsFusedRequest = {
      query: "",
      dicts: [fakeLs.info.key, fakeSh.info.key],
    };

    const result = await dict.getEntry(request);

    expect(result).toEqual({});
  });

  it("handles partial failure correctly", async () => {
    const fakeLs = new FakeDict(LatinDict.LewisAndShort);
    const fakeSh = new FakeDict(LatinDict.SmithAndHall);
    fakeSh.fakeGetCompletions.mockRejectedValue(new Error());
    const dict = new FusedDictionary([fakeLs, fakeSh]);
    const request: CompletionsFusedRequest = {
      query: "",
      dicts: [fakeLs.info.key, fakeSh.info.key],
    };

    const result = await dict.getCompletions(request);

    const expected: Record<string, string[]> = {};
    expected[fakeLs.info.key] = ["a", "b"];
    expect(result).toEqual(expected);
  });

  it("handles multiple success correctly", async () => {
    const fakeLs = new FakeDict(LatinDict.LewisAndShort);
    const fakeSh = new FakeDict(LatinDict.SmithAndHall);
    fakeSh.fakeGetCompletions.mockResolvedValue(["c", "d"]);
    const dict = new FusedDictionary([fakeLs, fakeSh]);
    const request: CompletionsFusedRequest = {
      query: "",
      dicts: [fakeLs.info.key, fakeSh.info.key],
    };

    const result = await dict.getCompletions(request);

    const expected: Record<string, string[]> = {};
    expected[fakeLs.info.key] = ["a", "b"];
    expected[fakeSh.info.key] = ["c", "d"];
    expect(result).toEqual(expected);
  });

  it("handles unsupported dicts correctly", async () => {
    const fakeLs = new FakeDict(LatinDict.LewisAndShort);
    const fakeSh = new FakeDict(LatinDict.SmithAndHall);
    const dict = new FusedDictionary([fakeLs]);
    const request: CompletionsFusedRequest = {
      query: "",
      dicts: [fakeLs.info.key, fakeSh.info.key],
    };

    const result = await dict.getCompletions(request);

    const expected: Record<string, string[]> = {};
    expected[fakeLs.info.key] = ["a", "b"];
    expect(result).toEqual(expected);
  });

  it("handles unrequested dicts correctly", async () => {
    const fakeLs = new FakeDict(LatinDict.LewisAndShort);
    const fakeSh = new FakeDict(LatinDict.SmithAndHall);
    const dict = new FusedDictionary([fakeLs, fakeSh]);
    const request: CompletionsFusedRequest = {
      query: "",
      dicts: [fakeSh.info.key],
    };

    const result = await dict.getCompletions(request);

    const expected: Record<string, string[]> = {};
    expected[fakeSh.info.key] = ["a", "b"];
    expect(result).toEqual(expected);
  });

  it("requests inflections if needed", async () => {
    const fakeLs: Dictionary = {
      info: LatinDict.LewisAndShort,
      getEntry: jest.fn(async (_input, _extras, _options) => []),
      getEntryById: jest.fn(async (id) => undefined),
      getCompletions: jest.fn(),
    };
    const dict = new FusedDictionary([fakeLs]);
    const request: DictsFusedRequest = {
      query: "test",
      dicts: [fakeLs.info.key],
      mode: 1,
    };

    await dict.getEntry(request);

    expect(fakeLs.getEntry).toHaveBeenCalledWith("test", undefined, {
      handleInflections: true,
    });
  });
});
