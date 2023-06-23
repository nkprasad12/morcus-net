import { XmlNode } from "@/common/lewis_and_short/xml_node";
import { LsResult } from "./ls_api_result";

describe("LsResult type", () => {
  test("isMatch returns false on raw node", () => {
    const input = new XmlNode("span");
    expect(LsResult.isMatch(input)).toBe(false);
  });

  test("isMatch returns true on good input", () => {
    const input = new XmlNode("span");
    expect(LsResult.isMatch({ entry: input })).toBe(true);
  });
});
