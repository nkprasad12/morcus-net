import fs from "fs";
import os from "os";
import path from "path";
import { ArgumentParser } from "argparse";

import { LatinWorks } from "@/common/library/library_constants";
import { parseRawXml } from "@/common/xml/xml_utils";
import {
  analyzeWorkForGallery,
  buildGallery,
  buildGalleryReportFromInputs,
  buildReaderSectionUrl,
  extractNoteListItems,
  filterNotesHtmlToRefs,
  formatGalleryHtml,
  formatGalleryMarkdown,
  normalizePreviewHtml,
  renderGalleryDiffHtml,
  rewriteExemplarIds,
  scopeCssRules,
  scopePreviewHtmlIds,
  selectDiverseExemplars,
  serializeTeiSnippet,
  type GalleryExemplar,
  type GalleryReport,
} from "@/scripts/library/gallery";
import {
  LIBRARY_ACTIONS,
  configureLibraryParser,
  optInt,
  optString,
  runLibraryCli,
} from "@/scripts/library/library_cli";

function makeTei(options: {
  title?: string;
  author?: string;
  refsDecl?: string;
  body: string;
}): string {
  const title = options.title ?? "Test Work";
  const author = options.author ?? "Julius Caesar";
  const refsDecl =
    options.refsDecl ??
    `<refsDecl>
      <state unit="chapter"/>
      <state unit="section"/>
    </refsDecl>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<TEI.2>
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>${title}</title>
        <author>${author}</author>
      </titleStmt>
    </fileDesc>
    <encodingDesc>
      ${refsDecl}
    </encodingDesc>
  </teiHeader>
  <text>
    <body>
      ${options.body}
    </body>
  </text>
</TEI.2>`;
}

const RICH_PROSE_BODY = `<div type="edition" n="urn:cts:latinLit:phi0448.phi001.perseus-lat2">
  <div type="textpart" subtype="chapter" n="1">
    <head rend="align(center)">LIBER PRIMUS</head>
    <div type="textpart" subtype="section" n="1">
      <p rend="align(indent)">
        <milestone unit="chapter" n="1"/>
        Gallia est <hi rend="italic">omnis</hi> <del>divisa</del> <add>in</add> partes
        <num rend="smallcaps">III</num>, <supplied>quarum</supplied> <gap reason="lost" rend="* * *"/>
        <choice><abbr>C.</abbr><expan>Gaius</expan></choice> <reg>caesar</reg>
        <foreign xml:lang="grc">λόγος</foreign> <foreign xml:lang="greek">lo/gos</foreign>
        <w type="lemma">Gallia</w>
        <q rend="single; smallcaps">dixit</q> <emph rend="italic">omnino</emph>.
        <note place="foot">Nota <hi rend="bold">codicem</hi> <hi rend="sup">2</hi> <foreign xml:lang="grc">α</foreign> <w type="lemma">omnis</w> <app><lem>Gallia</lem></app>.</note>
      </p>
    </div>
    <div type="textpart" subtype="section" n="2">
      <p>
        Versus in prosa:
        <quote rend="blockquote">
          <lg>
            <l rend="indent">Arma virumque cano</l>
            <l>Troiae qui primus ab oris</l>
          </lg>
        </quote>
        <said who="#Cicero"><label>M.</label> Sequitur <date>Kal. Ian.</date></said>
        <note target="n_ext"/>
        <note xml:id="n_ext">Detached <q rend="single">target</q> note.</note>
      </p>
    </div>
  </div>
  <div type="textpart" subtype="chapter" n="2">
    <div type="textpart" subtype="section" n="1">
      <p>Caput secundum.</p>
    </div>
  </div>
  <div type="textpart" subtype="chapter" n="3">
    <div type="textpart" subtype="section" n="1">
      <p>Caput tertium.</p>
    </div>
  </div>
</div>`;

