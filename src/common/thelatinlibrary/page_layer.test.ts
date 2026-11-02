import { parse } from "parse5";

import {
  createParse5BodyParser,
  extractLenientPage,
  extractText,
  getAttr,
  SYNTHETIC_PARAGRAPH_ATTR,
  type LenientPageContent,
} from "@/common/thelatinlibrary";

const parser = createParse5BodyParser(parse);
const read = (html: string, preserveLineBreaks = false) =>
  extractLenientPage(html, { parser, preserveLineBreaks });
const paragraphTexts = (page: LenientPageContent) =>
  page.paragraphs.map((p) => extractText(p));

describe("extractLenientPage: standard layouts", () => {
  it("drops navigation, footers and spacers and keeps headings", () => {
    const page = read(`<html><body>
      <h1>OPVS</h1>
      <p class="internal_navigation"><a href="#1">1</a></p>
      <p class=border></P>
      <p><div align="center">LIBER I</div></p>
      <p>Textus.</p>
      <p><TABLE><TR><TD><a href="/">The Latin Library</a></TABLE></p>
      <div class="footer"><p>The Latin Library</p></div>
      </body></html>`);
    expect(page.pageTitle).toBe("OPVS");
    expect(page.nav).toEqual(["1"]);
    expect(page.headings).toEqual(["LIBER I"]);
    expect(paragraphTexts(page)).toEqual(["Textus."]);
    expect(page.blocks.map((b) => [b.kind, b.text])).toEqual([
      ["heading", "LIBER I"],
      ["paragraph", "Textus."],
    ]);
    expect(page.blocks[0].markers[0]).toMatchObject({
      kind: "liber_heading",
      value: "1",
    });
    expect(page.footerText).toBe("The Latin Library\nThe Latin Library");
    expect(page.warnings).toEqual(["More than one footer block."]);
    // One entry per element child of <body>, empty ones too.
    expect(page.bodyText).toBe(
      "OPVS\n1\n\n\nLIBER I\n\nTextus.\nThe Latin Library\nThe Latin Library"
    );
  });

  it("recognises a link list by its content, whatever its class", () => {
    const page = read(`<html><body>
      <p class=pagehead>OPVS</p>
      <p class=margin><a href="#1">1</A>&nbsp; <a href="#2">2</A>&nbsp;</p>
      <p><a name="1">1.</a> Textus.</p>
      <div class="footer">The Latin Library</div>
      </body></html>`);
    expect(page.pageTitle).toBe("OPVS");
    expect(page.nav).toEqual(["1", "2"]);
    expect(paragraphTexts(page)).toEqual(["1. Textus."]);
    expect(page.blocks[0].anchors).toEqual(["1"]);
    expect(page.blocks[0].markers[0]).toMatchObject({
      kind: "bare_number",
      anchored: true,
    });
  });

  it("does not take back-to-top letter headings for navigation", () => {
    const page = read(`<html><body><h1>Fronto</h1>
      <p><a href="#top" name="ep_6"><u>ad Anton. Pium 6</u></a></p>
      <p>Textus.</p>
      <div class="footer">The Latin Library</div></body></html>`);
    expect(page.nav).toBeUndefined();
    expect(paragraphTexts(page)).toEqual(["ad Anton. Pium 6", "Textus."]);
  });
});

