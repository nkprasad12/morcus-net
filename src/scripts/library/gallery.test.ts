import { ArgumentParser } from "argparse";
import fs from "fs";
import os from "os";
import path from "path";

import { LatinWorks } from "@/common/library/library_constants";
import {
  analyzeWorkForGallery,
  buildGallery,
  buildGalleryReportFromInputs,
  buildReaderSectionUrl,
  formatGalleryHtml,
  formatGalleryMarkdown,
  selectDiverseExemplars,
  serializeTeiSnippet,
  type GalleryWorkInput,
} from "@/scripts/library/gallery";
import {
  LIBRARY_ACTIONS,
  configureLibraryParser,
  optInt,
  optString,
  runLibraryCli,
} from "@/scripts/library/library_cli";
import { parseRawXml } from "@/common/xml/xml_utils";

console.debug = jest.fn();

const PROSE_ENCODING_DESC = `
  <encodingDesc>
    <refsDecl n="CTS">
      <cRefPattern n="section" matchPattern="(\\w+).(\\w+)"
        replacementPattern="#xpath(/tei:TEI/tei:text/tei:body/tei:div/tei:div[@n='$1']/tei:div[@n='$2'])"><p>x</p></cRefPattern>
      <cRefPattern n="chapter" matchPattern="(\\w+)"
        replacementPattern="#xpath(/tei:TEI/tei:text/tei:body/tei:div/tei:div[@n='$1'])"><p>x</p></cRefPattern>
    </refsDecl>
  </encodingDesc>`;

const VERSE_ENCODING_DESC = `
  <encodingDesc>
    <refsDecl n="CTS">
      <cRefPattern n="line" matchPattern="(\\w+).(\\w+)"
        replacementPattern="#xpath(/tei:TEI/tei:text/tei:body/tei:div/tei:div[@n='$1']/tei:l[@n='$2'])"><p>x</p></cRefPattern>
      <cRefPattern n="poem" matchPattern="(\\w+)"
        replacementPattern="#xpath(/tei:TEI/tei:text/tei:body/tei:div/tei:div[@n='$1'])"><p>x</p></cRefPattern>
    </refsDecl>
  </encodingDesc>`;

function makeTei(options: {
  title?: string;
  author?: string;
  encodingDesc?: string;
  body: string;
}): string {
  const {
    title = "De Bello Testo",
    author = "Julius Caesar",
    encodingDesc = PROSE_ENCODING_DESC,
    body,
  } = options;
  return `<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>${title}</title><author>${author}</author></titleStmt>
      <publicationStmt><availability><licence>CC BY-SA 4.0</licence></availability></publicationStmt>
    </fileDesc>
    ${encodingDesc}
  </teiHeader>
  <text xml:lang="lat"><body>${body}</body></text>
</TEI>`;
}

const RICH_PROSE_BODY = `<div type="edition" n="urn:cts:latinLit:phi0448.phi001.perseus-lat2">
  <div type="textpart" subtype="chapter" n="1">
    <head>Liber Primus</head>
    <div type="textpart" subtype="section" n="1">
      <p rend="align(indent)">Gallia <hi rend="italic">est</hi> omnis <del>divisa</del> <supplied>in</supplied> partes <choice><reg>tres</reg><orig>tris</orig></choice><note place="foot">Vide <hi rend="bold">codicem</hi> et <app><lem>Gallia</lem><rdg>Galia</rdg></app> <foreign xml:lang="grc">λόγος</foreign></note>.</p>
    </div>
    <div type="textpart" subtype="section" n="2">
      <p>Quarum <q rend="single; smallcaps">unam</q> incolunt <persName><surname>Belgae</surname></persName>, <add>aliam</add> <placeName>Aquitani</placeName> <date>Kal. Ian.</date> <num>III</num> <gap/> <foreign xml:lang="greek">logos</foreign> <note target="n_ext"/>.</p>
      <note xml:id="n_ext">Detached <hi rend="sup">2</hi> note</note>
    </div>
  </div>
  <div type="textpart" subtype="chapter" n="2">
    <div type="textpart" subtype="section" n="1">
      <p><quote rend="blockquote">Inscius <emph rend="italic">poeta</emph> canit</quote> et <abbr>C.<expan><ex>Gaius</ex></expan></abbr> <said who="Caesar">dixit</said>:</p>
      <lg>
        <l>Arma virumque cano</l>
        <l rend="indent">Troiae qui primus ab oris</l>
      </lg>
    </div>
  </div>
  <div type="textpart" subtype="chapter" n="3">
    <div type="textpart" subtype="section" n="1">
      <list type="simple">
        <headLabel>Consules</headLabel>
        <label>I</label>
        <item>Cicero <date>63 BC</date></item>
      </list>
    </div>
  </div>
</div>`;

