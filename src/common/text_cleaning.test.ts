import {
  foldLatinLigaturesAndNumerals,
  processWords,
  removeDiacritics,
  removeMacrons,
  stripDiacritics,
  stripEditorialBrackets,
  trimRawQuery,
} from "@/common/text_cleaning";

describe("stripDiacritics", () => {
  it("does not modify text without diacritics", () => {
    const result = stripDiacritics("canaba");
    expect(result.word).toBe("canaba");
    expect(result.diacritics).toBeUndefined();
    expect(result.positions).toBeUndefined();
  });

  it("handles characters with stacked diacritics)", () => {
    const withStackedDiacritics = "hello\u0304\u0306";
    const result = stripDiacritics(withStackedDiacritics);

    expect(result.word).toBe("hello");
    expect(result.diacritics).toStrictEqual(["\u0304", "\u0306"]);
    expect(result.positions).toStrictEqual([4, 4]);
  });

  it("handles pre-composed character followed by combining character", () => {
    const withPrecomposedAndCombining = "hell\u00F5\u0304"; // ṍ (o with tilde and macron)
    const result = stripDiacritics(withPrecomposedAndCombining);

    expect(result.word).toBe("hello");
    expect(result.diacritics).toStrictEqual(["\u0303", "\u0304"]); // tilde and macron
    expect(result.positions).toStrictEqual([4, 4]);
  });

  it("handles indices correctly for diacritic in the middle.", () => {
    const withPrecomposedAndCombining = "hēllō";
    const result = stripDiacritics(withPrecomposedAndCombining);

    expect(result.word).toBe("hello");
    expect(result.diacritics).toStrictEqual(["\u0304", "\u0304"]);
    expect(result.positions).toStrictEqual([1, 4]);
  });
});

describe("removeDiacritics", () => {
  it("does not modify text without diacritics", () => {
    expect(removeDiacritics("canaba")).toBe("canaba");
  });

  it("removes only diacritics if present", () => {
    expect(removeDiacritics("cānaba")).toBe("canaba");
  });

  it("handles weird tilde characters in o", () => {
    const result = removeDiacritics("Ōărĭon").toLowerCase();
    expect(result).toBe("oarion");
  });

  it("handles characters with stacked diacritics (macron + breve)", () => {
    const withStackedDiacritics = "a\u0304\u0306";
    expect(removeDiacritics(withStackedDiacritics)).toBe("a");

    const word = "r" + withStackedDiacritics + "ma";
    expect(removeDiacritics(word)).toBe("rama");
  });
});

describe("removeMacrons", () => {
  it("does not modify text without macrons", () => {
    expect(removeMacrons("canaba")).toBe("canaba");
    expect(removeMacrons("")).toBe("");
  });

  it("removes precomposed macrons and normalizes to NFC", () => {
    expect(removeMacrons("Mūsa")).toBe("Musa");
    expect(removeMacrons("causās")).toBe("causas");
    expect(removeMacrons("hēllō")).toBe("hello");
  });

  it("removes combining macrons (U+0304 and U+0305)", () => {
    expect(removeMacrons("Mu\u0304sa")).toBe("Musa");
    expect(removeMacrons("Mu\u0305sa")).toBe("Musa");
  });

  it("preserves breves and other non-macron diacritics", () => {
    expect(removeMacrons("hăbēna")).toBe("hăbena");
    expect(removeMacrons("cöëunt")).toBe("cöëunt");
    expect(removeMacrons("Ōărĭon")).toBe("Oărĭon");
    expect(removeMacrons("a\u0304\u0306")).toBe("ă");
  });
});

