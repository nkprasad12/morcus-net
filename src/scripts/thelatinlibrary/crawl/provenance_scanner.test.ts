import {
  CURATED_PROVENANCE_RULES,
  decodeRawPageBytes,
  extractRawPageText,
  KNOWN_POST_1930_PAGES,
  lookupKnownEdition,
  PUBLIC_DOMAIN_CUTOFF_YEAR,
  scanPageProvenance,
} from "@/scripts/thelatinlibrary/crawl/provenance_scanner";

describe("provenance_scanner", () => {
  it("returns noStatement / none when no edition or copyright text is present", () => {
    const res = scanPageProvenance("resgestae.html", [
      "Rerum gestarum divi Augusti...",
    ]);
    expect(res).toEqual({
      provenance: "noStatement",
      provenanceClassification: "none",
      provenanceStatements: [],
      statedEdition: null,
      excluded: false,
    });
  });

  it("preserves known editions for the Justinian Digest and Justin's prologi", () => {
    expect(lookupKnownEdition("justinian/digest1.shtml")).toContain(
      "Mommsen-Krueger"
    );
    expect(lookupKnownEdition("justin/prologi.html")).toContain("Ruehl / Jeep");
  });

  it("classifies pre-1930 edition statements as pre1930 and not excluded", () => {
    const stmt = "Ex recensione C. Halm, Teubner, Leipzig, 1886.";
    const res = scanPageProvenance("valmax.html", [stmt]);
    expect(res.provenance).toBe("statementFound");
    expect(res.provenanceClassification).toBe("pre1930");
    expect(res.excluded).toBe(false);
    expect(res.statedEdition).toBe(stmt);
    expect(res.provenanceStatements).toEqual([stmt]);
  });

  it("excludes pages with copyright or permission notices", () => {
    const stmt = "Copyright © 2004 by John Doe. All rights reserved.";
    const res = scanPageProvenance("some/work.html", [stmt]);
    expect(res.provenance).toBe("statementFound");
    expect(res.provenanceClassification).toBe("post1930_or_copyright");
    expect(res.excluded).toBe(true);
    expect(res.exclusionReason).toMatch(/Copyright/i);
  });

  it("excludes pages naming a post-1930 edition year", () => {
    const stmt = "Text from the Oxford Classical Texts edition, 1965.";
    const res = scanPageProvenance("some/oct.html", [stmt]);
    expect(res.provenanceClassification).toBe("post1930_or_copyright");
    expect(res.excluded).toBe(true);
    expect(res.exclusionReason).toContain("1965");
  });

  it("treats an edition from the cutoff year itself as public domain", () => {
    const stmt = `Text from the edition of A. Editor, Leipzig, ${PUBLIC_DOMAIN_CUTOFF_YEAR}.`;
    const res = scanPageProvenance("some/cutoff.html", [stmt]);
    expect(res.provenanceClassification).toBe("pre1930");
    expect(res.excluded).toBe(false);
  });

  it("excludes all 5 known post-1930 works from the coverage audit", () => {
    const expectedPaths = [
      "augustine/epist.firmus.html",
      "jfkhonor.html",
      "declaratio.html",
      "ency.fides.html",
      "bill.rights.html",
    ];
    for (const p of expectedPaths) {
      expect(KNOWN_POST_1930_PAGES[p]).toBeDefined();
      const res = scanPageProvenance(p, ["Plain Latin text"]);
      expect(res.provenanceClassification).toBe("post1930_or_copyright");
      expect(res.excluded).toBe(true);
    }
  });

  it("keeps the curated rules consistent with the cutoff year", () => {
    for (const rule of CURATED_PROVENANCE_RULES) {
      if (rule.year === null) continue;
      if (rule.classification === "PRE_CUTOFF") {
        expect(rule.year).toBeLessThanOrEqual(PUBLIC_DOMAIN_CUTOFF_YEAR);
      } else {
        expect(rule.year).toBeGreaterThan(PUBLIC_DOMAIN_CUTOFF_YEAR);
      }
    }
  });

  it("ignores boilerplate nav/footer strings", () => {
    const res = scanPageProvenance("misc.html", [
      "The Latin Library",
      "The Classics Page | Neo-Latin",
    ]);
    expect(res.provenance).toBe("noStatement");
    expect(res.provenanceStatements).toEqual([]);
  });

  it("extracts bodyText, leaf blocks, title, and links via extractRawPageText", () => {
    const html = `<html><head><title>Test</title></head><body>
      <h1>Test Work</h1>
      <p>First paragraph with <a href="sub/1.html">link</a>.</p>
      <div>Second block<p>Nested paragraph</p>tail</div>
      Loose text
    </body></html>`;
    const extracted = extractRawPageText(html);
    expect(extracted.title).toBe("Test Work");
    expect(extracted.blocks).toEqual([
      "Test Work",
      "First paragraph with link.",
      "Second block",
      "Nested paragraph",
      "tail",
      "Loose text",
    ]);
    expect(extracted.links).toEqual(["sub/1.html"]);
  });

  it("drops verse line numbers from leaf blocks", () => {
    const { blocks } = extractRawPageText(
      `<html><body><p>Fallor, fallor uesana furens,<span style="font-size: 80%;">1930</span><br>
      nec te manes umbraeque timent</p></body></html>`
    );
    expect(blocks).toEqual([
      "Fallor, fallor uesana furens, nec te manes umbraeque timent",
    ]);
  });

  it("does not exclude verse whose line number 1930 sits next to edidit (Hercules Oetaeus)", () => {
    const html = `<html><body><p>
      Fallor, fallor uesana furens,&nbsp;&nbsp;<span style="font-size: 80%;">1930</span><br>
      quem Iuno edidit, nec te manes umbraeque timent,<br>
    </p></body></html>`;
    const res = scanPageProvenance(
      "sen/sen.hercules.shtml",
      extractRawPageText(html).blocks
    );
    expect(res.excluded).toBe(false);
    expect(res.provenanceClassification).not.toBe("post1930_or_copyright");
  });

  it("only counts years near an edition statement", () => {
    const block =
      "Text from the edition of A. Editor, Leipzig, 1880. " +
      "x ".repeat(100) +
      "anno 1954 natus est.";
    const res = scanPageProvenance("some/far.html", [block]);
    expect(res.provenanceClassification).toBe("pre1930");
    expect(res.excluded).toBe(false);
  });

  it("detects a post-1930 edition statement late in a long block", () => {
    const block =
      "x ".repeat(320) + "Edited by A. Editor, Oxford University Press, 1972.";
    const res = scanPageProvenance("some/long.html", [block]);
    expect(res.provenanceClassification).toBe("post1930_or_copyright");
    expect(res.excluded).toBe(true);
  });

  it("ignores transcription years after a pre-1930 edition (heuristic, no curated rule)", () => {
    const stmt =
      "Text from the edition of A. Holder, Leipzig, 1882. Transcribed by J. Doe, 1998.";
    const res = scanPageProvenance("some/uncurated.html", [stmt]);
    expect(res.provenanceClassification).toBe("pre1930");
    expect(res.excluded).toBe(false);
  });

  it("lets a curated PRE_CUTOFF rule override modern years on the page", () => {
    const res = scanPageProvenance("magnacarta.html", [
      "Transcribed 1998 from Charles Bémont, Paris, 1892. Copyright 1998.",
    ]);
    expect(res.provenanceClassification).toBe("pre1930");
    expect(res.excluded).toBe(false);
    expect(res.statedEdition).toContain("Bémont");
  });

  it("decodes UTF-8 Greek Omega without a false-positive copyright symbol and respects iso-8859-1 meta", () => {
    const utf8Bytes = Buffer.from("<p>Graece Ωmega</p>", "utf8");
    const decodedUtf8 = decodeRawPageBytes(utf8Bytes);
    expect(decodedUtf8).toContain("Ωmega");
    expect(decodedUtf8).not.toContain("©");

    const latin1Bytes = Buffer.from(
      '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"><p>Caf\xe9</p>',
      "latin1"
    );
    expect(decodeRawPageBytes(latin1Bytes)).toContain("Café");
  });

  it("uses the HTTP charset only when the page declares none", () => {
    const undeclared = Buffer.from("<p>Caf\xe9</p>", "latin1");
    expect(decodeRawPageBytes(undeclared, "iso-8859-1")).toContain("Café");

    const declaredUtf8 = Buffer.from(
      '<meta charset="utf-8"><p>Café</p>',
      "utf8"
    );
    expect(decodeRawPageBytes(declaredUtf8, "iso-8859-1")).toContain("Café");
  });
});
