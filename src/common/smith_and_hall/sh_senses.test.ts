import { RawSense } from "@/common/smith_and_hall/sh_entry";
import { processRawSense, splitSense } from "@/common/smith_and_hall/sh_senses";

describe("processRawSense", () => {
  it("throws on invalid inputs", () => {
    expect(() => processRawSense({ text: "foo" })).toThrow();
    expect(() => processRawSense({ bullet: "foo" })).toThrow();
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

describe("splitSense", () => {
  it("splits regular cap roman numeral senses", () => {
    expect(splitSense("I. <i>To prevent from")).toEqual({
      bullet: "I",
      text: " <i>To prevent from",
    });

    expect(splitSense("VII. <i>To prevent from")).toEqual({
      bullet: "VII",
      text: " <i>To prevent from",
    });
  });

  it("splits senses with alt splitters", () => {
    expect(splitSense("I, <i>To, prevent from")).toEqual({
      bullet: "I",
      text: " <i>To, prevent from",
    });
  });

  it("splits regular latin number senses", () => {
    expect(splitSense("1. <i>To prevent from")).toEqual({
      bullet: "1",
      text: " <i>To prevent from",
    });
    expect(splitSense("22. <i>To prevent from")).toEqual({
      bullet: "22",
      text: " <i>To prevent from",
    });
  });

  it("splits regular latin cap senses", () => {
    expect(splitSense("A. <i>To prevent from")).toEqual({
      bullet: "A",
      text: " <i>To prevent from",
    });
  });

  it("handles parenthesis sense variants", () => {
    expect(splitSense("(A) <i>To prevent from")).toEqual({
      bullet: "A",
      text: " <i>To prevent from",
    });
    expect(splitSense("(3.) <i>To prevent from")).toEqual({
      bullet: "3",
      text: " <i>To prevent from",
    });
    expect(splitSense("(<i>b.</i>) <i>To prevent from")).toEqual({
      bullet: "b",
      text: " <i>To prevent from",
    });
    expect(splitSense("(<i>b</i>). <i>To prevent from")).toEqual({
      bullet: "b",
      text: " <i>To prevent from",
    });
  });

  it("throws on unhandled senses", () => {
    expect(() => splitSense("A <i>To prevent from")).toThrow();
  });
});
