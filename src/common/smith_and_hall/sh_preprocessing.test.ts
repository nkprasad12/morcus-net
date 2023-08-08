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
    expect(result.originalKeys).toEqual(["sedge-bird", "---- -warbler"]);
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

  it("handles entries with no complete keys", () => {
    const rawInput = [
      "/*",
      "<b>---- out</b> }",
      "<b>---- up</b>  }",
      "*/",
      "",
      "1. vello, i, vulsum, 3:",
    ];

    const result = parseComboEntries(rawInput, ["pull off"]);

    expect(result.keys).toEqual(["pull out", "pull up"]);
    expect(result.text).toEqual([
      "/*",
      "<b>pull out</b> }",
      "<b>pull up</b>  }",
      "*/",
      "",
      "1. vello, i, vulsum, 3:",
    ]);
  });
});

describe("replaceDash", () => {
  expect(replaceDash("----, make", "acceptable, be")).toBe("acceptable, make");
  expect(replaceDash("----, the being", "accessory")).toBe(
    "accessory, the being"
  );
  expect(replaceDash("----, be", "afraid")).toBe("afraid, be");
  expect(replaceDash("---- oneself", "acquaint")).toBe("acquaint oneself");
  expect(replaceDash("---- between", "be amongst")).toBe("be between");
  expect(replaceDash("---- down", "burn at the end")).toBe("burn down");
  expect(replaceDash("----, to be on", "fire, of")).toBe("fire, to be on");
  expect(replaceDash("---- broker", "money-bag")).toBe("money broker");
  expect(replaceDash("---- in-law", "mother")).toBe("mother in-law");
  expect(replaceDash("---- as, as", "much")).toBe("much as, as");
  expect(replaceDash("---- -bearing", "quiver")).toBe("quiver-bearing");
  expect(replaceDash("----", "recoil")).toBe("recoil");
  expect(replaceDash("---- -making", "road, to make")).toBe("road-making");
  expect(replaceDash("----, ragged-", "robin")).toBe("robin, ragged-");
  expect(replaceDash("---- leaved", "roundhead")).toBe("round leaved");
  expect(replaceDash("----, Italian", "rye-grass")).toBe("rye, Italian");
  expect(replaceDash("---- -keeping", "sabbath-breaker")).toBe(
    "sabbath -keeping"
  );
  expect(replaceDash("---- -sick, to be", "sea-eagle")).toBe("sea-sick, to be");
  expect(replaceDash("---- -hand writer", "short-hand")).toBe(
    "short-hand writer"
  );
  expect(replaceDash("---- room", "sick, to be")).toBe("sick room");
  expect(replaceDash("---- -bird", "snow-ball-tree")).toBe("snow-bird");
  expect(replaceDash("---- -bearing", "talebearer")).toBe("tale-bearing");
  expect(replaceDash("---- -upon", "therein")).toBe("there-upon");
  expect(replaceDash("---- -rigger", "thimbleful")).toBe("thimble-rigger");
  expect(replaceDash("---- twin-brothers", "three-footed")).toBe(
    "three twin-brothers"
  );
  expect(replaceDash("----", "under-ground")).toBe("under-ground");
  expect(replaceDash("---- -flood", "waterfall")).toBe("water-flood");
  expect(replaceDash("---- -melon", "waterman")).toBe("water-melon");
  expect(replaceDash("---- -nymph", "woodland")).toBe("wood-nymph");

  expect(replaceDash("---- ----, become", "acquainted with")).toBe(
    "acquainted with, become"
  );
  expect(replaceDash("---- ---- building", "under-ground")).toBe(
    "under-ground building"
  );
  expect(replaceDash("---- ---- ---- over", "victory, to gain a")).toBe(
    "victory, to gain over"
  );
});
