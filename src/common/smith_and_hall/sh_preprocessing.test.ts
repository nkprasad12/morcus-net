import {
  extractEntryKeyFromLine,
  handleEditorNotes,
} from "@/common/smith_and_hall/sh_preprocessing";

describe("handleEditorNotes", () => {
  test("leaves regular lines unchanged", () => {
    const input = "lit. <i>a horn</i>): <i>to discharge arrows from";
    expect(handleEditorNotes(input)).toBe(input);
  });

  test("substitutes for one character with space", () => {
    const input = "Virg.[** :] Ov. Prov.: <i>to have two";
    const expected = "Virg.: Ov. Prov.: <i>to have two";
    expect(handleEditorNotes(input)).toBe(expected);
  });

  test("substitutes for one character only", () => {
    const input = "Virg.[**:] Ov. Prov.: <i>to have two";
    const expected = "Virg.: Ov. Prov.: <i>to have two";
    expect(handleEditorNotes(input)).toBe(expected);
  });

  test("substitutes in dash edge case", () => {
    const input = "[** ----] Ov. Prov.: <i>to have two";
    const expected = "---- Ov. Prov.: <i>to have two";
    expect(handleEditorNotes(input)).toBe(expected);
  });

  test("removes no character notes", () => {
    const input = "remissus,[**] Hor. Phr.: <i>a manufactory";
    const expected = "remissus, Hor. Phr.: <i>a manufactory";
    expect(handleEditorNotes(input)).toBe(expected);
  });

  test("removes multi-character notes", () => {
    const input =
      "remissus,[**P2: ,|P3 fixed, clear on TIA] Hor. Phr.: <i>a manufactory";
    const expected = "remissus, Hor. Phr.: <i>a manufactory";
    expect(handleEditorNotes(input)).toBe(expected);
  });

  test("inserts flagged missing chars", () => {
    const input =
      "<b>picture-frame</b>[**P1: missing :] forma: v. <f>FRAME</f>";
    const expected = "<b>picture-frame</b>: forma: v. <f>FRAME</f>";
    expect(handleEditorNotes(input)).toBe(expected);
  });

  test("replaces possible missing : from .", () => {
    const input = "<b>aneurismal</b>,[**P2: : ?] ăneurismătĭcus: M.L.";
    const expected = "<b>aneurismal</b>: ăneurismătĭcus: M.L.";
    expect(handleEditorNotes(input)).toBe(expected);
  });

  test("replaces possible missing : from ,", () => {
    const input = "<b>anew</b>.[**P2: : ?]";
    const expected = "<b>anew</b>:";
    expect(handleEditorNotes(input)).toBe(expected);
  });
});

describe("extractEntryKeyFromLine", () => {
  test("handles single word chunks", () => {
    const input = `<b>surety</b>:`;
    const expected = "surety";
    expect(extractEntryKeyFromLine(input)).toEqual([expected]);
  });

  test("handles multiword chunks", () => {
    const input = `<b>swim across</b>:`;
    const expected = "swim across";
    expect(extractEntryKeyFromLine(input)).toEqual([expected]);
  });

  test("handles v. words", () => {
    const input = `<b>thumb</b> (<i>v.</i>): *pollice versare (cf.`;
    const expected = "thumb";
    expect(extractEntryKeyFromLine(input)).toEqual([expected]);
  });

  test("handles subst. words", () => {
    const input = `<b>wax</b> (<i>subs.</i>): cēra: <i>we shape and`;
    const expected = "wax";
    expect(extractEntryKeyFromLine(input)).toEqual([expected]);
  });

  test("handles v. rare words", () => {
    const input = `<b>short-hand</b> (v. rare): nŏtae, arum`;
    const expected = "short-hand";
    expect(extractEntryKeyFromLine(input)).toEqual([expected]);
  });

  test("handles parenthical extras", () => {
    const input = `<b>bencher</b> (of an Inn of law): *advocatus`;
    const expected = "bencher";
    expect(extractEntryKeyFromLine(input)).toEqual([expected]);
  });

  test("handles parenthical extras with tags", () => {
    const input = `<b>bring before</b> (<i>call attention to</i>):`;
    const expected = "bring before";
    expect(extractEntryKeyFromLine(input)).toEqual([expected]);
  });

  test("handles replacement of alternate division", () => {
    const input = `<b>baptizer</b>, qui baptizat.`;
    const expected = "baptizer";
    expect(extractEntryKeyFromLine(input)).toEqual([expected]);
  });

  test("handles replacement of alternate division with parenthetical", () => {
    const input = `<b>arrest</b> (<i>v.</i>).`;
    const expected = "arrest";
    expect(extractEntryKeyFromLine(input)).toEqual([expected]);
  });

  test("handles parenthical extras with tags", () => {
    const input = `<b>bring before</b> (<i>call attention to</i>):`;
    const expected = "bring before";
    expect(extractEntryKeyFromLine(input)).toEqual([expected]);
  });

  test("handles cases with dashes", () => {
    const input = "<b>----, make</b>, prŏbo, 1 (with";
    const expected = "----, make";
    expect(extractEntryKeyFromLine(input)).toEqual([expected]);
  });

  test("handles multiple words before colon", () => {
    const input = `<b>vine-fretter</b> or <b>grub</b>: convolvŭlus`;
    const expected = ["vine-fretter", "grub"];
    expect(extractEntryKeyFromLine(input)).toEqual(expected);
  });

  test("handles multiple words without colon", () => {
    const input =
      "<b>villanous</b>,, <b>villanously</b>, <b>villanousness</b>,,";
    const expected = ["villanous", "villanously", "villanousness"];
    expect(extractEntryKeyFromLine(input)).toEqual(expected);
  });
});
