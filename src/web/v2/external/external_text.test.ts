/**
 * @jest-environment jsdom
 */
import { tokenizeTargets } from "@/web/v2/core/tokenize.client";
import {
  DEFAULT_LINE_MODE,
  MAX_EXTERNAL_TEXT_CHARS,
  UNTITLED_TEXT,
  deriveExternalTitle,
  hasMacra,
  normalizeExternalText,
  parseExternalText,
  parseLineMode,
  reflowProseLines,
  renderExternalPassageHtml,
  resolveExternalTitle,
} from "@/web/v2/external/external_text.common";

describe("normalizeExternalText", () => {
  test("canonicalizes line endings", () => {
    expect(normalizeExternalText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  test("collapses runs of blank lines and trims blank edges", () => {
    expect(normalizeExternalText("\n\n a\n\n\n\nb\n\n")).toBe(" a\n\nb");
  });

  test("treats whitespace-only lines as blank", () => {
    expect(normalizeExternalText("a\n   \t\nb")).toBe("a\n\nb");
  });

  test("strips trailing but keeps leading whitespace (verse indent)", () => {
    expect(normalizeExternalText("  indented   ")).toBe("  indented");
  });

  test("removes soft hyphens and zero-width characters", () => {
    expect(normalizeExternalText("ali\u00ADquid\u200B \uFEFFest")).toBe(
      "aliquid est"
    );
  });

  test("turns tabs and NBSP into spaces", () => {
    expect(normalizeExternalText("a\tb\u00A0c")).toBe("a b c");
  });

  test("NFC-normalizes, so combining and precomposed macra agree", () => {
    expect(normalizeExternalText("a\u0304")).toBe("\u0101");
  });
});

describe("parseLineMode", () => {
  test.each(["keep", "prose", "verse"])("accepts %s", (mode) => {
    expect(parseLineMode(mode)).toBe(mode);
  });

  test.each([undefined, null, "", "VERSE", "poetry", 3])(
    "falls back to the default for %p",
    (raw) => {
      expect(parseLineMode(raw)).toBe(DEFAULT_LINE_MODE);
    }
  );

  test("defaults to keep, matching V1", () => {
    expect(DEFAULT_LINE_MODE).toBe("keep");
  });
});

describe("reflowProseLines", () => {
  test("joins wrapped lines with spaces", () => {
    expect(reflowProseLines(["Gallia est omnis", "divisa in partes"])).toBe(
      "Gallia est omnis divisa in partes"
    );
  });

  test("rejoins a word hyphenated across a line break", () => {
    expect(reflowProseLines(["quarum unam ali-", "quid incolunt"])).toBe(
      "quarum unam aliquid incolunt"
    );
  });

  test("rejoins across macra", () => {
    expect(reflowProseLines(["pōpu-", "lus"])).toBe("pōpulus");
  });

  test("keeps a hyphen before a capitalized line", () => {
    expect(reflowProseLines(["Graeco-", "Romanus"])).toBe("Graeco- Romanus");
  });

  test("keeps a free-standing dash", () => {
    expect(reflowProseLines(["inquit -", "et abiit"])).toBe(
      "inquit - et abiit"
    );
  });
});

describe("parseExternalText", () => {
  const SOURCE = [
    "Arma virumque cano, Troiae qui primus ab oris",
    "Italiam fato profugus Laviniaque venit",
    "",
    "Musa, mihi causas memora,",
    "  quo numine laeso",
  ].join("\n");

  test("keep: one section per paragraph, lines preserved", () => {
    const doc = parseExternalText(SOURCE, "keep");
    expect(doc.sections).toEqual([
      {
        id: "1",
        lines: [
          "Arma virumque cano, Troiae qui primus ab oris",
          "Italiam fato profugus Laviniaque venit",
        ],
      },
      { id: "2", lines: ["Musa, mihi causas memora,", "quo numine laeso"] },
    ]);
  });

  test("prose: one reflowed line per paragraph", () => {
    const doc = parseExternalText(SOURCE, "prose");
    expect(doc.sections.map((s) => s.lines)).toEqual([
      [
        "Arma virumque cano, Troiae qui primus ab oris Italiam fato profugus Laviniaque venit",
      ],
      ["Musa, mihi causas memora, quo numine laeso"],
    ]);
  });

  test("verse: one section per line, numbered continuously, with stanza and indent marks", () => {
    const doc = parseExternalText(SOURCE, "verse");
    expect(doc.sections).toEqual([
      { id: "1", lines: ["Arma virumque cano, Troiae qui primus ab oris"] },
      { id: "2", lines: ["Italiam fato profugus Laviniaque venit"] },
      { id: "3", lines: ["Musa, mihi causas memora,"], stanzaStart: true },
      { id: "4", lines: ["quo numine laeso"], indent: true },
    ]);
  });

  test("defaults to keep", () => {
    expect(parseExternalText(SOURCE).mode).toBe("keep");
  });

  test("empty and whitespace-only input yields no sections", () => {
    expect(parseExternalText("").sections).toEqual([]);
    expect(parseExternalText(" \n\n \t ").sections).toEqual([]);
  });

  test("detects macra", () => {
    expect(parseExternalText("Arma virumque canō").hasMacra).toBe(true);
    expect(parseExternalText("Arma virumque cano").hasMacra).toBe(false);
  });

  test("truncates at the last line break before the cap", () => {
    const line = "x".repeat(99);
    const raw = Array(3000).fill(line).join("\n");
    const doc = parseExternalText(raw, "keep");
    expect(doc.truncated).toBe(true);
    const kept = doc.sections[0].lines;
    expect(kept.every((l) => l === line)).toBe(true);
    expect(kept.join("\n").length).toBeLessThanOrEqual(MAX_EXTERNAL_TEXT_CHARS);
  });

  test("does not flag short input as truncated", () => {
    expect(parseExternalText("brevis").truncated).toBe(false);
  });
});

describe("hasMacra", () => {
  test.each(["ā", "Ē", "ī", "Ō", "ū", "ȳ", "a\u0304"])("detects %s", (s) => {
    expect(hasMacra(s)).toBe(true);
  });

  test("ignores other diacritics", () => {
    expect(hasMacra("pêdô ăĭ é")).toBe(false);
  });
});

describe("titles", () => {
  test("uses the first six words with an ellipsis", () => {
    expect(
      deriveExternalTitle("Gallia est omnis divisa in partes tres, quarum")
    ).toBe("Gallia est omnis divisa in partes…");
  });

  test("has no ellipsis when the text is short", () => {
    expect(deriveExternalTitle("Arma virumque cano")).toBe(
      "Arma virumque cano"
    );
  });

  test("skips punctuation and leading blank lines", () => {
    expect(deriveExternalTitle("\n\n  — Quo usque tandem?")).toBe(
      "Quo usque tandem"
    );
  });

  test("reads across line breaks", () => {
    expect(deriveExternalTitle("Arma\nvirumque")).toBe("Arma virumque");
  });

  test("caps very long words", () => {
    const title = deriveExternalTitle("x".repeat(200));
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith("…")).toBe(true);
  });

  test("falls back when there are no words", () => {
    expect(deriveExternalTitle("  ... !!! ")).toBe(UNTITLED_TEXT);
  });

  test("resolveExternalTitle prefers a non-blank user title", () => {
    expect(resolveExternalTitle("  Cicero  ", "Quo usque")).toBe("Cicero");
    expect(resolveExternalTitle("   ", "Quo usque")).toBe("Quo usque");
    expect(resolveExternalTitle(undefined, "Quo usque")).toBe("Quo usque");
  });
});

describe("renderExternalPassageHtml", () => {
  function render(raw: string, mode: "keep" | "prose" | "verse") {
    const container = document.createElement("article");
    container.id = "reader-passage";
    container.innerHTML = renderExternalPassageHtml(
      parseExternalText(raw, mode)
    );
    return container;
  }

  test("emits the library section shape the reader expects", () => {
    const passage = render("Gallia est omnis divisa", "keep");
    const section = passage.querySelector(".reader-section#sec-1");
    expect(section).not.toBeNull();
    const anchor = section!.querySelector(
      ".reader-gutter > a.section-anchor[href='#sec-1']"
    );
    expect(anchor?.querySelector(".cite-local")?.textContent).toBe("1");
    const target = section!.querySelector(
      ".reader-passage[data-tokenize-target='true'] > p.reader-paragraph"
    );
    expect(target?.textContent).toBe("Gallia est omnis divisa");
  });

  test("keep: lines are separated by <br> inside one paragraph", () => {
    const p = render("prima\nsecunda", "keep").querySelector("p")!;
    expect(p.innerHTML).toBe("prima<br>secunda");
  });

  test("verse: sections are verse lines with library-style latent labels", () => {
    const lines = Array.from({ length: 6 }, (_, i) => `versus ${i + 1}`);
    const passage = render(lines.join("\n"), "verse");
    const sections = passage.querySelectorAll(".reader-section.section-verse");
    expect(sections).toHaveLength(6);
    expect(passage.querySelectorAll(".reader-line")).toHaveLength(6);
    const latent = Array.from(
      passage.querySelectorAll("a.section-anchor"),
      (a) => a.classList.contains("latent")
    );
    // Lines 1 and 5 are labelled; the rest reveal on hover, as in the library.
    expect(latent).toEqual([false, true, true, true, false, true]);
  });

  test("verse: stanza breaks and indents reuse existing rendition classes", () => {
    const passage = render("unus\n\n  duo", "verse");
    const second = passage.querySelector("#sec-2 .reader-passage")!;
    expect(second.querySelector(".line-space")).not.toBeNull();
    expect(second.querySelector(".reader-line.indent")?.textContent).toBe(
      "duo"
    );
  });

  test("escapes user text", () => {
    const payload = `<img src=x onerror="alert(1)"> & "quotes"`;
    const passage = render(payload, "keep");
    expect(passage.querySelector("img")).toBeNull();
    expect(passage.querySelector("p")?.textContent).toBe(payload);
  });

  test("renders nothing for empty input", () => {
    expect(renderExternalPassageHtml(parseExternalText(""))).toBe("");
  });

  test("is deterministic, so server and client output match", () => {
    const doc = parseExternalText("a\nb\n\nc", "verse");
    expect(renderExternalPassageHtml(doc)).toBe(renderExternalPassageHtml(doc));
  });

  test("tokenizes like a library passage, with per-section word indices", () => {
    // `matchText=id~start~end` counts words from 0 within each section, so
    // each section's passage must be its own tokenize target.
    const passage = render("Gallia est omnis\ndivisa\n\nquarum unam", "keep");
    tokenizeTargets(passage, {
      renderWord: (token, _clean, index) => {
        const span = document.createElement("span");
        span.className = "lat-word";
        span.dataset.index = String(index);
        span.textContent = token;
        return span;
      },
    });
    const words = (sec: string) =>
      Array.from(
        passage.querySelectorAll<HTMLElement>(`#sec-${sec} .lat-word`),
        (w) => `${w.dataset.index}:${w.textContent}`
      );
    expect(words("1")).toEqual(["0:Gallia", "1:est", "2:omnis", "3:divisa"]);
    expect(words("2")).toEqual(["0:quarum", "1:unam"]);
    // Gutter labels are links, which the tokenizer skips.
    expect(passage.querySelector(".reader-gutter .lat-word")).toBeNull();
  });
});
