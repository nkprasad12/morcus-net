import { parse } from "parse5";

import {
  createParse5BodyParser,
  extractText,
  parseHtmlToMinimalBody,
  type MinimalElementNode,
  type PageBlockKind,
} from "@/common/thelatinlibrary";
import {
  detectBlockMarkers,
  parseLatinOrdinal,
  parseRoman,
  toRoman,
} from "@/common/thelatinlibrary/markers";

const parser = createParse5BodyParser(parse);

/** The first element child of `<body>` for an HTML fragment. */
function el(html: string): MinimalElementNode {
  const { body } = parseHtmlToMinimalBody(html, parser);
  return body.childNodes.find((n): n is MinimalElementNode => "tagName" in n)!;
}

function detect(html: string, kind: PageBlockKind = "paragraph") {
  const e = el(html);
  return detectBlockMarkers(e, extractText(e), kind);
}

describe("roman numerals and ordinals", () => {
  it("round-trips canonical numerals, accepts additive forms, and rejects invalid input", () => {
    for (const n of [1, 4, 9, 14, 40, 44, 49, 99, 444, 1999]) {
      expect(parseRoman(toRoman(n))).toBe(n);
    }
    expect(parseRoman("IIII")).toBe(4);
    expect(parseRoman("XIVL")).toBeUndefined();
    expect(parseRoman("Lysander")).toBeUndefined();
    expect(parseRoman("")).toBeUndefined();
  });

  it("parses Latin ordinals in either spelling", () => {
    expect(parseLatinOrdinal("PRIMVS")).toBe(1);
    expect(parseLatinOrdinal("Secundus")).toBe(2);
    expect(parseLatinOrdinal("TERTIVS  DECIMVS")).toBe(13);
    expect(parseLatinOrdinal("VICENSIMVS")).toBe(20);
    expect(parseLatinOrdinal("liber")).toBeUndefined();
  });
});

