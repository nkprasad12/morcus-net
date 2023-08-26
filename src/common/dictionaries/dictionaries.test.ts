import { EntryResult } from "@/common/dictionaries/dict_result";
import {
  CompletionsFusedRequest,
  CompletionsFusedResponse,
  DictsFusedRequest,
  DictsFusedResponse,
} from "@/common/dictionaries/dictionaries";
import { XmlNode } from "@/common/xml/xml_node";

const ENTRY_RESULT: EntryResult = {
  entry: new XmlNode("foo"),
  outline: {
    mainKey: "foo",
    mainSection: {
      text: "bar",
      level: 0,
      ordinal: "",
      sectionId: "",
    },
  },
};

describe("Dictionaries API types", () => {
  test("DictsFusedRequest isMatch returns expected", () => {
    expect(DictsFusedRequest.isMatch({ query: "foo" })).toBe(false);
    expect(DictsFusedRequest.isMatch({ query: "foo", dicts: [] })).toBe(true);
  });

  test("DictsFusedResponse isMatch returns expected", () => {
    expect(DictsFusedResponse.isMatch({ ls: ENTRY_RESULT })).toBe(false);
    expect(DictsFusedResponse.isMatch({})).toBe(true);
    expect(DictsFusedResponse.isMatch({ ls: [ENTRY_RESULT] })).toBe(true);
  });

  test("CompletionsFusedRequest isMatch returns expected", () => {
    expect(CompletionsFusedRequest.isMatch({ query: "foo" })).toBe(false);
    expect(CompletionsFusedRequest.isMatch({ query: "foo", dicts: [] })).toBe(
      true
    );
  });

  test("CompletionsFusedResponse isMatch returns expected", () => {
    expect(CompletionsFusedResponse.isMatch({ ls: "result" })).toBe(false);
    expect(CompletionsFusedResponse.isMatch({})).toBe(true);
    expect(CompletionsFusedResponse.isMatch({ ls: ["result"] })).toBe(true);
  });
});