describe("processWords", () => {
  it("splits across punctiation initial word final word", () => {
    expect(processWords("hello darkness. (my) old", (s) => s)).toStrictEqual([
      "hello",
      " ",
      "darkness",
      ". (",
      "my",
      ") ",
      "old",
    ]);
  });

  it("splits words with newlines and tabs", () => {
    expect(processWords("hello\ndarkness\tmy", (s) => s)).toStrictEqual([
      "hello",
      "\n",
      "darkness",
      "\t",
      "my",
    ]);
  });

  it("splits across punctuation initial other final word", () => {
    expect(processWords("[hello darkness. (my) old", (s) => s)).toStrictEqual([
      "[",
      "hello",
      " ",
      "darkness",
      ". (",
      "my",
      ") ",
      "old",
    ]);
  });

  it("splits across punctuation initial word final other", () => {
    expect(processWords("hello darkness. (my) old]", (s) => s)).toStrictEqual([
      "hello",
      " ",
      "darkness",
      ". (",
      "my",
      ") ",
      "old",
      "]",
    ]);
  });

  it("splits across punctuation initial other final other", () => {
    expect(processWords("[hello darkness. (my) old]", (s) => s)).toStrictEqual([
      "[",
      "hello",
      " ",
      "darkness",
      ". (",
      "my",
      ") ",
      "old",
      "]",
    ]);
  });

  it("splits punctuation inside word", () => {
    expect(processWords("h.ell;o darkness", (s) => s)).toStrictEqual([
      "h",
      ".",
      "ell",
      ";",
      "o",
      " ",
      "darkness",
    ]);
  });

  it("keeps intra-word editorial brackets inside words and breaks standalone/multi-word brackets", () => {
    const cases: Array<[input: string, expected: string[]]> = [
      // Case (a): bracket has a word character directly on both sides
      ["obsole[n]tior", ["W(obsole[n]tior)"]],
      ["fu〉ncturae", ["W(fu〉ncturae)"]],
      ["fu\u232ancturae", ["W(fu\u232ancturae)"]],
      ["Infama<n>s", ["W(Infama<n>s)"]],
      // Case (b): closed group with no break characters inside touching a word character on at least one outer side
      ["tacere[m]", ["W(tacere[m])"]],
      ["[s]et", ["W([s]et)"]],
      ["abolito〈que〉", ["W(abolito〈que〉)"]],
      ["abolito\u2329que\u232a", ["W(abolito\u2329que\u232a)"]],
      ["<t>ibi", ["W(<t>ibi)"]],
      ["pr(aetoris)", ["W(pr(aetoris))"]],
      ["⟨T⟩K", ["W(⟨T⟩K)"]],
      // Otherwise it is a break (including adjacent digits/symbols and unclosed parentheses)
      ["<in>", ["<", "W(in)", ">"]],
      ["[dum coquitur]", ["[", "W(dum)", " ", "W(coquitur)", "]"]],
      ["〈poenae", ["〈", "W(poenae)"]],
      ["enim〉", ["W(enim)", "〉"]],
      ["〈", ["〈"]],
      ["(quaeso)", ["(", "W(quaeso)", ")"]],
      ["[certa]1", ["[", "W(certa)", "]", "W(1)"]],
      ["terras(19-23)", ["W(terras)", "(", "W(19-23)", ")"]],
      ["Augustus)1", ["W(Augustus)", ")", "W(1)"]],
      ["cedere)nescia", ["W(cedere)", ")", "W(nescia)"]],
      ["e(iiciens", ["W(e)", "(", "W(iiciens)"]],
      ["e)mo\\s", ["W(e)", ")", "W(mo\\s)"]],
      ["*[et", ["W(*)", "[", "W(et)"]],
      ["*)ενοσίχθονα", ["W(*)", ")", "W(ενοσίχθονα)"]],
    ];

    for (const [input, expected] of cases) {
      expect(processWords(input, (s) => `W(${s})`)).toStrictEqual(expected);
    }
  });

  it("splits on non-ASCII editorial punctuation and Greek elision marks", () => {
    expect(
      processWords("–sīc est– «aliqua» ·X·III … §20 °", (s) => `W(${s})`)
    ).toStrictEqual([
      "–",
      "W(sīc)",
      " ",
      "W(est)",
      "– «",
      "W(aliqua)",
      "» ·",
      "W(X)",
      "·",
      "W(III)",
      " … §",
      "W(20)",
      " °",
    ]);
    expect(
      processWords("παρ᾽ δʼ ʽἡρακλέους γλαῦκ′ ἀπόλλω·", (s) => `W(${s})`)
    ).toStrictEqual([
      "W(παρ)",
      "᾽ ",
      "W(δ)",
      "ʼ ʽ",
      "W(ἡρακλέους)",
      " ",
      "W(γλαῦκ)",
      "′ ",
      "W(ἀπόλλω)",
      "·",
    ]);
  });
});