const VERSE_BODY = `<div type="edition" n="urn:cts:latinLit:phi0472.phi001.perseus-lat2">
  <div type="textpart" subtype="poem" n="1">
    <l n="1" part="I">Cui dono lepidum</l>
    <l n="2" part="F">novum libellum</l>
    <l n="3" rend="indent">Arida modo <hi rend="overline">X</hi> pumice expolitum?</l>
  </div>
</div>`;

describe("serializeTeiSnippet", () => {
  it("serializes compact XML and escapes special characters", () => {
    const node = parseRawXml(
      `<p rend="align(indent)">Hello   \n  <hi rend="italic">world</hi> <gap/></p>`,
      { keepWhitespace: true }
    );
    expect(serializeTeiSnippet(node)).toBe(
      `<p rend="align(indent)">Hello <hi rend="italic">world</hi> <gap/></p>`
    );
  });

  it("clips long snippets cleanly", () => {
    const node = parseRawXml(`<p>${"abcdefghij".repeat(10)}</p>`);
    const clipped = serializeTeiSnippet(node, 30);
    expect(clipped.endsWith("…")).toBe(true);
    expect(clipped.length).toBe(31);
  });
});

describe("analyzeWorkForGallery", () => {
  it("extracts content elements, note elements, @rend, attributes, and embedded verse in prose", () => {
    const analyzed = analyzeWorkForGallery({
      workId: LatinWorks.CAESAR_DBG,
      rawXml: makeTei({
        title: "De bello Gallico",
        author: "Julius Caesar",
        body: RICH_PROSE_BODY,
      }),
      onboarded: true,
    });

    const { spotCheck, kinds } = analyzed;
    expect(spotCheck.workId).toBe(LatinWorks.CAESAR_DBG);
    expect(spotCheck.author).toBe("Julius Caesar");
    expect(spotCheck.urlAuthor).toBe("caesar");
    expect(spotCheck.urlName).toBe("de_bello_gallico");
    expect(spotCheck.onboarded).toBe(true);
    expect(spotCheck.pageCount).toBe(3);
    expect(spotCheck.pages.first?.pageId).toBe("1");
    expect(spotCheck.pages.middle?.pageId).toBe("2");
    expect(spotCheck.pages.last?.pageId).toBe("3");
    expect(spotCheck.pages.first?.readerUrl).toBe(
      "/work/caesar/de_bello_gallico/1"
    );

    // Content elements
    for (const elem of [
      "head",
      "p",
      "hi",
      "del",
      "supplied",
      "choice",
      "reg",
      "orig",
      "note",
      "q",
      "persName",
      "surname",
      "add",
      "placeName",
      "date",
      "num",
      "gap",
      "foreign",
      "quote",
      "emph",
      "abbr",
      "expan",
      "ex",
      "said",
      "lg",
      "l",
      "list",
      "headLabel",
      "label",
      "item",
    ]) {
      expect(kinds.has(elem)).toBe(true);
    }

    // Note elements (both inline note and target/xml:id note)
    expect(kinds.get("note:hi")?.occurrences).toBe(2);
    expect(kinds.has("note:app")).toBe(true);
    expect(kinds.has("note:lem")).toBe(true);
    expect(kinds.has("note:rdg")).toBe(true);
    expect(kinds.has("note:foreign")).toBe(true);

    // element@rend in body and notes
    expect(kinds.has("p@align(indent)")).toBe(true);
    expect(kinds.has("hi@italic")).toBe(true);
    expect(kinds.has("hi@bold")).toBe(true);
    expect(kinds.has("note:hi@bold")).toBe(true);
    expect(kinds.has("hi@sup")).toBe(true);
    expect(kinds.has("note:hi@sup")).toBe(true);
    expect(kinds.has("q@single; smallcaps")).toBe(true);
    expect(kinds.has("q@single")).toBe(true);
    expect(kinds.has("q@smallcaps")).toBe(true);
    expect(kinds.has("quote@blockquote")).toBe(true);
    expect(kinds.has("l@indent")).toBe(true);

    // Key structural/attribute kinds
    expect(kinds.has("note@target")).toBe(true);
    expect(kinds.has('note@place="foot"')).toBe(true);
    expect(kinds.has('foreign@xml:lang="grc"')).toBe(true);
    expect(kinds.has('foreign@xml:lang="greek"')).toBe(true);

    // Complex layouts
    expect(kinds.has("embedded-verse")).toBe(true);
    expect(kinds.has("dialogue-speaker")).toBe(true);

    // Verify exemplar details and URLs
    const delEx = kinds.get("del")!.candidates[0];
    expect(delEx.sectionId).toBe("1.1");
    expect(delEx.pageId).toBe("1");
    expect(delEx.readerUrl).toBe("/work/caesar/de_bello_gallico/1#sec-1.1");
    expect(delEx.teiSnippet).toBe("<del>divisa</del>");
    expect(delEx.renderedHtml).toContain("[divisa]");
    expect(delEx.renderedHtml).toContain("⟨in⟩");

    // Verify note exemplar includes both section HTML and rendered footnote HTML
    const noteBoldEx = kinds.get("note:hi@bold")!.candidates[0];
    expect(noteBoldEx.inNote).toBe(true);
    expect(noteBoldEx.readerUrl).toBe(
      "/work/caesar/de_bello_gallico/1#sec-1.1"
    );
    expect(noteBoldEx.renderedHtml).toContain('class="reader-note-ref"');
    expect(noteBoldEx.renderedHtml).toContain('class="reader-notes"');
    expect(noteBoldEx.renderedHtml).toContain(
      '<span class="bold">codicem</span>'
    );

    // Verify note@target snippet shows both marker and detached target body
    const noteTargetEx = kinds.get("note@target")!.candidates[0];
    expect(noteTargetEx.teiSnippet).toContain('<note target="n_ext"/>');
    expect(noteTargetEx.teiSnippet).toContain('<note xml:id="n_ext">');
    expect(noteTargetEx.renderedHtml).toContain("Detached");
  });

  it("extracts split verse lines (l@part) in verse works without flagging embedded-verse", () => {
    const analyzed = analyzeWorkForGallery({
      workId: LatinWorks.CATULLUS,
      rawXml: makeTei({
        title: "Carmina",
        author: "C. Valerius Catullus",
        encodingDesc: VERSE_ENCODING_DESC,
        body: VERSE_BODY,
      }),
      onboarded: true,
    });

    const { kinds } = analyzed;
    expect(kinds.has("l@part")).toBe(true);
    expect(kinds.get("l@part")?.occurrences).toBe(2);
    expect(kinds.has('l@part="I"')).toBe(true);
    expect(kinds.has('l@part="F"')).toBe(true);
    expect(kinds.has("hi@overline")).toBe(true);
    // Verse work should not record `<l>` as embedded-verse in prose
    expect(kinds.has("embedded-verse")).toBe(false);

    const splitEx = kinds.get('l@part="I"')!.candidates[0];
    expect(splitEx.sectionId).toBe("1.1");
    expect(splitEx.pageId).toBe("1");
    expect(splitEx.readerUrl).toBe("/work/catullus/carmina/1#sec-1.1");
    // Includes adjacent split line row for visual context
    expect(splitEx.renderedHtml).toContain("Cui dono lepidum");
    expect(splitEx.renderedHtml).toContain("novum libellum");
  });
});

