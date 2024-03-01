import { EndIndexRow } from "@/morceus/tables/indices";

describe("EndIndexRow", () => {
  it("parses and stringifies correctly", () => {
    const original: EndIndexRow = {
      ending: "foo",
      tableNames: ["bar", "baz"],
    };
    expect(EndIndexRow.parse(EndIndexRow.stringify(original))).toEqual(
      original
    );
  });
});
