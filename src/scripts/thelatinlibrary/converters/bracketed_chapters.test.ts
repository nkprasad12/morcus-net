import {
  ConversionError,
  convertBracketedChapters,
} from "@/scripts/thelatinlibrary/converters/bracketed_chapters";

function page(body: string, nav = ["1", "2"]): string {
  const links = nav.map((n) => `<a href="#${n}">${n}</a>`).join("\n");
  return `<!DOCTYPE HTML><html><head><title>T</title>
    <link rel="StyleSheet" href="x.css"></head>
    <body><h1>OPVS</h1>
    <p class="internal_navigation">${links}</p>
    ${body}
    <div class="footer"><p><a href="/">The Latin Library</a></p></div>
    </body></html>`;
}

describe("convertBracketedChapters", () => {
  it("converts a preamble, anchored chapters and an appendix", () => {
    const result = convertBracketedChapters(
      page(`
        <p>Prooemium hoc est.</p>
        <p>[<a name="1">1</a>] Primum caput [ob quae] est.</p>
        <p>[<a name="2">2</a>] Secundum<br>caput&nbsp;est.</p>
        <p>[1] Additamentum primum.</p>
        <p>[2] Additamentum alterum.</p>`)
    );

    expect(result.pageTitle).toBe("OPVS");
    expect(result.rows).toEqual([
      [["pr"], "Prooemium hoc est."],
      [["1"], "Primum caput [ob quae] est."],
      [["2"], "Secundum caput est."],
      [["appendix1"], "Additamentum primum."],
      [["appendix2"], "Additamentum alterum."],
    ]);
  });

  it("recovers from malformed markup the way a browser does", () => {
    // Unclosed <p>, upper-case end tags and unquoted attributes.
    const result = convertBracketedChapters(
      page(`
        <p class=border></P>
        <p>[<a name="1">1</a>] Primum caput.
        <P>[<a name="2">2</a>] Secundum caput.</P>`)
    );

    expect(result.rows).toEqual([
      [["1"], "Primum caput."],
      [["2"], "Secundum caput."],
    ]);
  });

  it("rejects pages without a navigation block", () => {
    const html = `<html><body><p>[1] Caput.</p></body></html>`;
    expect(() => convertBracketedChapters(html)).toThrow(ConversionError);
  });

  it("rejects anchors that disagree with the navigation", () => {
    const html = page(`
      <p>[<a name="1">1</a>] Primum.</p>
      <p>[<a name="3">3</a>] Tertium.</p>`);
    expect(() => convertBracketedChapters(html)).toThrow(
      /navigation expects '2'/
    );
  });

  it("rejects navigation entries with no matching anchor", () => {
    const html = page(`<p>[<a name="1">1</a>] Primum.</p>`);
    expect(() => convertBracketedChapters(html)).toThrow(/2 chapters but 1/);
  });

  it("rejects unnumbered paragraphs after the first chapter", () => {
    const html = page(`
      <p>[<a name="1">1</a>] Primum.</p>
      <p>Sine numero.</p>
      <p>[<a name="2">2</a>] Secundum.</p>`);
    expect(() => convertBracketedChapters(html)).toThrow(/Unnumbered/);
  });

  it("rejects unanchored markers before the last chapter", () => {
    const html = page(`
      <p>[<a name="1">1</a>] Primum.</p>
      <p>[7] Erratum.</p>
      <p>[<a name="2">2</a>] Secundum.</p>`);
    expect(() => convertBracketedChapters(html)).toThrow(/before the last/);
  });

  it("rejects appendix items out of order", () => {
    const html = page(`
      <p>[<a name="1">1</a>] Primum.</p>
      <p>[<a name="2">2</a>] Secundum.</p>
      <p>[2] Additamentum.</p>`);
    expect(() => convertBracketedChapters(html)).toThrow(/out of order/);
  });

  it("rejects unexpected elements in the body", () => {
    const html = page(`
      <table><tr><td>Tabula</td></tr></table>
      <p>[<a name="1">1</a>] Primum.</p>
      <p>[<a name="2">2</a>] Secundum.</p>`);
    expect(() => convertBracketedChapters(html)).toThrow(/<table>/);
  });

  it("rejects stray text directly in the body", () => {
    const html = page(`
      Textus vagus.
      <p>[<a name="1">1</a>] Primum.</p>
      <p>[<a name="2">2</a>] Secundum.</p>`);
    expect(() => convertBracketedChapters(html)).toThrow(
      /Loose text\/inline content directly in <body>/
    );
  });
});
