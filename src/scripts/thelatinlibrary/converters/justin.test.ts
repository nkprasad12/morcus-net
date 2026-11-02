import {
  convertJustinBook,
  convertJustinPraefatio,
  convertTrogusPrologi,
} from "@/scripts/thelatinlibrary/converters/justin";

const FOOTER = `<p class=border></P>
  <p><TABLE><TR><TD><a href="/justin.html">Justin</a>
  <TD><a href="/index.html">The Latin Library</a></TABLE></p>`;

function book(heading: string, body: string): string {
  // No doctype: the site's pages render in quirks mode, where the footer
  // table stays inside its <p>.
  return `<html><head><title>Justin</title></head><body>
    <p class=pagehead>HISTORIARUM PHILIPPICARUM</p>
    <p class=border></P>
    <p><div align="center">${heading}</div></p>
    ${body}
    ${FOOTER}
    </body></html>`;
}

describe("convertJustinBook", () => {
  it("cites rows by book and chapter and removes section numbers", () => {
    const result = convertJustinBook(
      book(
        "LIBER XI",
        `<p>I. Primum caput. 2 Altera pars. <FONT SIZE=2>3</FONT> Tertia.</p>
         <p>II. Secundum caput.</p>`
      ),
      11
    );

    expect(result.rows).toEqual([
      [["11", "1"], "Primum caput. Altera pars. Tertia."],
      [["11", "2"], "Secundum caput."],
    ]);
    expect(result.removedSectionNumbers).toBe(2);
  });

  it("accepts [I] markers, continuation paragraphs and mid-paragraph chapters", () => {
    const result = convertJustinBook(
      book(
        "LIBER I",
        `<p>[I] Primum caput.</p>
         <p>Pergit primum.</p>
         <p>[II] Secundum. III Cum tertium incipit. IV. [Nomen] quartum.</p>`
      ),
      1
    );

    expect(result.rows.map(([id]) => id.join("."))).toEqual([
      "1.1",
      "1.2",
      "1.3",
      "1.4",
    ]);
    expect(result.rows[0][1]).toBe("Primum caput. Pergit primum.");
    expect(result.rows[3][1]).toBe("[Nomen] quartum.");
  });

  it("leaves numerals in the text alone unless they are the next chapter", () => {
    const result = convertJustinBook(
      book(
        "LIBER II",
        `<p>I. Caesa sunt V. milia hostium. II. Deinde pax.</p>`
      ),
      2
    );
    expect(result.rows).toEqual([
      [["2", "1"], "Caesa sunt V. milia hostium."],
      [["2", "2"], "Deinde pax."],
    ]);
  });

  it("flags chapter markers followed by a lowercase word for review", () => {
    const result = convertJustinBook(
      book("LIBER III", `<p>I. Primum, II. cum interim alterum.</p>`),
      3
    );
    expect(result.lowercaseMarkers).toHaveLength(1);
  });

  it("rejects a heading for the wrong book", () => {
    expect(() =>
      convertJustinBook(book("LIBER XIVL", `<p>I. Caput.</p>`), 44)
    ).toThrow(/Expected heading 'LIBER XLIV'/);
  });

  it("rejects a paragraph that opens out of sequence", () => {
    expect(() =>
      convertJustinBook(
        book("LIBER IV", `<p>I. Primum.</p><p>III. Tertium.</p>`),
        4
      )
    ).toThrow(/out of sequence/);
  });

  it("rejects digits that aren't section numbers", () => {
    expect(() =>
      convertJustinBook(book("LIBER V", `<p>I. Rex I1lyriorum venit.</p>`), 5)
    ).toThrow(/unexpected digits/);
  });
});

describe("convertJustinPraefatio", () => {
  it("makes the preface one row", () => {
    const result = convertJustinPraefatio(
      book("<b>PRAEFATIO</b>", `<p>Cum multi.</p><p>Vale.</p>`)
    );
    expect(result.rows).toEqual([[["pr"], "Cum multi. Vale."]]);
  });
});

describe("convertTrogusPrologi", () => {
  it("makes one row per prologue, in order", () => {
    const result = convertTrogusPrologi(
      `<html><body><p class=pagehead>H</p>
       <p>PROLOGVS LIBRI I.</p><p>Primo uolumine.</p>
       <p>PROLOGVS LIBRI II.</p><p>Secundo.</p><p>Plura.</p>
       ${FOOTER}
       </body></html>`
    );
    expect(result.rows).toEqual([
      [["1"], "Primo uolumine."],
      [["2"], "Secundo. Plura."],
    ]);
  });

  it("rejects prologues out of order", () => {
    expect(() =>
      convertTrogusPrologi(
        `<html><body><p class=pagehead>H</p><p>PROLOGVS LIBRI II.</p><p>T.</p>${FOOTER}</body></html>`
      )
    ).toThrow(/where I was expected/);
  });
});
