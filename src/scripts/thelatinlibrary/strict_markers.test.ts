import { ConversionError } from "@/scripts/thelatinlibrary/page";
import { splitAtSequentialMarkers } from "@/scripts/thelatinlibrary/strict_markers";

describe("splitAtSequentialMarkers", () => {
  it("splits paragraph-leading markers with optional leading pr", () => {
    const result = splitAtSequentialMarkers(
      ["Preamble text.", "[1] First chapter.", "[2] Second chapter."],
      { label: "Test", allowLeadingPr: true }
    );
    expect(result).toEqual([
      ["pr", "Preamble text."],
      ["1", "First chapter."],
      ["2", "Second chapter."],
    ]);
  });

  it("rejects out-of-order paragraph-leading markers", () => {
    expect(() =>
      splitAtSequentialMarkers(["[1] First.", "[3] Third."], { label: "Test" })
    ).toThrow(ConversionError);
  });

  it("splits inline markers across paragraphs", () => {
    const result = splitAtSequentialMarkers(
      ["Theme.", "[1] First. [2] Second", "continues. [3] Third."],
      { label: "Test", allowInlineSplits: true, allowLeadingPr: true }
    );
    expect(result).toEqual([
      ["pr", "Theme."],
      ["1", "First."],
      ["2", "Second continues."],
      ["3", "Third."],
    ]);
  });

  it("ignores out-of-order inline candidates when ignoreOutOfOrderInline is true", () => {
    const result = splitAtSequentialMarkers(
      ["[1] Caesa sunt [5] milia. [2] Deinde pax."],
      {
        label: "Test",
        allowInlineSplits: true,
        ignoreOutOfOrderInline: true,
      }
    );
    expect(result).toEqual([
      ["1", "Caesa sunt [5] milia."],
      ["2", "Deinde pax."],
    ]);
  });
});
