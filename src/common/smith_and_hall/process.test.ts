import { handleEditorNotes } from "@/common/smith_and_hall/process";

describe("handleEditorNotes", () => {
  test("handleEditorNotes leaves regular lines unchanged", () => {
    const input = "lit. <i>a horn</i>): <i>to discharge arrows from";
    expect(handleEditorNotes(input)).toBe(input);
  });

  test("handleEditorNotes substitutes for one character with space", () => {
    const input = "Virg.[** :] Ov. Prov.: <i>to have two";
    const expected = "Virg.: Ov. Prov.: <i>to have two";
    expect(handleEditorNotes(input)).toBe(expected);
  });

  test("handleEditorNotes substitutes for one character only", () => {
    const input = "Virg.[**:] Ov. Prov.: <i>to have two";
    const expected = "Virg.: Ov. Prov.: <i>to have two";
    expect(handleEditorNotes(input)).toBe(expected);
  });

  test("handleEditorNotes substitutes in dash edge case", () => {
    const input = "[** ----] Ov. Prov.: <i>to have two";
    const expected = "---- Ov. Prov.: <i>to have two";
    expect(handleEditorNotes(input)).toBe(expected);
  });

  test("handleEditorNotes removes no character notes", () => {
    const input = "remissus,[**] Hor. Phr.: <i>a manufactory";
    const expected = "remissus, Hor. Phr.: <i>a manufactory";
    expect(handleEditorNotes(input)).toBe(expected);
  });

  test("handleEditorNotes removes multi-character notes", () => {
    const input =
      "remissus,[**P2: ,|P3 fixed, clear on TIA] Hor. Phr.: <i>a manufactory";
    const expected = "remissus, Hor. Phr.: <i>a manufactory";
    expect(handleEditorNotes(input)).toBe(expected);
  });
});