describe("detectBlockMarkers", () => {
  it("finds bracketed numbers anywhere, with normalized values", () => {
    const { markers } = detect(
      `<p>[1] Sentio, iudices [2] quod [1,1] et [IV] atque [pr.] et [12a] fin.</p>`
    );
    expect(markers.map((m) => [m.kind, m.raw, m.value, m.offset])).toEqual([
      ["bracketed_number", "[1]", "1", 0],
      ["bracketed_number", "[2]", "2", 20],
      ["bracketed_number", "[1,1]", "1.1", 29],
      ["bracketed_number", "[IV]", "4", 38],
      ["bracketed_number", "[pr.]", "pr", 49],
      ["bracketed_number", "[12a]", "12a", 58],
    ]);
  });

  it("leaves editorial brackets and words alone", () => {
    expect(
      detect(`<p>Iuri operam [de ea re] daturum [et] esse [c].</p>`).markers
    ).toEqual([]);
  });

  it("marks an anchored bracketed chapter number", () => {
    const { markers, anchors } = detect(
      `<p>[<a name="1">1</a>] <font size=2>1</font> Gallia est omnis divisa.</p>`
    );
    expect(anchors).toEqual(["1"]);
    expect(markers).toEqual([
      {
        kind: "bracketed_number",
        raw: "[1]",
        value: "1",
        offset: 0,
        anchored: true,
      },
    ]);
  });

  it("emits mid-paragraph anchors as anchor markers at their offsets", () => {
    const html = `<p>[I. De iure civili.] <a name="1">1.</a> Omnes populi. <a name="2">2.</a> Constant autem.<a name="top"></a></p>`;
    const e = el(html);
    const text = extractText(e);
    const { markers, anchors } = detectBlockMarkers(e, text, "paragraph");
    expect(anchors).toEqual(["1", "2", "top"]);
    expect(markers.map((m) => [m.kind, m.raw, m.value])).toEqual([
      ["gaius_rubric", "[I. De iure civili.]", "1"],
      ["anchor", "1.", "1"],
      ["anchor", "2.", "2"],
    ]);
    for (const m of markers) {
      expect(text.slice(m.offset, m.offset + m.raw.length)).toBe(m.raw);
    }
  });

  it("computes anchor offsets for line-preserving text too", () => {
    const e = el(
      `<p>Arma virumque cano,<br>\n<a name="2">2</a> Troiae qui primus</p>`
    );
    const text = extractText(e, { preserveLineBreaks: true });
    expect(text).toBe("Arma virumque cano,\n2 Troiae qui primus");
    const { markers } = detectBlockMarkers(e, text, "verse");
    expect(markers).toEqual([
      { kind: "anchor", raw: "2", value: "2", offset: 20 },
    ]);
  });

  it("anchors a leading bare number", () => {
    const { markers } = detect(
      `<p><a name="1">1.</a> Omnes populi qui legibus.</p>`
    );
    expect(markers).toEqual([
      { kind: "bare_number", raw: "1.", value: "1", offset: 0, anchored: true },
    ]);
  });

  it("finds leading bare and parenthesized numbers", () => {
    expect(detect(`<p>(3) Text.</p>`).markers[0]).toMatchObject({
      kind: "bare_number",
      value: "3",
    });
    expect(detect(`<p>141 Item text.</p>`).markers[0]).toMatchObject({
      kind: "bare_number",
      raw: "141",
      value: "141",
    });
    expect(detect(`<p>Text 141 later.</p>`).markers).toEqual([]);
  });

  it("finds LIBER headings and Roman chapter headings", () => {
    expect(
      detect(`<div align="center">LIBER XI</div>`, "heading").markers
    ).toEqual([
      { kind: "liber_heading", raw: "LIBER XI", value: "11", offset: 0 },
    ]);
    expect(
      detect(`<div align="center">LIBER PRIMVS</div>`, "heading").markers[0]
    ).toMatchObject({ kind: "liber_heading", value: "1" });
    expect(detect(`<h3>XIV.</h3>`, "heading").markers[0]).toMatchObject({
      kind: "roman_heading",
      value: "14",
    });
    expect(detect(`<h3>CAPVT III</h3>`, "heading").markers[0]).toMatchObject({
      kind: "roman_heading",
      value: "3",
    });
    // A paragraph opening with a chapter numeral (Justin).
    expect(detect(`<p>II. Post hunc Ninus.</p>`).markers[0]).toMatchObject({
      kind: "roman_heading",
      raw: "II.",
      value: "2",
    });
  });

  it("does not take praenomina or prose 'liber' for markers", () => {
    expect(detect(`<p>C. Valerius Procillus fugit.</p>`).markers).toEqual([]);
    expect(detect(`<p>M. Tullius Cicero.</p>`).markers).toEqual([]);
    expect(
      detect(
        `<p>Homo liber I fuit, qui per totam vitam multa scripsit et dixit.</p>`
      ).markers
    ).toEqual([]);
  });

  it("finds Trogus prologue headings", () => {
    expect(detect(`<p>PROLOGVS LIBRI XII.</p>`).markers[0]).toMatchObject({
      kind: "prologus",
      value: "12",
    });
  });

  it("finds Digest citations", () => {
    const toc = detect(
      `<p>Dig. 1.1.0. De iustitia et iure. <br> Dig. 1.2.0. De origine iuris.</p>`
    ).markers;
    expect(toc.map((m) => [m.kind, m.value])).toEqual([
      ["digest_citation", "1.1.0"],
      ["digest_citation", "1.2.0"],
    ]);
    expect(detect(`<p>Dig. 1.1.1pr.</p>`).markers).toEqual([
      {
        kind: "digest_citation",
        raw: "Dig. 1.1.1pr.",
        value: "1.1.1pr",
        offset: 0,
      },
    ]);
    expect(detect(`<p>Dig. 30.79.1</p>`).markers[0].value).toBe("30.79.1");
    expect(detect(`<p>Dig. 2.14.6a</p>`).markers[0].value).toBe("2.14.6a");
    expect(
      detect(`<p>Dig. 1.2.0.R rubrica: De origine</p>`).markers[0]
    ).toMatchObject({
      value: "1.2.0",
    });
    expect(detect(`<p>3.2.1pr. Text</p>`).markers[0]).toMatchObject({
      kind: "digest_citation",
      value: "3.2.1pr",
    });
    expect(detect(`<p>3.2 Text</p>`).markers[0]).toMatchObject({
      kind: "bare_number",
      value: "3.2",
    });
  });

  it("never throws on odd input", () => {
    const e = el(`<p></p>`);
    expect(detectBlockMarkers(e, "", "paragraph")).toEqual({
      markers: [],
      anchors: [],
    });
    // Text not produced by extractText: anchors are located by search.
    const a = el(`<p>x <a name="5">5</a> y</p>`);
    expect(detectBlockMarkers(a, "zz 5 y", "paragraph").markers).toEqual([
      { kind: "anchor", raw: "5", value: "5", offset: 3 },
    ]);
  });
});