describe("buildGalleryReportFromInputs & --max-examples diversity", () => {
  const makeSimpleWorkInput = (
    workId: string,
    title: string,
    word: string,
    onboarded = true
  ): GalleryWorkInput => ({
    workId,
    onboarded,
    rawXml: makeTei({
      title,
      author: "M. Tullius Cicero",
      body: `<div type="edition" n="urn:x">
        <div type="textpart" subtype="chapter" n="1">
          <div type="textpart" subtype="section" n="1"><p><hi rend="italic">${word}1</hi> <hi rend="italic">${word}2</hi></p></div>
          <div type="textpart" subtype="section" n="2"><p><hi rend="italic">${word}3</hi></p></div>
        </div>
      </div>`,
    }),
  });

  it("caps exemplars at maxExamples and prioritizes distinct works", () => {
    const inputs: GalleryWorkInput[] = [
      makeSimpleWorkInput("phi0474.phi001.perseus-lat2", "Work One", "alpha"),
      makeSimpleWorkInput("phi0474.phi003.perseus-lat2", "Work Two", "beta"),
      makeSimpleWorkInput("phi0474.phi004.perseus-lat2", "Work Three", "gamma"),
      makeSimpleWorkInput(
        "phi9999.phi001.perseus-lat1",
        "Work Four",
        "delta",
        false
      ),
    ];

    const report = buildGalleryReportFromInputs(inputs, {
      label: "test-label",
      maxExamples: 3,
      includeCandidates: true,
    });

    expect(report.totals.worksProcessed).toBe(4);
    expect(report.totals.onboardedCount).toBe(3);
    expect(report.totals.candidateCount).toBe(1);

    const hiItalic = report.kindsByName["hi@italic"];
    expect(hiItalic).toBeDefined();
    expect(hiItalic.workCount).toBe(4);
    expect(hiItalic.occurrenceCount).toBe(12); // 3 per work * 4 works
    expect(hiItalic.examples).toHaveLength(3);

    // Every exemplar must come from a distinct work
    const distinctWorkIds = new Set(hiItalic.examples.map((e) => e.workId));
    expect(distinctWorkIds.size).toBe(3);
  });

  it("takes multiple exemplars from distinct sections of one work when fewer than maxExamples works have a kind", () => {
    const inputs = [
      makeSimpleWorkInput("phi0474.phi001.perseus-lat2", "Solo Work", "solo"),
    ];
    const report = buildGalleryReportFromInputs(inputs, { maxExamples: 2 });
    const hiItalic = report.kindsByName["hi@italic"];
    expect(hiItalic.workCount).toBe(1);
    expect(hiItalic.occurrenceCount).toBe(3);
    expect(hiItalic.examples).toHaveLength(2);
    expect(hiItalic.examples.map((e) => e.sectionId)).toEqual(["1.1", "1.2"]);
  });

  it("supports maxExamples = 0", () => {
    const inputs = [
      makeSimpleWorkInput("phi0474.phi001.perseus-lat2", "Solo Work", "solo"),
    ];
    const report = buildGalleryReportFromInputs(inputs, { maxExamples: 0 });
    expect(report.kindsByName["hi@italic"].examples).toEqual([]);
    expect(selectDiverseExemplars([], 3)).toEqual([]);
  });
});

