import { RawSense } from "@/common/smith_and_hall/sh_entry";
import { processRawSense } from "@/common/smith_and_hall/sh_senses";

describe("processRawSense", () => {
  it("throws on invalid inputs", () => {
    expect(() => processRawSense({ text: "foo" })).toThrowError();
    expect(() => processRawSense({ bullet: "foo" })).toThrowError();
  });

  it("has expected results on regular input", () => {
    const input: RawSense = { text: "f", bullet: "I" };
    const sense = processRawSense(input);
    expect(sense).toStrictEqual({ text: "f", bullet: "I.", level: 2 });
  });

  it("has expected results on U input", () => {
    const input: RawSense = { text: "f", bullet: "U" };
    const sense = processRawSense(input);
    expect(sense).toStrictEqual({ text: "f", bullet: " • ", level: 1 });
  });
});