describe("stripEditorialBrackets", () => {
  it("drops closed [...] deletions with their content and strips remaining bracket characters", () => {
    expect(stripEditorialBrackets("obsole[n]tior")).toBe("obsoletior");
    expect(stripEditorialBrackets("tacere[m]")).toBe("tacere");
    expect(stripEditorialBrackets("[s]et")).toBe("et");
    expect(stripEditorialBrackets("<t>ibi")).toBe("tibi");
    expect(stripEditorialBrackets("abolito〈que〉")).toBe("abolitoque");
    expect(stripEditorialBrackets("abolito\u2329que\u232a")).toBe("abolitoque");
    expect(stripEditorialBrackets("⟨T⟩K")).toBe("TK");
    expect(stripEditorialBrackets("pr(aetoris)")).toBe("praetoris");
    expect(stripEditorialBrackets("K(a)l(endas)")).toBe("Kalendas");
    expect(stripEditorialBrackets("pudor[is")).toBe("pudoris");
    expect(stripEditorialBrackets("ae[s")).toBe("aes");
    expect(stripEditorialBrackets("at]que")).toBe("atque");
    expect(stripEditorialBrackets("conteri[t")).toBe("conterit");
    expect(stripEditorialBrackets("epip]horis")).toBe("epiphoris");
  });
});

describe("foldLatinLigaturesAndNumerals", () => {
  it("folds ligatures, precomposed ligatures with marks, and Roman numeral codepoints and is idempotent", () => {
    expect(foldLatinLigaturesAndNumerals("canaba")).toBe("canaba");
    expect(foldLatinLigaturesAndNumerals("præterierat")).toBe("praeterierat");
    expect(foldLatinLigaturesAndNumerals("Ægyptus")).toBe("Aegyptus");
    expect(foldLatinLigaturesAndNumerals("cœrceas")).toBe("coerceas");
    expect(foldLatinLigaturesAndNumerals("Œdipus")).toBe("Oedipus");
    expect(foldLatinLigaturesAndNumerals("quǽso")).toBe("quae\u0301so");
    expect(foldLatinLigaturesAndNumerals("prǣter")).toBe("prae\u0304ter");
    expect(foldLatinLigaturesAndNumerals("ⅻ")).toBe("xii");
    expect(foldLatinLigaturesAndNumerals("ⅹ\u0305ⅰ\u0305ⅰ\u0305")).toBe(
      "x\u0305i\u0305i\u0305"
    );
    const sample = "quǽso ⅻ præterierat";
    expect(
      foldLatinLigaturesAndNumerals(foldLatinLigaturesAndNumerals(sample))
    ).toBe(foldLatinLigaturesAndNumerals(sample));
  });
});

describe("trimRawQuery", () => {
  it("trims surrounding quotes and brackets", () => {
    expect(trimRawQuery('"habeo"')).toBe("habeo");
    expect(trimRawQuery("'habeo'")).toBe("habeo");
    expect(trimRawQuery("«habeo»")).toBe("habeo");
    expect(trimRawQuery("„habeo“")).toBe("habeo");
    expect(trimRawQuery("[habeo]")).toBe("habeo");
    expect(trimRawQuery("(habeo)")).toBe("habeo");
  });

  it("trims trailing punctuation and whitespace", () => {
    expect(trimRawQuery("habeo,")).toBe("habeo");
    expect(trimRawQuery("habeo.")).toBe("habeo");
    expect(trimRawQuery("habeo;")).toBe("habeo");
    expect(trimRawQuery("habeo! ")).toBe("habeo");
    expect(trimRawQuery("  habeo  ")).toBe("habeo");
    expect(trimRawQuery("...habeo???")).toBe("habeo");
  });

  it("preserves valid macrons and breves within the word", () => {
    expect(trimRawQuery("hăbēna")).toBe("hăbēna");
    expect(trimRawQuery(' "hăbēna," ')).toBe("hăbēna");
    expect(trimRawQuery("causa\u0304s")).toBe("causa\u0304s");
  });

  it("returns empty string when input consists only of punctuation", () => {
    expect(trimRawQuery("")).toBe("");
    expect(trimRawQuery("   ")).toBe("");
    expect(trimRawQuery("...")).toBe("");
    expect(trimRawQuery('"""')).toBe("");
    expect(trimRawQuery("?!,;:()")).toBe("");
  });
});