describe("formatGalleryHtml & formatGalleryMarkdown", () => {
  it("produces valid Markdown and XSS-safe HTML with all required reader CSS classes", () => {
    const report = buildGalleryReportFromInputs(
      [
        {
          workId: LatinWorks.CAESAR_DBG,
          onboarded: true,
          rawXml: makeTei({
            title: 'Bellum &lt;script&gt;alert("xss")&lt;/script&gt;',
            author: 'Caesar &amp; "Friends"',
            body: RICH_PROSE_BODY,
          }),
        },
      ],
      {
        label: "sha1-sha2",
        root: "/corpus/root",
        latinLitCommit: "aaaa1111",
        morcusCommit: "bbbb2222",
        maxExamples: 3,
      }
    );

    const md = formatGalleryMarkdown(report);
    expect(md).toContain("# Library Exemplar Review Gallery: `sha1-sha2`");
    expect(md).toContain("## 1. Markup Kind Exemplars");
    expect(md).toContain("## 2. Per-Work Spot-Check Index");
    expect(md).toContain("/work/caesar_&_\"friends\"/");

    const html = formatGalleryHtml(report);
    expect(html).toContain("<!DOCTYPE html>");
    // Raw <script> in title or TEI snippets must be escaped
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    // Raw TEI tags inside <pre class="tei-snippet"> must be escaped
    expect(html).toContain("&lt;del&gt;divisa&lt;/del&gt;");
    // Rendered reader HTML is placed cleanly in .reader-preview
    expect(html).toContain('<div class="reader-preview reader-view">');

    // All required reader typography/indentation classes are defined in the stylesheet
    for (const cssClass of [
      ".reader-line",
      ".indent",
      ".indent-para",
      ".blockquote",
      ".smallcaps",
      ".uppercase",
      ".overline",
      ".bold",
      ".superscript",
      ".italic",
      ".reader-subheading",
      ".reader-gap",
    ]) {
      expect(html).toContain(cssClass);
    }
  });

  it("builds reader URLs with and without sectionId", () => {
    expect(buildReaderSectionUrl("caesar", "dbg", "1.2", "1.2.3")).toBe(
      "/work/caesar/dbg/1.2#sec-1.2.3"
    );
    expect(buildReaderSectionUrl("caesar", "dbg", "1.2")).toBe(
      "/work/caesar/dbg/1.2"
    );
  });
});

