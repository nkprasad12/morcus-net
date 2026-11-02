import { convertDigestBook } from "@/scripts/thelatinlibrary/converters/digest";

const HEAD = `<p class=pagehead>OMINI NOSTRI SACRATISSIMI PRINCIPIS IUSTINIANI IURIS ENUCLEATI EX OMNI VETERE IURE COLLECTI DIGESTORUM SEU PANDECTARUM</p>
  <p class=border></P>`;
const FOOT = `<p class=border></P>
  <p><table><tr><td><a href="/index.html">The Latin Library</a></table></p>`;

function page(liber: string, body: string): string {
  return `<html><body>${HEAD}<p><div align="center">${liber}</div></p>${body}${FOOT}</body></html>`;
}

const frag = (cit: string, inscr: string, text: string) =>
  `<p>${cit}</p><p>${inscr}</p><p>${text}</p>`;

const BOOK_1 = page(
  "LIBER PRIMUS",
  `<p>Dig. 1.1.0. De iustitia et iure. <br> Dig. 1.2.0. De origine iuris.</p>
   <p class=border></P>
   <p><b>Dig. 1.1.0. De iustitia et iure.</b></p>
   ${frag("Dig. 1.1.1pr.", "Ulpianus 1 inst.", "Iuri operam daturum.")}
   ${frag("Dig. 1.1.1.1", "Ulpianus 1 inst.", "Cuius merito.")}
   ${frag("Dig. 1.1.2", "Pomponius l.S. enchir.", "Veluti erga deum religio.")}
   <center><hr width=50%></center>
   <p><b>Dig. 1.2.0. De origine iuris.</b></p>
   ${frag("Dig. 1.2.1", "Gaius 1 ad l. xii tab.", "Facturus legum.")}`
);

describe("convertDigestBook", () => {
  it("makes title headings and fragments with editorial inscriptions", () => {
    const result = convertDigestBook(BOOK_1, 1);

    expect(result.rows).toEqual([
      [["1", "1"], "De iustitia et iure.", "heading"],
      [
        ["1", "1", "1", "pr"],
        [
          { editorial: "Ulpianus 1 inst.", style: "smallcaps" },
          "Iuri operam daturum.",
        ],
      ],
      [["1", "1", "1", "1"], "Cuius merito."],
      [
        ["1", "1", "2"],
        [
          { editorial: "Pomponius l.S. enchir.", style: "smallcaps" },
          "Veluti erga deum religio.",
        ],
      ],
      [["1", "2"], "De origine iuris.", "heading"],
      [
        ["1", "2", "1"],
        [
          { editorial: "Gaius 1 ad l. xii tab.", style: "smallcaps" },
          "Facturus legum.",
        ],
      ],
    ]);
  });

  it("handles books without titles (De legatis)", () => {
    const result = convertDigestBook(
      page(
        "LIBER TRICESIMUS",
        `<p>Dig. 30.0. De legatis et fideicommissis.</p>
         <p class=border></P>
         <p><b>Dig. 30.0. De legatis et fideicommissis.</b></p>
         ${frag("Dig. 30.1", "Ulpianus 67 ad ed.", "Per omnia exaequata.")}
         ${frag("Dig. 30.2pr.", "Ulpianus 1 fideic.", "Sciendum est.")}`
      ),
      30
    );
    expect(result.rows.map(([id]) => id.join("."))).toEqual([
      "30.0",
      "30.0.1",
      "30.0.2.pr",
    ]);
  });

  it("drops an exact repeat of the whole book, and reports it", () => {
    const body = `<p><b>Dig. 2.1.0. De iurisdictione.</b></p>
      ${frag("Dig. 2.1.1", "Ulpianus 1 reg.", "Ius dicentis.")}`;
    const result = convertDigestBook(
      page(
        "LIBER SECUNDUS",
        `<p>Dig. 2.1.0. De iurisdictione. <br> Dig. 2.2.0. Quod quisque iuris.</p>${body}${body}`
      ).replace("Dig. 2.2.0. Quod quisque iuris.", ""),
      2
    );
    expect(result.rows).toHaveLength(2);
    expect(result.report.join("\n")).toContain("repeats the whole book");
  });

  it("keeps a fragment with no text, and reports it", () => {
    const result = convertDigestBook(
      page(
        "LIBER TERTIUS",
        `<p>Dig. 3.1.0. De postulando. <br> Dig. 3.2.0. De his qui notantur.</p>
         <p><b>Dig. 3.1.0. De postulando.</b></p>
         <p>Dig. 3.1.1pr.</p><p>Ulpianus 6 ad ed.</p>
         ${frag("Dig. 3.1.1.1", "Ulpianus 6 ad ed.", "Postulare.")}
         <p><b>Dig. 3.2.0. De his qui notantur.</b></p>
         ${frag("Dig. 3.2.1", "Iulianus 1 ad ed.", "Praetoris verba.")}`
      ),
      3
    );
    expect(result.rows[1]).toEqual([
      ["3", "1", "1", "pr"],
      [{ editorial: "Ulpianus 6 ad ed.", style: "smallcaps" }],
    ]);
    expect(result.report.join("\n")).toContain(
      "no text on the site for 3.1.1.pr"
    );
  });

  it("rejects citations out of order", () => {
    expect(() =>
      convertDigestBook(BOOK_1.replace("Dig. 1.1.2", "Dig. 1.1.1.1"), 1)
    ).toThrow(/out of order/);
  });

  it("rejects a later fragment whose inscription differs from its lex's", () => {
    // Its inscription would be dropped as a repeat, losing whatever it holds.
    expect(() =>
      convertDigestBook(
        BOOK_1.replace(
          frag("Dig. 1.1.1.1", "Ulpianus 1 inst.", "Cuius merito."),
          frag("Dig. 1.1.1.1", "Iustitia est constans.", "Cuius merito.")
        ),
        1
      )
    ).toThrow(
      /'Dig\. 1\.1\.1\.1' has inscription 'Iustitia est constans\.', but its lex began with 'Ulpianus 1 inst\.'/
    );
  });

  it("rejects a heading that differs from the contents", () => {
    expect(() =>
      convertDigestBook(
        BOOK_1.replace(
          "<b>Dig. 1.2.0. De origine iuris.</b>",
          "<b>Dig. 1.2.0. De legibus.</b>"
        ),
        1
      )
    ).toThrow(/differs from contents/);
  });

  it("rejects stray text before the first title", () => {
    expect(() =>
      convertDigestBook(
        BOOK_1.replace(
          "<p><b>Dig. 1.1.0. De iustitia et iure.</b></p>",
          "<p>Textus vagus.</p><p><b>Dig. 1.1.0. De iustitia et iure.</b></p>"
        ),
        1
      )
    ).toThrow(/expected a citation or heading/);
  });
});
