import crypto from "crypto";
import fs from "fs";
import path from "path";
import { parseTeiDocument } from "@/common/experimental_texts/tei_parser";
import {
  EXPERIMENTAL_TEXT_DOCUMENT_VERSION,
  type ExperimentalTextBlock,
  type ExperimentalTextDocument,
  type ExperimentalTextSegment,
} from "@/common/experimental_texts/experimental_text_document";

function tei(body: string, header = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader><fileDesc><titleStmt><title>Header Title</title></titleStmt>
    <sourceDesc><biblStruct><monogr><author>Ambrosius</author></monogr></biblStruct></sourceDesc>
    ${header}</fileDesc></teiHeader>
  <text><body><div type="edition" n="urn:cts:latinLit:test.work.opp-lat1">${body}</div></body></text>
</TEI>`;
}

/** Text with section markers shown as `[529A]`. */
function show(segments: ExperimentalTextSegment[]): string {
  return segments
    .map((s) => (s.kind === "text" ? s.text : `[${s.label}]`))
    .join("");
}

function blocks(doc: ExperimentalTextDocument, page = 0): string[] {
  return doc.pages[page].blocks.map((b: ExperimentalTextBlock) =>
    show(b.segments)
  );
}

describe("parseTeiDocument", () => {
  it("reads metadata from the header and edition", () => {
    const doc = parseTeiDocument(
      tei(`<head><title type="main">DE FIDE</title></head><p>Verbum.</p>`)
    );
    expect(doc.title).toBe("DE FIDE");
    expect(doc.author).toBe("Ambrosius");
    expect(doc.urn).toBe("urn:cts:latinLit:test.work.opp-lat1");
  });

  it("paginates by page break, keeping text before the first one", () => {
    const doc = parseTeiDocument(
      tei(
        `<head>Titulus</head><pb n="529"/><p>Primum.</p><pb n="530"/><p>Secundum.</p>`
      )
    );
    expect(doc.pagination).toBe("pageBreaks");
    expect(doc.pages.map((p) => [p.id, p.label])).toEqual([
      ["529", "529"],
      ["530", "530"],
    ]);
    expect(blocks(doc, 0)).toEqual(["Titulus", "Primum."]);
    expect(blocks(doc, 1)).toEqual(["Secundum."]);
  });

  it("labels section letters by column, advancing when letters restart", () => {
    const doc = parseTeiDocument(
      tei(
        `<pb n="529"/><p><milestone unit="PLSection" n="A"/>a <milestone unit="PLSection" n="c"/>b ` +
          `<milestone unit="PLSection" n="A"/>c</p><pb n="531"/><p>d</p>`
      )
    );
    expect(doc.pages[0].label).toBe("529–30");
    expect(blocks(doc, 0)).toEqual(["[529A]a [529C]b [530A]c"]);
  });

  it("never advances columns past the next page break", () => {
    const doc = parseTeiDocument(
      tei(
        `<pb n="10"/><p><milestone unit="PLSection" n="B"/>a <milestone unit="PLSection" n="A"/>b ` +
          `<milestone unit="PLSection" n="D"/>c <milestone unit="PLSection" n="A"/>d</p><pb n="11"/><p>e</p>`
      )
    );
    expect(doc.pages[0].label).toBe("10");
    expect(blocks(doc, 0)).toEqual(["[10B]a [10A]b [10D]c [10A]d"]);
  });

  it("elides shared hundreds digits in multi-column ranges unless crossing a hundred or starting at x00", () => {
    const doc = parseTeiDocument(
      tei(
        `<pb n="1123"/><p><milestone unit="PLSection" n="A"/>a</p><pb n="1125"/><p>b</p>` +
          `<pb n="699"/><p><milestone unit="PLSection" n="A"/>c <milestone unit="PLSection" n="A"/>c2</p><pb n="701"/><p>d</p>` +
          `<pb n="600"/><p><milestone unit="PLSection" n="A"/>e</p><pb n="602"/><p>f</p>` +
          `<pb n="12"/><p><milestone unit="PLSection" n="A"/>g</p><pb n="14"/><p>h</p>`
      )
    );
    expect(doc.pages.map((p) => p.label)).toEqual([
      "1123–24",
      "1125",
      "699–700",
      "701",
      "600–601",
      "602",
      "12–13",
      "14",
    ]);
  });

  it("rejoins words hyphenated across line breaks", () => {
    const doc = parseTeiDocument(
      tei(
        `<pb n="1"/><p>Salomo\u00ad <lb/> nis, Ambro\u00ad<hi rend="italic">sius</hi>, ` +
          `ser- mone, tu quoque, san- <milestone unit="PLSection" n="B"/><lb/> cte imperator</p>`
      )
    );
    expect(blocks(doc)).toEqual([
      "Salomonis, Ambrosius, sermone, tu quoque, [1B]sancte imperator",
    ]);
    const italic = doc.pages[0].blocks[0].segments.find(
      (s) => s.kind === "text" && s.style?.italic
    );
    expect(italic).toMatchObject({ text: "sius" });
  });

  it("rejoins hyphenated words across style changes", () => {
    const doc = parseTeiDocument(
      tei(
        `<pb n="1"/><p><hi rend="italic">formae atque orna-</hi> mentorum, ` +
          `<hi rend="italic">pro-</hi> <hi rend="bold">paginis</hi>, <hi rend="italic">ita-</hi> Roma</p>`
      )
    );
    expect(blocks(doc)).toEqual([
      "formae atque ornamentorum, propaginis, ita- Roma",
    ]);
  });

  it("keeps hyphenated compounds and dashes", () => {
    const doc = parseTeiDocument(
      tei(`<pb n="1"/><p>Graeco-Romanus <lb/> et - <lb/> Alter</p>`)
    );
    expect(blocks(doc)).toEqual(["Graeco-Romanus et - Alter"]);
  });

  it("carries a word split by a page break onto the next page", () => {
    const doc = parseTeiDocument(
      tei(`<pb n="1"/><p>fidem audi- <pb n="2"/><lb/>re voluisti.</p>`)
    );
    expect(blocks(doc, 0)).toEqual(["fidem"]);
    expect(blocks(doc, 1)).toEqual(["audire voluisti."]);
    expect(doc.pages[1].blocks[0].continued).toBe(true);
  });

  it("lifts footnotes out of the flow and rejoins continued notes", () => {
    const doc = parseTeiDocument(
      tei(
        `<pb n="1"/><p>Abraham trecentos <note type="footnote">a Numerus effereba\u00ad </note> ` +
          `<milestone unit="PLSection" n="C"/><note type="footnote">tur literis.</note> duxit.</p>`
      )
    );
    expect(blocks(doc)).toEqual(["Abraham trecentos duxit."]);
    expect(doc.pages[0].notes.map((n) => show(n.segments))).toEqual([
      "a Numerus efferebatur literis.",
    ]);
  });

  it("treats paragraphs printed line by line in capitals as verse", () => {
    const verse = [
      "Quam modicam stillam quanto torrente rependis,",
      "Sancte Deus, licet ipsa hujus vel guttula roris",
      "A te tam sterili data sit vel praestita cordi.",
      "Non his obsequiis tam largum numen egebat,",
      "Et tenuis levibus foliis qui decidit humor",
    ];
    const doc = parseTeiDocument(
      tei(`<pb n="1"/><p>${verse.join(" <lb/> ")}</p>`)
    );
    expect(doc.pages[0].blocks.map((b) => b.kind)).toEqual(
      Array(5).fill("line")
    );
    expect(blocks(doc)).toEqual(verse);
    expect(doc.pages[0].blocks[0].stanzaStart).toBe(true);
  });

  it("keeps prose with line breaks as one paragraph", () => {
    const doc = parseTeiDocument(
      tei(
        `<pb n="1"/><p>Regina Austri venit audire <lb/> sapientiam Salomonis, ut in <lb/> libro Regnorum legimus. Hiram <lb/> quoque rex ad Salomonem <lb/> misit, ut cognosceret eum.</p>`
      )
    );
    expect(blocks(doc)).toEqual([
      "Regina Austri venit audire sapientiam Salomonis, ut in libro Regnorum legimus. Hiram quoque rex ad Salomonem misit, ut cognosceret eum.",
    ]);
  });

  it("moves a word split across verse lines onto one line", () => {
    const doc = parseTeiDocument(
      tei(
        `<pb n="1"/><lg><l>Verba Jeremiae filii Helciae, de sacerdoti-</l><l>bus qui fuerunt in Anathoth,</l></lg>`
      )
    );
    expect(blocks(doc)).toEqual([
      "Verba Jeremiae filii Helciae, de",
      "sacerdotibus qui fuerunt in Anathoth,",
    ]);
  });

  it("styles, languages and heading-only blocks", () => {
    const doc = parseTeiDocument(
      tei(
        `<pb n="1"/><ab><title type="sub">LIBER PRIMUS.</title></ab>` +
          `<p>Ut <hi rend="italic">Reg.</hi> dicit <foreign xml:lang="grc">λόγος</foreign>.</p>`
      )
    );
    const [heading, paragraph] = doc.pages[0].blocks;
    expect(heading.kind).toBe("heading");
    expect(show(heading.segments)).toBe("LIBER PRIMUS.");
    expect(paragraph.segments).toEqual([
      { kind: "text", text: "Ut " },
      { kind: "text", text: "Reg.", style: { italic: true } },
      { kind: "text", text: " dicit " },
      { kind: "text", text: "λόγος", lang: "grc" },
      { kind: "text", text: "." },
    ]);
  });

  it("chunks documents without page breaks", () => {
    const paragraphs = Array.from(
      { length: 6 },
      (_, i) => `<p>Paragraphus ${"verbum ".repeat(20)}${i}.</p>`
    ).join("");
    const doc = parseTeiDocument(tei(paragraphs), { chunkChars: 300 });
    expect(doc.pagination).toBe("chunks");
    expect(doc.pages.map((p) => p.label)).toEqual([
      "Part 1",
      "Part 2",
      "Part 3",
    ]);
    expect(doc.pages.flatMap((p) => p.blocks)).toHaveLength(6);
  });

  it("de-duplicates repeated page numbers", () => {
    const doc = parseTeiDocument(
      tei(`<pb n="5"/><p>a</p><pb n="5"/><p>b</p><pb n="-"/><p>c</p>`)
    );
    expect(doc.pages.map((p) => [p.id, p.label])).toEqual([
      ["5", "5"],
      ["5-2", "5"],
      ["_", "[-]"],
    ]);
  });

  it("warns about elements it doesn't know, but keeps their text", () => {
    const doc = parseTeiDocument(
      tei(`<pb n="1"/><p>a <mystery>b</mystery> c</p>`)
    );
    expect(blocks(doc)).toEqual(["a b c"]);
    expect(doc.warnings).toEqual(["Unhandled element <mystery> (1×)"]);
  });

  it("only treats <milestone unit='PLSection'> as a Migne column letter", () => {
    const doc = parseTeiDocument(
      tei(
        `<pb n="529"/><p><milestone unit="PLSection" n="D"/>a ` +
          `<milestone unit="section" n="A"/>b</p><pb n="531"/><p>c</p>`
      )
    );
    expect(doc.pages[0].label).toBe("529–30");
    expect(blocks(doc, 0)).toEqual(["[529D]a [A]b"]);
  });

  it("salvages text and records a warning instead of throwing on malformed XML", () => {
    const malformed = `<TEI><teiHeader><title>Broken Work</title><author>Ambrosius</author></teiHeader><text><body><p>Salve mundi<unclosed></body>`;
    const doc = parseTeiDocument(malformed);
    expect(doc.title).toBe("Broken Work");
    expect(doc.author).toBe("Ambrosius");
    expect(blocks(doc, 0)).toEqual(["Salve mundi"]);
    expect(doc.warnings[0]).toMatch(/^Malformed XML:/);

    const multiRoot = `<p>Prima pars.</p><p>Secunda pars.</p>`;
    const doc2 = parseTeiDocument(multiRoot);
    expect(blocks(doc2, 0)).toEqual(["Prima pars.", "Secunda pars."]);
    expect(doc2.warnings[0]).toMatch(/^Malformed XML:/);
  });

  it("matches the golden hash for EXPERIMENTAL_TEXT_DOCUMENT_VERSION on sample_pl.xml", () => {
    const sampleXml = fs.readFileSync(
      path.join(__dirname, "testdata/sample_pl.xml"),
      "utf8"
    );
    const parsed = parseTeiDocument(sampleXml);
    const actualHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(parsed))
      .digest("hex");
    const expectedByVersion: Readonly<Record<number, string>> = {
      1: "93c660d075036f6adbd0f7871513f38ccef10a44533296d948ea048c46123f22",
    };
    const expectedHash = expectedByVersion[EXPERIMENTAL_TEXT_DOCUMENT_VERSION];
    if (actualHash !== expectedHash) {
      throw new Error(
        `parser output changed: bump EXPERIMENTAL_TEXT_DOCUMENT_VERSION and add the new hash (expected ${String(
          expectedHash
        )}, got ${actualHash})`
      );
    }
  });
});
