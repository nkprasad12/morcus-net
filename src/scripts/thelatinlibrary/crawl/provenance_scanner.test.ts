import {
  decodeHtmlBytes,
  extractRawPageText,
  KNOWN_POST_1930_PAGES,
  lookupKnownEdition,
  scanPageProvenance,
} from "@/scripts/thelatinlibrary/crawl/provenance_scanner";

describe("provenance_scanner", () => {
  it("returns noStatement / none when no edition or copyright text is present", () => {
    const res = scanPageProvenance(
      "resgestae.html",
      "Rerum gestarum divi Augusti...",
      ["Rerum gestarum divi Augusti..."]
    );
    expect(res).toEqual({
      provenance: "noStatement",
      provenanceClassification: "none",
      provenanceStatements: [],
      statedEdition: null,
      excluded: false,
    });
  });

  it("preserves KNOWN_EDITIONS for justinian digest and justin prologi", () => {
    expect(lookupKnownEdition("justinian/digest1.shtml")).toContain(
      "Mommsen-Krueger"
    );
    expect(lookupKnownEdition("justin/prologi.html")).toContain("Ruehl / Jeep");
  });

  it("classifies pre-1930 edition statements as pre1930 and not excluded", () => {
    const stmt = "Ex recensione C. Halm, Teubner, Leipzig, 1886.";
    const res = scanPageProvenance("valmax.html", stmt, [stmt]);
    expect(res.provenance).toBe("statementFound");
    expect(res.provenanceClassification).toBe("pre1930");
    expect(res.excluded).toBe(false);
    expect(res.statedEdition).toBe(stmt);
    expect(res.provenanceStatements).toEqual([stmt]);
  });

  it("excludes pages with copyright or permission notices", () => {
    const stmt = "Copyright © 2004 by John Doe. All rights reserved.";
    const res = scanPageProvenance("some/work.html", stmt, [stmt]);
    expect(res.provenance).toBe("statementFound");
    expect(res.provenanceClassification).toBe("post1930_or_copyright");
    expect(res.excluded).toBe(true);
    expect(res.exclusionReason).toMatch(/Copyright/i);
  });

  it("excludes pages naming a post-1930 edition year", () => {
    const stmt = "Text from the Oxford Classical Texts edition, 1965.";
    const res = scanPageProvenance("some/oct.html", stmt, [stmt]);
    expect(res.provenanceClassification).toBe("post1930_or_copyright");
    expect(res.excluded).toBe(true);
    expect(res.exclusionReason).toContain("1965");
  });

  it("excludes all 5 known post-1930 works from the stage-4 audit", () => {
    const expectedPaths = [
      "augustine/epist.firmus.html",
      "jfkhonor.html",
      "declaratio.html",
      "ency.fides.html",
      "bill.rights.html",
    ];
    for (const p of expectedPaths) {
      expect(KNOWN_POST_1930_PAGES[p]).toBeDefined();
      const res = scanPageProvenance(p, "Plain Latin text", [
        "Plain Latin text",
      ]);
      expect(res.provenanceClassification).toBe("post1930_or_copyright");
      expect(res.excluded).toBe(true);
    }
  });

  it("ignores boilerplate nav/footer strings", () => {
    const res = scanPageProvenance("misc.html", "The Latin Library", [
      "The Latin Library",
      "The Classics Page | Neo-Latin",
    ]);
    expect(res.provenance).toBe("noStatement");
    expect(res.provenanceStatements).toEqual([]);
  });

  it("extracts bodyText, paragraphsText, title, and links via extractRawPageText", () => {
    const html = `<html><head><title>Test</title></head><body>
      <h1>Test Work</h1>
      <p>First paragraph with <a href="sub/1.html">link</a>.</p>
      <div>Second block</div>
    </body></html>`;
    const extracted = extractRawPageText(html);
    expect(extracted.title).toBe("Test Work");
    expect(extracted.paragraphsText).toEqual([
      "First paragraph with link.",
      "Second block",
    ]);
    expect(extracted.links).toEqual(["sub/1.html"]);
  });

  it("decodes UTF-8 Greek Omega without false-positive copyright symbol and respects iso-8859-1 meta", () => {
    const utf8Bytes = Buffer.from("<p>Graece Ωmega</p>", "utf8");
    const decodedUtf8 = decodeHtmlBytes(utf8Bytes);
    expect(decodedUtf8).toContain("Ωmega");
    expect(decodedUtf8).not.toContain("©");

    const latin1Bytes = Buffer.from(
      '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"><p>Caf\xe9</p>',
      "latin1"
    );
    expect(decodeHtmlBytes(latin1Bytes)).toContain("Café");
  });

  it("classifies pre-1930 editions with modern transcription years as pre1930 (not excluded)", () => {
    const res = scanPageProvenance(
      "magnacarta.html",
      "Transcribed 1998 from Charles Bémont, Paris, 1892.",
      ["Transcribed 1998 from Charles Bémont, Paris, 1892."]
    );
    expect(res.provenanceClassification).toBe("pre1930");
    expect(res.excluded).toBe(false);
  });

  it("detects post-1930 years even after 600 characters in a long paragraph", () => {
    const longPara =
      "Edited by " + "x ".repeat(320) + "Oxford University Press, 1972.";
    const res = scanPageProvenance("some/long.html", longPara, [longPara]);
    expect(res.provenanceClassification).toBe("post1930_or_copyright");
    expect(res.excluded).toBe(true);
  });
});
