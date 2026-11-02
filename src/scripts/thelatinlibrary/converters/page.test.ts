import {
  parseRoman,
  readPageContent,
  toRoman,
} from "@/scripts/thelatinlibrary/converters/page";

describe("parseRoman / toRoman", () => {
  it("round-trips canonical numerals", () => {
    for (const n of [1, 4, 9, 14, 40, 44, 49, 99]) {
      expect(parseRoman(toRoman(n))).toBe(n);
    }
  });

  it("accepts classical additive numerals and rejects invalid input", () => {
    expect(parseRoman("IIII")).toBe(4);
    expect(parseRoman("XIVL")).toBeUndefined();
    expect(parseRoman("Lysander")).toBeUndefined();
  });
});

describe("readPageContent", () => {
  it("drops navigation, footers and spacers and keeps headings", () => {
    const content = readPageContent(`<html><body>
      <h1>OPVS</h1>
      <p class="internal_navigation"><a href="#1">1</a></p>
      <p class=border></P>
      <p><div align="center">LIBER I</div></p>
      <p>Textus.</p>
      <div class="footer"><p>The Latin Library</p></div>
      </body></html>`);

    expect(content.pageTitle).toBe("OPVS");
    expect(content.nav).toEqual(["1"]);
    expect(content.headings).toEqual(["LIBER I"]);
    expect(content.paragraphs).toHaveLength(1);
  });

  it("recognises a link list by its content, whatever its class", () => {
    const content = readPageContent(`<html><body>
      <h1>OPVS</h1>
      <p class=margin><a href="#1">1</A>&nbsp; <a href="#2">2</A>&nbsp;</p>
      <p><a name="1">1.</a> Textus.</p>
      <p><TABLE><TR><TD><a href="/">The Latin Library</a></TABLE></p>
      </body></html>`);
    expect(content.nav).toEqual(["1", "2"]);
    expect(content.paragraphs).toHaveLength(1);
  });

  it("rejects a table inside a paragraph that isn't the footer", () => {
    expect(() =>
      readPageContent(
        `<html><body><h1>OPVS</h1><p><TABLE><TR><TD>Tabula</TABLE></p><div class="footer"><p>The Latin Library</p></div></body></html>`
      )
    ).toThrow(/isn't the footer/);
  });
});
