import { convertGaiusCommentary } from "@/scripts/thelatinlibrary/converters/gaius";

function page(title: string, nav: string[], body: string): string {
  const links = nav.map((n) => `<a href="#${n}">${n}</A>&nbsp;`).join(" ");
  return `<html><head><link rel="StyleSheet" href="x.css"></head><body>
    <p class=pagehead>${title}</p>
    <p class=smallborder></P>
    <p class=margin>${links}</p>
    ${body}
    <p class=border></P>
    <div class="footer"><p><a href="/">The Latin Library</a></p></div>
    </body></html>`;
}

const PRIMUS = "GAI INSTITVTIONVM COMMENTARIVS PRIMVS";
const a = (n: number) => `<a name="${n}">${n}.</A>`;

describe("convertGaiusCommentary", () => {
  it("splits at section numbers and marks rubrics and lacunae editorial", () => {
    const result = convertGaiusCommentary(
      page(
        PRIMUS,
        ["1", "2", "3"],
        `<p>[I. De iure civili.] ${a(1)} Omnes populi [de ea re] reguntur.
         ${a(2)} Constant autem [. . . vv. 5 . . .] iura. [De legibus.]</p>
         <p>${a(3)} Lex est.</p>`
      ),
      1
    );

    expect(result.rows).toEqual([
      [
        ["1", "1"],
        [
          { editorial: "[I. De iure civili.]" },
          "Omnes populi [de ea re] reguntur.",
        ],
      ],
      [
        ["1", "2"],
        ["Constant autem", { editorial: "[. . . vv. 5 . . .]" }, "iura."],
      ],
      [
        ["1", "3"],
        [{ editorial: "[De legibus.]" }, "Lex est."],
      ],
    ]);
  });

  it("uses printed numbers that have no anchor", () => {
    const result = convertGaiusCommentary(
      page(
        PRIMUS,
        ["1", "2", "3"],
        `<p>${a(1)} Unus. 2 Duo. ${a(3)} Tres.</p>`
      ),
      1
    );
    expect(result.rows.map(([id]) => id[1])).toEqual(["1", "2", "3"]);
    expect(result.report.join("\n")).toContain("unanchored on the site: 2");
  });

  it("accepts a short jump only to an anchored number, and reports it", () => {
    const result = convertGaiusCommentary(
      page(
        PRIMUS,
        ["1", "2", "3"],
        `<p>${a(1)} Unus et duo. ${a(3)} Tres.</p>`
      ),
      1
    );
    expect(result.rows.map(([id]) => id[1])).toEqual(["1", "3"]);
    expect(result.report.join("\n")).toContain(
      "no section number on the site for 1.2"
    );
  });

  it("rejects a page whose anchors name sections that weren't found", () => {
    expect(() =>
      convertGaiusCommentary(
        page(PRIMUS, [], `<p>${a(1)} Unus. <a name="9">9.</a> Novem.</p>`),
        1
      )
    ).toThrow(/anchors 9/);
  });

  it("rejects plain text before section 1", () => {
    expect(() =>
      convertGaiusCommentary(
        page(PRIMUS, [], `<p>Prooemium. ${a(1)} Unus.</p>`),
        1
      )
    ).toThrow(/text before section 1/);
  });

  it("checks the commentary number in the title, U or V", () => {
    const quartus = page(
      "GAI INSTITVTIONVM COMMENTARIVS QUARTUS",
      [],
      `<p>${a(1)} I.</p>`
    );
    expect(convertGaiusCommentary(quartus, 4).rows).toHaveLength(1);
    expect(() => convertGaiusCommentary(quartus, 3)).toThrow(
      /does not name commentary 3/
    );
  });
});
