import {
  extractEntryKeyFromLine,
  handleEditorNotes,
  parseComboEntries,
  replaceDash,
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

describe("parseComboEntries", () => {
  it("handles simple entries", () => {
    const rawInput = [
      "/*",
      "<b>revel</b> (<i>subs.</i>): }",
      "<b>revelling</b>:       }",
      "*/",
      "",
      "1. cōmissātio: <i>to",
      "prolong the r.s till",
    ];

    const result = parseComboEntries(rawInput);

    expect(result.keys).toEqual(["revel", "revelling"]);
    expect(result.text).toEqual([
      "<b>revel</b> (<i>subs.</i>):; <b>revelling</b>:",
      "",
      "1. cōmissātio: <i>to",
      "prolong the r.s till",
    ]);
  });

  it("handles entries missing open and close", () => {
    const rawInput = [
      "<b>revel</b> (<i>subs.</i>): }",
      "<b>revelling</b>:       }",
      "",
      "1. cōmissātio: <i>to",
      "prolong the r.s till",
    ];

    const result = parseComboEntries(rawInput);

    expect(result.keys).toEqual(["revel", "revelling"]);
    expect(result.text).toEqual([
      "<b>revel</b> (<i>subs.</i>): ; <b>revelling</b>:",
      "",
      "1. cōmissātio: <i>to",
      "prolong the r.s till",
    ]);
  });

  it("handles entries with dashes", () => {
    const rawInput = [
      "/*",
      "<b>sedge-bird</b>:    }",
      "<b>---- -warbler</b>: }",
      "*/",
      "",
      "*călămŏdȳta phragmītis:",
      "Wood.",
    ];

    const result = parseComboEntries(rawInput);

    expect(result.keys).toEqual(["sedge-bird", "sedge -warbler"]);
    expect(result.text).toEqual([
      "<b>sedge-bird</b>: ; <b>sedge -warbler</b>:",
      "",
      "*călămŏdȳta phragmītis:",
      "Wood.",
    ]);
  });

  it("handles entries with single bracket", () => {
    const rawInput = [
      "/*",
      "<b>shake</b>   }",
      "<b>shaking</b> } <i>subs.</i>:",
      "*/",
      "",
      "1. quassātio:",
      "<i>the s. of their",
    ];

    const result = parseComboEntries(rawInput);

    expect(result.keys).toEqual(["shake", "shaking"]);
    expect(result.text).toEqual([
      "<b>shake</b> ; <b>shaking</b>",
      "<i>subs.</i>:",
      "",
      "1. quassātio:",
      "<i>the s. of their",
    ]);
  });

  it("handles entries with multiple bracket sets", () => {
    const rawInput = [
      "/*",
      "<b>serpentine</b>  } (<i>subs.</i>): { ophītēs, ae, <i>m.</i>",
      "<b>---- -stone</b> }            { (= Gr. ὀφίτης):",
      "*/",
      "",
      "<i>s. like the spots of serpents, and",
      "from this it took its name</i>, o. serpentium",
    ];

    const result = parseComboEntries(rawInput);

    expect(result.keys).toEqual(["serpentine", "serpentine -stone"]);
    expect(result.text).toEqual([
      "<b>serpentine</b> ; <b>serpentine -stone</b>",
      "(<i>subs.</i>):",
      "ophītēs, ae, <i>m.</i>",
      "(= Gr. ὀφίτης):",
      "",
      "<i>s. like the spots of serpents, and",
      "from this it took its name</i>, o. serpentium",
    ]);
  });
});

describe("replaceDash", () => {
  test("simple string case", () => {
    const result = replaceDash("----, make", "acceptable, be");
    expect(result).toBe("acceptable, make");
  });

  /*

----, the being
accessory

----, be
afraid

---- ----, become
acquainted with

---- oneself
acquaint

---- between
be amongst

---- down
burn at the end

----, to be on
fire,, of

---- broker
money-bag

----wort
money-bag

---- in-law
mother

---- as, as
much

---- -bearing
quiver

----
recoil

---- -making
road, to make

----, ragged-
robin

---- leaved
roundhead

----, Italian
rye-grass

---- -keeping
sabbath-breaker

---- -sick, to be
sea-eagle

---- -hand writer
short-hand

---- room
sick, to be

---- -bird
snow-ball-tree

---- -bearing
talebearer

---- -upon
therein

---- -rigger
thimbleful

---- twin-brothers
three-footed

----
under-ground

---- ---- building
under-ground

---- ---- ---- over
victory, to gain a

---- -flood
waterfall

---- -melon
waterman

---- -nymph
woodland

*/
});