describe("extractLenientPage: lenient layouts", () => {
  it("keeps a table inside a paragraph that isn't the footer", () => {
    const page = read(
      `<html><body><p><TABLE><TR><TD>Tabula</TABLE></p></body></html>`
    );
    expect(page.blocks.map((b) => [b.kind, b.text])).toEqual([
      ["table", "Tabula"],
    ]);
    expect(page.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/isn't the footer/)])
    );
  });

  it("walks into wrapper divs (page_wrapper)", () => {
    const page = read(`<!DOCTYPE html><html><body><div class="page_wrapper">
      <h1>C. IVLI CAESARIS LIBER PRIMVS</h1>
      <p class="internal_navigation"><a href="#1">1</a> <a href="#2">2</a></p>
      <p>[<a name="1">1</a>] <font size=2>1</font> Gallia est omnis divisa.</p>
      <p>[<a name="2">2</a>] Apud Helvetios.</p>
      <div class="footer"><p><a href="/caes.html">Caesar</a>
        <a href="/index.html">The Latin Library</a></p></div>
      </div></body></html>`);
    expect(page.pageTitle).toBe("C. IVLI CAESARIS LIBER PRIMVS");
    expect(page.nav).toEqual(["1", "2"]);
    expect(page.blocks.map((b) => b.markers[0])).toEqual([
      {
        kind: "bracketed_number",
        raw: "[1]",
        value: "1",
        offset: 0,
        anchored: true,
      },
      {
        kind: "bracketed_number",
        raw: "[2]",
        value: "2",
        offset: 0,
        anchored: true,
      },
    ]);
    expect(page.footerText).toBe("Caesar The Latin Library");
    expect(page.warnings).toEqual([]);
  });

  it("uses <h2> titles, <h3> subheadings and keeps index tables", () => {
    const page = read(`<html><body><h2>M. Cornelius Fronto</h2>
      <a name="top"></a>
      <h3>Epistulae liber I</h3>
      <p>Textus.</p>
      <div class="work"><table><tr><td><a href="justin/1.html">Liber I</a></td></tr></table></div>
      </body></html>`);
    expect(page.pageTitle).toBe("M. Cornelius Fronto");
    expect(page.headings).toEqual(["Epistulae liber I"]);
    expect(page.blocks.map((b) => b.kind)).toEqual([
      "heading",
      "paragraph",
      "table",
    ]);
    expect(page.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/leading <h2> as the page title/),
        "No site footer found.",
      ])
    );
  });

  it("wraps loose text and <br> lines into synthetic paragraphs", () => {
    const html = `<html><body><b>CARMEN I</b><br>
      Arma virumque cano,<br>Troiae qui primus ab oris<br><br>
      Italiam fato profugus<br>Laviniaque venit</body></html>`;
    const page = read(html, true);
    expect(page.pageTitle).toBe("");
    expect(page.blocks.map((b) => b.text)).toEqual([
      "CARMEN I\nArma virumque cano,\nTroiae qui primus ab oris",
      "Italiam fato profugus\nLaviniaque venit",
    ]);
    expect(page.blocks[0].kind).toBe("verse");
    expect(getAttr(page.blocks[0].element, SYNTHETIC_PARAGRAPH_ATTR)).toBe(
      "true"
    );
    expect(page.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Loose text/),
        "No page title (<h1> or p.pagehead) found.",
      ])
    );
    // Without preserveLineBreaks, whitespace collapses.
    expect(read(html).blocks[1].text).toBe(
      "Italiam fato profugus Laviniaque venit"
    );
  });

  it("classifies poetry paragraphs and <pre> as verse", () => {
    const page = read(
      `<html><body><h1>T</h1><p class=POETRY>a<br>b</p><pre>x\ny</pre></body></html>`,
      true
    );
    expect(page.blocks.map((b) => [b.kind, b.text])).toEqual([
      ["verse", "a\nb"],
      ["verse", "x\ny"],
    ]);
  });

  it("keeps a second title as a heading", () => {
    const page = read(
      `<html><body><h1>AUCTOR</h1><h1>OPVS</h1><p>T.</p></body></html>`
    );
    expect(page.pageTitle).toBe("AUCTOR");
    expect(page.headings).toEqual(["OPVS"]);
    expect(page.warnings[0]).toMatch(/More than one title/);
  });

  it("never throws, even on empty or broken input", () => {
    for (const html of [
      "",
      "plain text only",
      "<frameset><frame src='a.html'></frameset>",
      "<p>unclosed <b>bold <i>italic",
      "<table><tr><td>cell",
      "<html><body>" + "<div>".repeat(5000) + "deep" + "</div>".repeat(5000),
      "<script>var x = '<p>';</script><style>p{}</style>",
    ]) {
      expect(() => read(html)).not.toThrow();
      expect(() => read(html, true)).not.toThrow();
    }
    expect(read("").warnings).toEqual(
      expect.arrayContaining(["Page has an empty or missing <body>."])
    );
    expect(read("plain text only").blocks.map((b) => b.text)).toEqual([
      "plain text only",
    ]);
    const deep = read(
      "<html><body>" + "<div>".repeat(5000) + "deep" + "</div>".repeat(5000)
    );
    expect(deep.blocks.map((b) => b.text)).toEqual(["deep"]);
  });

  it("requires a parser when none is available", () => {
    expect(() => extractLenientPage("<p>x</p>")).toThrow(/No HtmlBodyParser/);
  });
});