describe("serializeTeiSnippet & extractNoteListItems", () => {
  it("serializes compact XML and escapes special characters", () => {
    const node = parseRawXml(
      `<p rend="align(indent)">Gallia &amp; <hi rend="italic">omnis</hi><!-- comment --><gap reason="lost"/></p>`,
      { keepWhitespace: true }
    );
    const snippet = serializeTeiSnippet(node);
    expect(snippet).toBe(
      `<p rend="align(indent)">Gallia &amp; <hi rend="italic">omnis</hi><gap reason="lost"/></p>`
    );
  });

  it("clips long snippets cleanly", () => {
    const node = parseRawXml(`<p>${"abcdefghij ".repeat(40)}</p>`);
    const snippet = serializeTeiSnippet(node, 50);
    expect(snippet.length).toBe(51);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("extracts balanced <li class='reader-note'> items even when notes contain nested <li> tags", () => {
    const notesHtml = `<aside class="reader-notes"><ol class="reader-notes-list"><li class="reader-note" id="note-n1"><a class="reader-note-backref" href="#noteref-n1">1</a><div class="reader-note-body">Outer <ul><li>Nested item</li></ul> end 1</div></li><li class="reader-note" id="note-n2"><a class="reader-note-backref" href="#noteref-n2">2</a><div class="reader-note-body">Note 2</div></li></ol></aside>`;
    const items = extractNoteListItems(notesHtml);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("<ul><li>Nested item</li></ul> end 1");
    expect(items[1]).toContain("Note 2");
  });
});

describe("analyzeWorkForGallery", () => {
  it("extracts body elements/rends separately from note-elements/note-rends and renders full pages for layout kinds", () => {
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
    expect(spotCheck.urlAuthor).toBe("caesar");
    expect(spotCheck.urlName).toBe("de_bello_gallico");
    expect(spotCheck.pageCount).toBe(3);
    expect(spotCheck.pages.first?.pageId).toBe("1");
    expect(spotCheck.pages.middle?.pageId).toBe("2");
    expect(spotCheck.pages.last?.pageId).toBe("3");

    // Content elements (body only)
    for (const el of [
      "head",
      "p",
      "hi",
      "del",
      "add",
      "num",
      "supplied",
      "gap",
      "choice",
      "abbr",
      "expan",
      "reg",
      "foreign",
      "w",
      "q",
      "emph",
      "note",
      "quote",
      "lg",
      "l",
      "said",
      "label",
      "date",
    ]) {
      expect(kinds.has(el)).toBe(true);
      expect(kinds.get(el)?.category).toBe("element");
    }
    // `app` and `lem` appear only inside `<note>` in RICH_PROSE_BODY, so they must NOT leak into body `element`
    expect(kinds.has("app")).toBe(false);
    expect(kinds.has("lem")).toBe(false);

    // Note elements
    for (const noteEl of [
      "note:hi",
      "note:foreign",
      "note:w",
      "note:app",
      "note:lem",
      "note:q",
    ]) {
      expect(kinds.has(noteEl)).toBe(true);
      expect(kinds.get(noteEl)?.category).toBe("note-element");
    }

    // R1: Body element@rend vs note:element@rend separation
    expect(kinds.has("p@align(indent)")).toBe(true);
    expect(kinds.has("hi@italic")).toBe(true);
    expect(kinds.has("q@single; smallcaps")).toBe(true);
    expect(kinds.has("q@single")).toBe(true);
    expect(kinds.has("q@smallcaps")).toBe(true);
    expect(kinds.has("quote@blockquote")).toBe(true);
    expect(kinds.has("l@indent")).toBe(true);

    // `hi@bold` and `hi@sup` appear ONLY inside `<note>` in RICH_PROSE_BODY:
    // they must be in `note-rend` (`note:hi@bold`, `note:hi@sup`) and absent from body `rend`.
    expect(kinds.has("note:hi@bold")).toBe(true);
    expect(kinds.has("note:hi@sup")).toBe(true);
    expect(kinds.has("hi@bold")).toBe(false);
    expect(kinds.has("hi@sup")).toBe(false);

    // Symmetric structural/attribute kinds across body and notes
    expect(kinds.has("note@target")).toBe(true);
    expect(kinds.has('note@place="foot"')).toBe(true);
    expect(kinds.has('foreign@xml:lang="grc"')).toBe(true);
    expect(kinds.has('foreign@xml:lang="greek"')).toBe(true);
    expect(kinds.has('milestone@unit="chapter"')).toBe(true);
    expect(kinds.has('w@type="lemma"')).toBe(true);
    expect(kinds.get('w@type="lemma"')?.occurrences).toBe(2); // 1 in body + 1 in note

    // Complex layouts (full page context)
    expect(kinds.has("embedded-verse")).toBe(true);
    expect(kinds.has("dialogue-speaker")).toBe(true);
    const embeddedVerseEx = kinds.get("embedded-verse")!.candidates[0];
    // Full page 1 contains both section 1.1 ("Gallia") and section 1.2 ("Arma virumque cano")
    expect(embeddedVerseEx.renderedHtml).toContain("Gallia");
    expect(embeddedVerseEx.renderedHtml).toContain("Arma virumque cano");

    // Verify exemplar details and URLs
    const delEx = kinds.get("del")!.candidates[0];
    expect(delEx.sectionId).toBe("1.1");
    expect(delEx.pageId).toBe("1");
    expect(delEx.readerUrl).toBe("/work/caesar/de_bello_gallico/1#sec-1.1");
    expect(delEx.teiSnippet).toBe("<del>divisa</del>");
    expect(delEx.renderedHtml).toContain('<div class="reader-passage">');
    expect(delEx.renderedHtml).toContain("[divisa]");
    expect(delEx.renderedHtml).toContain("⟨quarum⟩");

    // Verify note exemplar includes both `<div class="reader-passage">` and sibling `<aside class="reader-notes">`
    const noteBoldEx = kinds.get("note:hi@bold")!.candidates[0];
    expect(noteBoldEx.inNote).toBe(true);
    expect(noteBoldEx.readerUrl).toBe(
      "/work/caesar/de_bello_gallico/1#sec-1.1"
    );
    expect(noteBoldEx.renderedHtml).toContain('<div class="reader-passage">');
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

  it("aligns note exemplars across inline notes, target notes, and whitespace-only <note n>", () => {
    const analyzed = analyzeWorkForGallery({
      workId: LatinWorks.CAESAR_DBG,
      rawXml: makeTei({
        title: "De bello Gallico",
        author: "Julius Caesar",
        body: `<div type="edition" n="urn:x">
          <div type="textpart" subtype="chapter" n="1">
            <div type="textpart" subtype="section" n="1">
              <p>
                Text one <note place="foot"><hi rend="italic">first inline note</hi></note>
                middle <note target="n_second"/>
                end <note place="foot"><emph rend="italic">third inline note</emph></note>
                <note n="unreferenced_whitespace">   </note>
                <note xml:id="n_second"><quote rend="smallcaps">second target note</quote></note>
              </p>
            </div>
          </div>
        </div>`,
      }),
      onboarded: true,
    });

    const firstEx = analyzed.kinds.get("note:hi@italic")!.candidates[0];
    const secondEx = analyzed.kinds.get("note:quote@smallcaps")!.candidates[0];
    const thirdEx = analyzed.kinds.get("note:emph@italic")!.candidates[0];

    expect(firstEx.renderedHtml).toContain("first inline note");
    expect(firstEx.renderedHtml).not.toContain("second target note");
    expect(firstEx.renderedHtml).not.toContain("third inline note");

    expect(secondEx.renderedHtml).toContain("second target note");
    expect(secondEx.renderedHtml).not.toContain("first inline note");
    expect(secondEx.renderedHtml).not.toContain("third inline note");

    expect(thirdEx.renderedHtml).toContain("third inline note");
    expect(thirdEx.renderedHtml).not.toContain("first inline note");
    expect(thirdEx.renderedHtml).not.toContain("second target note");
  });

  it("extracts split verse lines (l@part) in verse works without flagging embedded-verse", () => {
    const analyzed = analyzeWorkForGallery({
      workId: LatinWorks.CATULLUS,
      rawXml: makeTei({
        title: "Carmina",
        author: "C. Valerius Catullus",
        refsDecl: `<refsDecl>
          <state unit="poem"/>
          <state unit="line"/>
        </refsDecl>`,
        body: `<div type="edition" n="urn:cts:latinLit:phi0472.phi001.perseus-lat2">
          <div type="textpart" subtype="poem" n="1">
            <l n="1" part="I">Cui dono lepidum</l>
            <l n="1b" part="M">novum</l>
            <l n="2" part="F">libellum</l>
            <l n="3" part="N">Arida modo pumice expolitum?</l>
          </div>
        </div>`,
      }),
      onboarded: true,
    });

    const { kinds } = analyzed;
    expect(kinds.has("embedded-verse")).toBe(false);
    expect(kinds.has("l@part")).toBe(true);
    expect(kinds.get("l@part")?.occurrences).toBe(3); // I, M, F (part="N" excluded from split-line layout)
    expect(kinds.has('l@part="I"')).toBe(true);
    expect(kinds.has('l@part="M"')).toBe(true);
    expect(kinds.has('l@part="F"')).toBe(true);
    expect(kinds.has('l@part="N"')).toBe(true);
    const partIEx = kinds.get('l@part="I"')!.candidates[0];
    // R5b: attr l@part="I" uses matched row ±1 (lines 1 and 1b, not line 3) and marks gallery-target
    expect(partIEx.renderedHtml).toContain(
      '<div class="reader-section gallery-target section-verse" id="sec-1.1">'
    );
    expect(partIEx.renderedHtml).toContain("Cui dono lepidum");
    expect(partIEx.renderedHtml).toContain("novum");
    expect(partIEx.renderedHtml).not.toContain("Arida modo pumice expolitum?");

    // R5b: layout l@part keeps full page and marks the matched row with gallery-target
    const layoutPartEx = kinds.get("l@part")!.candidates[0];
    expect(layoutPartEx.renderedHtml).toContain(
      '<div class="reader-section gallery-target section-verse" id="sec-1.1">'
    );
    expect(layoutPartEx.renderedHtml).toContain("Cui dono lepidum");
    expect(layoutPartEx.renderedHtml).toContain("Arida modo pumice expolitum?");
  });
});

describe("buildGalleryReportFromInputs & --max-examples diversity", () => {
  it("caps exemplars at maxExamples and spreads across distinct authors and works", () => {
    // 2 Cicero works + 1 Caesar work + 1 Catullus work: maxExamples=3 should pick
    // 1 Caesar, 1 Catullus, and 1 Cicero (3 distinct authors) rather than 2 Ciceros.
    const inputs = [
      {
        workId: "phi0474.phi001.perseus-lat2",
        onboarded: true,
        rawXml: makeTei({
          title: "Pro Quinctio",
          author: "M. Tullius Cicero",
          body: `<div type="edition" n="urn:1">
            <div type="textpart" subtype="chapter" n="1">
              <div type="textpart" subtype="section" n="1"><p><del>cic1</del></p></div>
            </div>
          </div>`,
        }),
      },
      {
        workId: "phi0474.phi002.perseus-lat2",
        onboarded: true,
        rawXml: makeTei({
          title: "Pro Roscio",
          author: "M. Tullius Cicero",
          body: `<div type="edition" n="urn:2">
            <div type="textpart" subtype="chapter" n="1">
              <div type="textpart" subtype="section" n="1"><p><del>cic2</del></p></div>
            </div>
          </div>`,
        }),
      },
      {
        workId: LatinWorks.CAESAR_DBG,
        onboarded: true,
        rawXml: makeTei({
          title: "De bello Gallico",
          author: "Julius Caesar",
          body: `<div type="edition" n="urn:3">
            <div type="textpart" subtype="chapter" n="1">
              <div type="textpart" subtype="section" n="1"><p><del>caes</del></p></div>
            </div>
          </div>`,
        }),
      },
      {
        workId: LatinWorks.CATULLUS,
        onboarded: true,
        rawXml: makeTei({
          title: "Carmina",
          author: "C. Valerius Catullus",
          body: `<div type="edition" n="urn:4">
            <div type="textpart" subtype="chapter" n="1">
              <div type="textpart" subtype="section" n="1"><p><del>cat</del></p></div>
            </div>
          </div>`,
        }),
      },
    ];

    const report = buildGalleryReportFromInputs(inputs, { maxExamples: 3 });
    const delKind = report.kindsByName["del"];
    expect(delKind).toBeDefined();
    expect(delKind.workCount).toBe(4);
    expect(delKind.occurrenceCount).toBe(4);
    expect(delKind.examples).toHaveLength(3);
    const distinctAuthors = new Set(delKind.examples.map((e) => e.author));
    expect(distinctAuthors.size).toBe(3);
  });

  it("takes multiple exemplars from distinct sections of one work when fewer than maxExamples works have a kind", () => {
    const inputs = [
      {
        workId: LatinWorks.CAESAR_DBG,
        onboarded: true,
        rawXml: makeTei({
          title: "De bello Gallico",
          author: "Julius Caesar",
          body: `<div type="edition" n="urn:1">
            <div type="textpart" subtype="chapter" n="1">
              <div type="textpart" subtype="section" n="1"><p><del>a</del> <del>a2</del></p></div>
              <div type="textpart" subtype="section" n="2"><p><del>b</del></p></div>
              <div type="textpart" subtype="section" n="3"><p><del>c</del></p></div>
            </div>
          </div>`,
        }),
      },
    ];

    const report = buildGalleryReportFromInputs(inputs, { maxExamples: 3 });
    const delKind = report.kindsByName["del"];
    expect(delKind.workCount).toBe(1);
    expect(delKind.occurrenceCount).toBe(4);
    expect(delKind.examples.map((e) => e.sectionId)).toEqual([
      "1.1",
      "1.2",
      "1.3",
    ]);
  });

  it("supports maxExamples = 0 and fails loudly if an onboarded work fails", () => {
    const dummy: GalleryExemplar = {
      workId: "w1",
      workTitle: "T",
      author: "A",
      sectionId: "1",
      pageId: "1",
      readerUrl: "/work/a/t/1#sec-1",
      url: "/work/a/t/1#sec-1",
      teiSnippet: "<p/>",
      renderedHtml: "<div/>",
    };
    expect(selectDiverseExemplars([[dummy]], 0)).toEqual([]);
    expect(selectDiverseExemplars([], 3)).toEqual([]);

    expect(() =>
      buildGalleryReportFromInputs([
        {
          workId: LatinWorks.CAESAR_DBG,
          onboarded: true,
          rawXml: makeTei({
            body: `<div type="edition" n="urn:x"><div type="textpart" subtype="chapter" n="1"><div type="textpart" subtype="section" n="1"><p><unknownTag>boom</unknownTag></p></div></div></div>`,
          }),
        },
      ])
    ).toThrow(/Onboarded work 'phi0448\.phi001\.perseus-lat2' failed/);
  });
});

describe("formatGalleryHtml & formatGalleryMarkdown", () => {
  it("produces valid Markdown and XSS-safe HTML with scoped IDs, failure tables, and .reader-passage CSS scoping", () => {
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
        {
          workId: "phi9999.phi002.perseus-lat1",
          onboarded: false,
          rawXml: makeTei({
            title: "Broken Candidate",
            author: "Anon",
            body: `<div type="edition" n="urn:x"><div type="textpart" subtype="chapter" n="1"><div type="textpart" subtype="section" n="1"><p><unknownTag>boom</unknownTag></p></div></div></div>`,
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
    expect(md).toContain("## 3. Skipped / Failed Candidate Works (1)");
    expect(md).toContain("phi9999.phi002.perseus-lat1");
    expect(md).toContain('/work/caesar_&_"friends"/');

    const html = formatGalleryHtml(report);
    expect(html).toContain("<!DOCTYPE html>");
    // Raw <script> in title or TEI snippets must be escaped
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    // Raw TEI tags inside <pre class="tei-snippet"> must be escaped
    expect(html).toContain("&lt;del&gt;divisa&lt;/del&gt;");
    // Rendered reader HTML is placed cleanly in .reader-preview with .reader-section, .gallery-target, and .reader-passage
    expect(html).toContain(
      '<div class="reader-preview reader-view"><div class="reader-section gallery-target"'
    );
    expect(html).toContain('<div class="reader-passage">');
    expect(html).toContain(".reader-section.gallery-target");
    expect(html).toContain('preview.querySelector(".gallery-target")');
    // Failures section is rendered in HTML
    expect(html).toContain('<section id="failures">');
    expect(html).toContain("phi9999.phi002.perseus-lat1");

    // R2: All required reader typography/indentation classes are scoped under :is(.reader-passage, .reader-notes, .reader-translation-text)
    for (const cssClass of [
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .reader-line",
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .indent",
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .indent-para",
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .blockquote",
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .smallcaps",
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .uppercase",
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .overline",
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .bold",
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .superscript",
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .italic",
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .reader-subheading",
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .reader-gap",
    ]) {
      expect(html).toContain(cssClass);
    }

    // R7: Verify zero duplicate HTML id="..." attributes across the entire document
    const ids = [...html.matchAll(/(?<=\s)id="([^"]+)"/g)].map((m) => m[1]);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBeGreaterThan(20);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("builds reader URLs with and without sectionId and scopes preview HTML IDs", () => {
    expect(buildReaderSectionUrl("caesar", "dbg", "1.2", "1.2.3")).toBe(
      "/work/caesar/dbg/1.2#sec-1.2.3"
    );
    expect(buildReaderSectionUrl("caesar", "dbg", "1.2")).toBe(
      "/work/caesar/dbg/1.2"
    );
    const scoped = scopePreviewHtmlIds(
      `<a id="noteref-n1" href="#note-n1">1</a><aside aria-labelledby="reader-notes-heading"><h2 id="reader-notes-heading">Notes</h2><li id="note-n1"><a href="#noteref-n1">1</a></li></aside>`,
      "ex-0-1-0"
    );
    expect(scoped).toContain('id="ex-0-1-0-noteref-n1"');
    expect(scoped).toContain('href="#ex-0-1-0-note-n1"');
    expect(scoped).toContain('aria-labelledby="ex-0-1-0-reader-notes-heading"');
    expect(scoped).toContain('id="ex-0-1-0-note-n1"');
    expect(scoped).toContain('href="#ex-0-1-0-noteref-n1"');
  });

  it("includes :is(.reader-passage, .reader-notes, .reader-translation-text) rendition rules in gallery HTML", () => {
    const report = buildGalleryReportFromInputs([], {
      label: "test-renditions",
      root: "/corpus/root",
      latinLitCommit: "aaaa1111",
      morcusCommit: "bbbb2222",
      maxExamples: 1,
    });
    const html = formatGalleryHtml(report);
    expect(html).toContain(
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .italic"
    );
    expect(html).toContain(
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .bold"
    );
    expect(html).toContain(
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .smallcaps"
    );
    expect(html).toContain(
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .overline"
    );
    expect(html).toContain(
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .superscript"
    );
  });

  it("renders sticky-header scroll offsets and review tracking controls in gallery HTML", () => {
    const report = buildGalleryReportFromInputs(
      [
        {
          workId: LatinWorks.CAESAR_DBG,
          onboarded: true,
          rawXml: makeTei({
            title: "De bello Gallico",
            author: "Julius Caesar",
            body: RICH_PROSE_BODY,
          }),
        },
      ],
      {
        label: "test-review-controls",
        root: "/corpus/root",
        latinLitCommit: "aaaa1111",
        morcusCommit: "bbbb2222",
        maxExamples: 1,
      }
    );
    const html = formatGalleryHtml(report);

    // Sticky top gallery header and non-sticky card headers
    expect(html).toContain("scroll-padding-top: var(--gallery-header-h, 8.5rem);");
    expect(html).toContain("scroll-margin-top: var(--gallery-header-h, 8.5rem);");
    expect(html).toContain("--gallery-header-h");
    expect(html).toContain("overflow: hidden;");
    expect(html).not.toContain("top: var(--gallery-header-h, 52px);");

    // Target highlight removed: normal reader colors with zero outline or background tint
    expect(html).toContain(".reader-preview .gallery-target");
    expect(html).not.toContain("#0284c7");
    expect(html).not.toContain("outline: 2px dashed");

    // Reader block reset margin: 0 and text-muted color
    expect(html).toContain(
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .reader-block"
    );
    expect(html).toContain("margin: 0;");
    expect(html).toContain(
      ":is(.reader-passage, .reader-notes, .reader-translation-text) .text-muted"
    );
    expect(html).toContain("color: var(--text-muted);");

    // Header review controls
    expect(html).toContain('id="gallery-review-progress"');
    expect(html).toContain('id="gallery-hide-reviewed"');
    expect(html).toContain('id="gallery-reset-reviewed"');

    // Category progress & mark-all buttons
    expect(html).toContain('class="cat-progress"');
    expect(html).toContain('data-cat-progress="element"');
    expect(html).toContain('class="gallery-btn mark-cat-btn"');
    expect(html).toContain('data-mark-cat="element"');

    // Kind card and work review checkboxes (both header and footer)
    expect(html).toContain('class="review-checkbox"');
    expect(html).toContain('data-review-id="kind:element:foreign"');
    expect(html).toContain(
      `data-review-id="work:${LatinWorks.CAESAR_DBG}"`
    );
    expect(html).toContain('class="kind-card-footer"');
    expect(html).toContain('class="work-details-footer"');

    // Collapsed and hide styles
    expect(html).toContain('.kind-card[data-reviewed="true"] .exemplar-list');
    expect(html).toContain('.kind-card[data-reviewed="true"] .kind-card-footer');
    expect(html).toContain('.kind-card.is-reviewed .kind-card-footer');
    expect(html).toContain('body[data-hide-reviewed="true"] .kind-card[data-reviewed="true"]');
    expect(html).toContain('body[data-hide-reviewed="true"] section[data-all-reviewed="true"] .cat-all-reviewed-banner');
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

describe("filterNotesHtmlToRefs & Bug 15 Footnote Filtering", () => {
  const sampleNotesHtml = `<aside class="reader-notes" role="doc-endnotes" aria-labelledby="reader-notes-heading">
    <h2 class="reader-notes-heading" id="reader-notes-heading">Notes</h2>
    <ol class="reader-notes-list">
      <li class="reader-note" id="note-n1"><a class="reader-note-backref" href="#noteref-n1">[1]</a><div class="reader-note-body">First critical note.</div></li>
      <li class="reader-note" id="note-n2"><a class="reader-note-backref" href="#noteref-n2">[2]</a><div class="reader-note-body">Second critical note.</div></li>
      <li class="reader-note" id="note-n3"><a class="reader-note-backref" href="#noteref-n3">[3]</a><div class="reader-note-body">Third critical note.</div></li>
    </ol>
  </aside>`;

  it("extracts and retains only the referenced notes matching href or data-note-id", () => {
    // 1. Passage referencing only note 2
    const passageSingle = `<p class="reader-paragraph">Gallia est omnis divisa<a class="reader-note-ref" id="noteref-n2" href="#note-n2"><sup>[2]</sup></a> in partes tres.</p>`;
    const filteredSingle = filterNotesHtmlToRefs(passageSingle, sampleNotesHtml);
    expect(filteredSingle).toBeDefined();
    expect(filteredSingle).toContain('id="note-n2"');
    expect(filteredSingle).toContain("Second critical note.");
    expect(filteredSingle).not.toContain("First critical note.");
    expect(filteredSingle).not.toContain("Third critical note.");

    // 2. Passage referencing notes 1 and 3 with scoped ID prefixes
    const passageScoped = `<p class="reader-paragraph">Text <a class="reader-note-ref" href="#ex-0-1-0-note-n1">[1]</a> and <a class="reader-note-ref" href="#ex-0-1-0-note-n3">[3]</a></p>`;
    const filteredScoped = filterNotesHtmlToRefs(passageScoped, sampleNotesHtml);
    expect(filteredScoped).toBeDefined();
    expect(filteredScoped).toContain('id="note-n1"');
    expect(filteredScoped).toContain('id="note-n3"');
    expect(filteredScoped).not.toContain('id="note-n2"');

    // 3. Passage referencing via data-note-id
    const passageDataAttr = `<p class="reader-paragraph">Word<span data-note-id="n1">[1]</span></p>`;
    const filteredData = filterNotesHtmlToRefs(passageDataAttr, sampleNotesHtml);
    expect(filteredData).toBeDefined();
    expect(filteredData).toContain('id="note-n1"');
    expect(filteredData).not.toContain('id="note-n2"');

    // 4. Passage referencing NO notes
    const passageNoNotes = `<p class="reader-paragraph">No notes here <a class="section-anchor" href="#sec-1.1">1.1</a></p>`;
    expect(filterNotesHtmlToRefs(passageNoNotes, sampleNotesHtml)).toBeUndefined();

    // 5. Undefined or empty pageNotesHtml
    expect(filterNotesHtmlToRefs(passageSingle, undefined)).toBeUndefined();
    expect(filterNotesHtmlToRefs(passageSingle, "")).toBeUndefined();
  });

  it("includes footnotes in makeBodyExemplar when body passage contains footnote references", () => {
    const analyzed = analyzeWorkForGallery({
      workId: LatinWorks.CAESAR_DBG,
      rawXml: makeTei({
        title: "De bello Gallico",
        author: "Julius Caesar",
        body: RICH_PROSE_BODY,
      }),
      onboarded: true,
    });

    // In RICH_PROSE_BODY, section 1.1 contains `<del>divisa</del>` AND a `<note place="foot">Nota codicem...</note>`
    const delEx = analyzed.kinds.get("del")?.candidates[0];
    expect(delEx).toBeDefined();
    expect(delEx!.renderedHtml).toContain('<div class="reader-passage">');
    expect(delEx!.renderedHtml).toContain("[divisa]");
    // Bug 15 fix: body exemplar containing footnote marker [1] now displays the footnote at the bottom!
    expect(delEx!.renderedHtml).toContain('class="reader-notes"');
    expect(delEx!.renderedHtml).toContain("Nota");
    expect(delEx!.renderedHtml).toContain("codicem");

    // Spot-check page 1: contains section 1.1 with note 1, but spot-check preview should NOT dump notes from other sections
    const firstPage = analyzed.spotCheck.pages.first;
    expect(firstPage).toBeDefined();
    expect(firstPage!.previewHtml).toContain('class="reader-notes"');
    expect(firstPage!.previewHtml).toContain("Nota");
  });
});

describe("renderGalleryDiffHtml & Before/After Diff Inspector", () => {
  it("normalizes preview IDs and scopes CSS rules correctly", () => {
    const scoped = scopePreviewHtmlIds(
      '<div id="sec-1.1"><a href="#note-n1">1</a><li id="note-n1">Note</li></div>',
      "ex-0-1-2"
    );
    expect(scoped).toContain('id="ex-0-1-2-sec-1.1"');
    expect(normalizePreviewHtml(scoped)).toBe(
      '<div id="sec-1.1"><a href="#note-n1">1</a><li id="note-n1">Note</li></div>'
    );
    expect(rewriteExemplarIds(scoped, "prefix")).toContain('id="prefix-ex-0-1-2-sec-1.1"');

    const rawCss = `.reader-block { margin: 1em 0; } .reader-line, .indent { display: block; }`;
    const scopedCss = scopeCssRules(rawCss, ".before-scope");
    expect(scopedCss).toContain(".before-scope .reader-block { margin: 1em 0; }");
    expect(scopedCss).toContain(".before-scope .reader-line, .before-scope .indent { display: block; }");
  });

  it("renders a 3-column diff inspector for changed exemplars and 2-column for spot-checks with review tracking", () => {
    const beforeReport: GalleryReport = {
      label: "before-run",
      createdAt: new Date().toISOString(),
      root: "/corpus",
      includeCandidates: false,
      maxExamples: 1,
      totals: {
        worksProcessed: 1,
        onboardedCount: 1,
        candidateCount: 0,
        failedCount: 0,
        markupKindCount: 2,
      },
      markupKinds: [
        {
          kind: "quote@align(blockquote)",
          category: "rend",
          workCount: 1,
          occurrenceCount: 1,
          examples: [
            {
              workId: LatinWorks.CAESAR_DBG,
              workTitle: "De bello Gallico",
              author: "Julius Caesar",
              sectionId: "1.1",
              pageId: "1",
              readerUrl: "/work/caesar/de_bello_gallico/1#sec-1.1",
              url: "/work/caesar/de_bello_gallico/1#sec-1.1",
              teiSnippet: '<quote rend="align(blockquote)"><l>Versus</l></quote>',
              renderedHtml: '<div class="reader-passage"><span class="blockquote">“<span class="reader-line">Versus</span>”</span></div>',
            },
          ],
        },
        {
          kind: "ab",
          category: "element",
          workCount: 1,
          occurrenceCount: 1,
          examples: [
            {
              workId: LatinWorks.CAESAR_DBG,
              workTitle: "De bello Gallico",
              author: "Julius Caesar",
              sectionId: "1.2",
              pageId: "1",
              readerUrl: "/work/caesar/de_bello_gallico/1#sec-1.2",
              url: "/work/caesar/de_bello_gallico/1#sec-1.2",
              teiSnippet: "<ab>omnis</ab>",
              renderedHtml: '<div class="reader-passage"><p class="reader-block">omnis</p></div>',
            },
          ],
        },
        {
          kind: "hi@italics",
          category: "rend",
          workCount: 1,
          occurrenceCount: 1,
          examples: [
            {
              workId: LatinWorks.CAESAR_DBG,
              workTitle: "De bello Gallico",
              author: "Julius Caesar",
              sectionId: "1.3",
              pageId: "1",
              readerUrl: "/work/caesar/de_bello_gallico/1#sec-1.3",
              url: "/work/caesar/de_bello_gallico/1#sec-1.3",
              teiSnippet: '<hi rend="italics">Quid</hi>',
              renderedHtml: '<div class="reader-passage"><p class="reader-paragraph"><strong>C.</strong> <span class="italic">Quid</span></p></div>',
            },
          ],
        },
      ],
      kindsByName: {},
      works: [
        {
          workId: LatinWorks.CAESAR_DBG,
          author: "Julius Caesar",
          title: "De bello Gallico",
          urlAuthor: "caesar",
          urlName: "de_bello_gallico",
          onboarded: true,
          rowCount: 10,
          citableRowCount: 10,
          pageCount: 1,
          textParts: ["chapter", "section"],
          markupKinds: ["quote@align(blockquote)", "ab", "hi@italics"],
          pages: {
            first: {
              role: "first",
              pageId: "1",
              title: "Liber 1",
              sectionCount: 2,
              citationRange: ["1.1", "1.2"],
              readerUrl: "/work/caesar/de_bello_gallico/1",
              url: "/work/caesar/de_bello_gallico/1",
              previewHtml: '<div class="reader-passage">Old spot check passage</div>',
            },
          },
          spotCheckPages: [],
        },
      ],
      failures: {},
    };

    const afterReport: GalleryReport = {
      ...beforeReport,
      label: "after-run",
      markupKinds: [
        {
          kind: "quote@align(blockquote)",
          category: "rend",
          workCount: 1,
          occurrenceCount: 1,
          examples: [
            {
              ...beforeReport.markupKinds[0].examples[0],
              // Spurious quotes removed in after report
              renderedHtml: '<div class="reader-passage"><span class="blockquote"><span class="reader-line">Versus</span></span></div>',
            },
          ],
        },
        {
          kind: "ab",
          category: "element",
          workCount: 1,
          occurrenceCount: 1,
          examples: [
            {
              ...beforeReport.markupKinds[1].examples[0],
              // Markup identical, but is a block kind containing .reader-block whose margin CSS changed
            },
          ],
        },
        {
          kind: "hi@italics",
          category: "rend",
          workCount: 1,
          occurrenceCount: 1,
          examples: [
            {
              ...beforeReport.markupKinds[2].examples[0],
              // Only collateral paragraph and speaker-label changes in the section; <span class="italic">Quid</span> itself is unchanged
              renderedHtml: '<div class="reader-passage"><p class="reader-block"><strong class="smallcaps">C.</strong> <span class="italic">Quid</span></p></div>',
            },
          ],
        },
      ],
      works: [
        {
          ...beforeReport.works[0],
          pages: {
            first: {
              ...beforeReport.works[0].pages.first!,
              previewHtml: '<div class="reader-passage">New spot check passage</div>',
            },
          },
        },
      ],
    };

    const diffHtml = renderGalleryDiffHtml(
      beforeReport,
      afterReport,
      ".reader-block { margin: 1em 0; }"
    );

    expect(diffHtml).toContain("<!DOCTYPE html>");
    expect(diffHtml).toContain("Morcus Library Gallery Diff: <code>before-run</code> &rarr; <code>after-run</code>");

    // Review controls & header
    expect(diffHtml).toContain('id="gallery-review-progress"');
    expect(diffHtml).toContain('id="gallery-hide-reviewed"');
    expect(diffHtml).toContain('id="gallery-reset-reviewed"');

    // Kind cards: includes quote@align(blockquote) and ab, excludes hi@italics (collateral change only)
    expect(diffHtml).toContain('data-review-id="diff-kind:rend:quote@align(blockquote)"');
    expect(diffHtml).toContain('data-review-id="diff-kind:element:ab"');
    expect(diffHtml).not.toContain('data-review-id="diff-kind:rend:hi@italics"');
    expect(diffHtml).toContain('class="kind-card-header"');
    expect(diffHtml).toContain('class="kind-card-footer"');

    // 3-column comparison grid for exemplars
    expect(diffHtml).toContain('class="diff-grid"');
    expect(diffHtml).toContain("Source TEI XML");
    expect(diffHtml).toContain("Before");
    expect(diffHtml).toContain("After");
    expect(diffHtml).toContain("before-scope");
    expect(diffHtml).toContain("after-scope");

    // HTML markup diff details
    expect(diffHtml).toContain('class="html-diff-details"');
    expect(diffHtml).toContain("HTML markup diff");
    expect(diffHtml).toContain("Before HTML");
    expect(diffHtml).toContain("After HTML");

    // Spot-check 2-column grid
    expect(diffHtml).toContain('class="diff-grid diff-grid-2col"');
    expect(diffHtml).toContain(`data-review-id="diff-work:${LatinWorks.CAESAR_DBG}"`);

    // Scoped beforeReaderCss
    expect(diffHtml).toContain(".before-scope .reader-block { margin: 1em 0; }");
  });

  it("handles identical reports with zero differences cleanly", () => {
    const report: GalleryReport = {
      label: "clean-run",
      createdAt: new Date().toISOString(),
      root: "/corpus",
      includeCandidates: false,
      maxExamples: 1,
      totals: {
        worksProcessed: 0,
        onboardedCount: 0,
        candidateCount: 0,
        failedCount: 0,
        markupKindCount: 0,
      },
      markupKinds: [],
      kindsByName: {},
      works: [],
      failures: {},
    };

    const diffHtml = renderGalleryDiffHtml(report, report);
    expect(diffHtml).toContain("No markup kind exemplar differences detected.");
    expect(diffHtml).toContain("No spot-check page differences detected.");
    expect(diffHtml).toContain("Reviewed: 0 / 0 kinds &middot; 0 / 0 works");
  });

  it("writes diff.html when buildGallery is called with compareWith", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-diff-build-test-"));
    try {
      const root = path.join(tmp, "latinLit");
      const caesarDir = path.join(root, "data", "phi0448", "phi001");
      fs.mkdirSync(caesarDir, { recursive: true });
      fs.writeFileSync(
        path.join(caesarDir, `${LatinWorks.CAESAR_DBG}.xml`),
        makeTei({
          title: "De bello Gallico",
          author: "Julius Caesar",
          body: RICH_PROSE_BODY,
        })
      );

      const outDir = path.join(tmp, "out");
      const firstResult = buildGallery({
        root,
        out: outDir,
        label: "v1",
        quiet: true,
      });

      const secondResult = buildGallery({
        root,
        out: outDir,
        label: "v2",
        compareWith: firstResult.report,
        quiet: true,
      });

      expect(fs.existsSync(path.join(secondResult.dir, "diff.html"))).toBe(true);
      const diffContent = fs.readFileSync(path.join(secondResult.dir, "diff.html"), "utf8");
      expect(diffContent).toContain("Morcus Library Gallery Diff");
      expect(diffContent).toContain("v1");
      expect(diffContent).toContain("v2");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