describe("buildGallery filesystem & library_cli integration", () => {
  let tmpDir: string;
  let rootDir: string;
  let outDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "morcus-gallery-test-"));
    rootDir = path.join(tmpDir, "latinLit");
    outDir = path.join(tmpDir, "out");

    // 1. Onboarded work (Caesar DBG)
    const caesarDir = path.join(rootDir, "data", "phi0448", "phi001");
    fs.mkdirSync(caesarDir, { recursive: true });
    fs.writeFileSync(
      path.join(caesarDir, `${LatinWorks.CAESAR_DBG}.xml`),
      makeTei({
        title: "De bello Gallico",
        author: "Julius Caesar",
        body: RICH_PROSE_BODY,
      })
    );

    // 2. Non-onboarded candidate work that passes processTei2
    const candOkDir = path.join(rootDir, "data", "phi9999", "phi001");
    fs.mkdirSync(candOkDir, { recursive: true });
    fs.writeFileSync(
      path.join(candOkDir, "phi9999.phi001.perseus-lat1.xml"),
      makeTei({
        title: "Noctes Atticae",
        author: "Aulus Gellius",
        body: `<div type="edition" n="urn:x">
          <div type="textpart" subtype="chapter" n="1">
            <div type="textpart" subtype="section" n="1"><p>Candidate <hi rend="uppercase">text</hi>.</p></div>
          </div>
        </div>`,
      })
    );

    // 3. Non-onboarded candidate work that fails processTei2 (unknown tag)
    const candFailDir = path.join(rootDir, "data", "phi9999", "phi002");
    fs.mkdirSync(candFailDir, { recursive: true });
    fs.writeFileSync(
      path.join(candFailDir, "phi9999.phi002.perseus-lat1.xml"),
      makeTei({
        title: "Broken Work",
        author: "Unknown",
        body: `<div type="edition" n="urn:x">
          <div type="textpart" subtype="chapter" n="1">
            <div type="textpart" subtype="section" n="1"><p><unknownTag>boom</unknownTag></p></div>
          </div>
        </div>`,
      })
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes only onboarded works by default, and includes V1-passing candidates with includeCandidates", () => {
    const defaultResult = buildGallery({
      root: rootDir,
      out: outDir,
      label: "default-run",
      quiet: true,
    });
    expect(defaultResult.report.works.map((w) => w.workId)).toEqual([
      LatinWorks.CAESAR_DBG,
    ]);
    expect(
      fs.existsSync(path.join(defaultResult.dir, "gallery.json"))
    ).toBe(true);
    expect(fs.existsSync(path.join(defaultResult.dir, "gallery.md"))).toBe(
      true
    );
    expect(fs.existsSync(path.join(defaultResult.dir, "index.html"))).toBe(
      true
    );

    const candResult = buildGallery({
      root: rootDir,
      out: outDir,
      label: "cand-run",
      includeCandidates: true,
      quiet: true,
    });
    expect(candResult.report.works.map((w) => w.workId)).toEqual([
      LatinWorks.CAESAR_DBG,
      "phi9999.phi001.perseus-lat1",
    ]);
    expect(candResult.report.totals.onboardedCount).toBe(1);
    expect(candResult.report.totals.candidateCount).toBe(1);
    expect(candResult.report.totals.failedCount).toBe(1);
    expect(candResult.report.failures["phi9999.phi002.perseus-lat1"]).toMatch(
      /Unknown node/
    );
    expect(candResult.report.kindsByName["hi@uppercase"]).toBeDefined();
  });

  it("filters to specific --works when requested and validates arguments", () => {
    const filtered = buildGallery({
      root: rootDir,
      out: outDir,
      label: "filtered-run",
      works: ["phi9999.phi001.perseus-lat1"],
      quiet: true,
    });
    expect(filtered.report.works.map((w) => w.workId)).toEqual([
      "phi9999.phi001.perseus-lat1",
    ]);

    expect(() =>
      buildGallery({
        root: rootDir,
        out: outDir,
        label: "../bad",
        quiet: true,
      })
    ).toThrow(/Invalid label/);

    expect(() =>
      buildGallery({
        root: rootDir,
        out: "build/gallery-out",
        label: "test",
        quiet: true,
      })
    ).toThrow(/Refusing to write a gallery under build/);
  });

  it("wires the gallery action and all flags through library_cli.ts", async () => {
    expect(LIBRARY_ACTIONS.some((a) => a.name === "gallery")).toBe(true);
    expect(optString("abc")).toBe("abc");
    expect(optString(undefined)).toBeUndefined();
    expect(optInt(4)).toBe(4);
    expect(optInt("5")).toBe(5);
    expect(optInt("not-a-num")).toBeUndefined();
    expect(optInt(undefined)).toBeUndefined();

    const parser = new ArgumentParser();
    configureLibraryParser(parser);
    const parsed = parser.parse_args([
      "gallery",
      "--root",
      rootDir,
      "--label",
      "cli-run",
      "--out",
      outDir,
      "--works",
      `${LatinWorks.CAESAR_DBG},phi9999.phi001.perseus-lat1`,
      "--include-candidates",
      "--max-examples",
      "1",
    ]);

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const ok = await runLibraryCli(parsed);
      expect(ok).toBe(true);
    } finally {
      logSpy.mockRestore();
    }

    const jsonPath = path.join(outDir, "cli-run", "gallery.json");
    expect(fs.existsSync(jsonPath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(saved.label).toBe("cli-run");
    expect(saved.includeCandidates).toBe(true);
    expect(saved.maxExamples).toBe(1);
    expect(saved.works).toHaveLength(2);
    for (const k of saved.markupKinds) {
      expect(k.examples.length).toBeLessThanOrEqual(1);
    }
  });
});
