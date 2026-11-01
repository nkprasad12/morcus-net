import {
  convertDeclamation,
  speechNumberFromTitle,
} from "@/scripts/thelatinlibrary/declamation";

function page(title: string, body: string): string {
  return `<html><head><link rel="StyleSheet" href="x.css"></head><body>
    <p class=pagehead>${title}</p>
    <p class=border></P>
    ${body}
    <div class="footer"><p><a href="/">The Latin Library</a></p></div>
    </body></html>`;
}

const SECUNDA = "M. FABI QVINTILIANI DECLAMATIO MAIOR SECVNDA";

describe("speechNumberFromTitle", () => {
  it("reads the site's ordinals, including its variants", () => {
    expect(speechNumberFromTitle(SECUNDA)).toBe(2);
    expect(speechNumberFromTitle("DECLAMATIO MAIOR SEXTVS")).toBe(6);
    expect(speechNumberFromTitle("DECLAMATIO MAIOR TERTIA DECIMA")).toBe(13);
    expect(speechNumberFromTitle("DECLAMATIO MAIOR VNDEVICENSIMA")).toBe(19);
  });

  it("returns undefined for other titles", () => {
    expect(speechNumberFromTitle("INSTITUTIO ORATORIA")).toBeUndefined();
  });
});

describe("convertDeclamation", () => {
  it("splits the theme and sections, including mid-paragraph markers", () => {
    const result = convertDeclamation(
      page(
        SECUNDA,
        `<p>Thema causae.</p>
         <p>[1] Primum. [2] Secundum incipit</p>
         <p>et pergit. [3] Tertium.</p>`
      ),
      2
    );

    expect(result.rows).toEqual([
      [["2", "thema"], "Thema causae."],
      [["2", "1"], "Primum."],
      [["2", "2"], "Secundum incipit et pergit."],
      [["2", "3"], "Tertium."],
    ]);
  });

  it("drops square brackets around a bracketed theme", () => {
    const result = convertDeclamation(
      page(SECUNDA, `<p>[Thema causae.]</p><p>[1] Primum.</p>`),
      2
    );
    expect(result.rows[0]).toEqual([["2", "thema"], "Thema causae."]);
  });

  it("rejects a page whose title names another speech", () => {
    expect(() =>
      convertDeclamation(page(SECUNDA, `<p>T.</p><p>[1] P.</p>`), 4)
    ).toThrow(/does not name declamation 4/);
  });

  it("rejects gaps in the section markers", () => {
    expect(() =>
      convertDeclamation(page(SECUNDA, `<p>T.</p><p>[1] P. [3] Q.</p>`), 2)
    ).toThrow(/\[3\] found where \[2\]/);
  });

  it("rejects a missing theme or missing sections", () => {
    expect(() => convertDeclamation(page(SECUNDA, `<p>[1] P.</p>`), 2)).toThrow(
      /no theme/
    );
    expect(() =>
      convertDeclamation(page(SECUNDA, `<p>Thema tantum.</p>`), 2)
    ).toThrow(/no sections/);
  });
});
