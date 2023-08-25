import { ShEntry } from "@/common/smith_and_hall/sh_entry";
import { getOutline } from "@/common/smith_and_hall/sh_outline";

describe("getOutline", () => {
  it("pipes through correct data", () => {
    const input: ShEntry = {
      keys: ["Hello", "Hi"],
      blurb: "Greetings",
      senses: [
        { level: 1, bullet: "I.", text: "Formal" },
        { level: 1, bullet: "II.", text: "Informal" },
      ],
    };

    const result = getOutline(input, 57);

    expect(result).toEqual({
      mainKey: "Hello",
      mainSection: {
        level: 0,
        ordinal: "0",
        text: "Greetings",
        sectionId: "sh57",
      },
      senses: [
        { level: 1, ordinal: "I.", text: "Formal", sectionId: "sh57.0" },
        { level: 1, ordinal: "II.", text: "Informal", sectionId: "sh57.1" },
      ],
    });
  });
});
