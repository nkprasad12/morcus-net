import fs from "fs";
import {
  LsAuthorAbbreviations,
  parseAuthorAbbreviations,
} from "./ls_abbreviations";

const TEMP_FILE = "ls_abbreviations.tmp.html";

const BASIC = `
<ul>
  <li><b>Aem. Mac.</b> Aemilius Macer, <i>poet</i>, obiit, B.C. 14</li>
  <li><b>Afran.</b> Lucius Afranius, <i>writer of comedy</i>, flor. B.C. 110</li>
</ul>
`;

const OR_IN_AUTHORS = `
<ul>
  <li><b>Aem. Mac.</b> Aemilius Macer, <i>poet</i>, obiit, B.C. 14</li>
  <li><b>Agrim.</b> or <b>Agrimens.</b> The ancient writers on surveying</li>
</ul>
`;

const OR_IN_WORKS = `
<ul>
  <li><b>Aldh.</b> Aldhelmus, <i>Bishop of Salisbury, England,</i> ob. A.D. 709
    <ul>
      <li><b>Laud. Virg.,</b> De Laudibus Virginitatis.</li>
    </ul>
  </li>
</ul>
`;

describe("parseAbbreviations", () => {
  afterEach(() => {
    try {
      fs.unlinkSync(TEMP_FILE);
    } catch (e) {}
  });

  function writeFile(contents: string) {
    fs.writeFileSync(TEMP_FILE, contents);
  }

  it("processes all elements", () => {
    writeFile(BASIC);

    const result = parseAuthorAbbreviations(TEMP_FILE);

    expect(result).toHaveLength(2);
    expect(result[0].key).toBe("Aem. Mac.");
    expect(result[0].expanded).toBe("Aemilius Macer, poet, obiit, B.C. 14");
    expect(result[0].works.size).toBe(0);
    expect(result[1].key).toBe("Afran.");
    expect(result[1].expanded).toBe(
      "Lucius Afranius, writer of comedy, flor. B.C. 110"
    );
    expect(result[1].works.size).toBe(0);
  });

  it("handles multiple keys", () => {
    writeFile(OR_IN_AUTHORS);

    const result = parseAuthorAbbreviations(TEMP_FILE);

    expect(result).toHaveLength(3);
    expect(result[0].key).toBe("Aem. Mac.");
    expect(result[0].expanded).toBe("Aemilius Macer, poet, obiit, B.C. 14");
    expect(result[0].works.size).toBe(0);
    expect(result[1].key).toBe("Agrim.");
    expect(result[1].expanded).toBe("The ancient writers on surveying");
    expect(result[1].works.size).toBe(0);
    expect(result[2].key).toBe("Agrimens.");
    expect(result[2].expanded).toBe("The ancient writers on surveying");
    expect(result[2].works.size).toBe(0);
  });

  it("handles works", () => {
    writeFile(OR_IN_WORKS);

    const result = parseAuthorAbbreviations(TEMP_FILE);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("Aldh.");
    expect(result[0].expanded).toBe(
      "Aldhelmus, Bishop of Salisbury, England, ob. A.D. 709"
    );
    expect(result[0].works.size).toBe(1);
    expect(result[0].works.get("Laud. Virg.")).toBe(
      "De Laudibus Virginitatis."
    );
  });
});

describe("LsAuthorAbbreviations", () => {
  it("uses singleton authors map", () => {
    const first = LsAuthorAbbreviations.authors();
    expect(LsAuthorAbbreviations.authors()).toBe(first);
  });
});
