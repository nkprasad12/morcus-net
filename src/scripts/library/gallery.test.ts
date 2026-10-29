import fs from "fs";
import os from "os";
import path from "path";
import { ArgumentParser } from "argparse";
import { JSDOM } from "jsdom";

import { LatinWorks } from "@/common/library/library_constants";
import { parseRawXml } from "@/common/xml/xml_utils";
import {
  analyzeWorkForGallery,
  buildDeltaGalleryReportFromInputs,
  buildGallery,
  buildGalleryReportFromInputs,
  buildReaderSectionUrl,
  CATEGORY_NAV_LABELS,
  extractNoteListItems,
  filterNotesHtmlToRefs,
  formatGalleryHtml,
  formatGalleryMarkdown,
  makeRenderWindowLocator,
  normalizeCitationChrome,
  normalizeNoteRefNumbers,
  normalizePreviewHtml,
  renderGalleryDiffHtml,
  rewriteExemplarIds,
  scopeCssRules,
  scopePreviewHtmlIds,
  selectDiverseExemplars,
  selectWorkSpotChecks,
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
    expect(md).toContain("/work/caesar_friends/");

    const html = formatGalleryHtml(report);
    expect(html).toContain("<!DOCTYPE html>");
    // Raw <script> in title or TEI snippets must be escaped
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );
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
    expect(html).toContain(
      "scroll-padding-top: var(--gallery-header-h, 8.5rem);"
    );
    expect(html).toContain(
      "scroll-margin-top: var(--gallery-header-h, 8.5rem);"
    );
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
    expect(html).toContain(`data-review-id="work:${LatinWorks.CAESAR_DBG}"`);
    expect(html).toContain('class="kind-card-footer"');
    expect(html).toContain('class="work-details-footer"');

    // Collapsed and hide styles
    expect(html).toContain('.kind-card[data-reviewed="true"] .exemplar-list');
    expect(html).toContain(
      '.kind-card[data-reviewed="true"] .kind-card-footer'
    );
    expect(html).toContain(".kind-card.is-reviewed .kind-card-footer");
    expect(html).toContain(
      'body[data-hide-reviewed="true"] .kind-card[data-reviewed="true"]'
    );
    expect(html).toContain(
      'body[data-hide-reviewed="true"] section[data-all-reviewed="true"] .cat-all-reviewed-banner'
    );
  });

  it("CATEGORY_NAV_LABELS defines clean labels for all MarkupCategories", () => {
    expect(CATEGORY_NAV_LABELS.element).toBe("Content Elements");
    expect(CATEGORY_NAV_LABELS["note-element"]).toBe("Note Elements");
    expect(CATEGORY_NAV_LABELS.rend).toBe("Element @rend");
    expect(CATEGORY_NAV_LABELS["note-rend"]).toBe("Note @rend");
    expect(CATEGORY_NAV_LABELS.attr).toBe("Attributes");
    expect(CATEGORY_NAV_LABELS.layout).toBe("Complex Layouts");
  });

  it("only emits gallery-nav category links for categories with >= 1 kind and omits empty categories like #cat-layout", () => {
    // Report with only element, rend, and attr (no note-element, note-rend, or layout)
    const partialReport: GalleryReport = {
      label: "partial-run",
      createdAt: new Date().toISOString(),
      root: "/corpus",
      includeCandidates: false,
      maxExamples: 1,
      totals: {
        worksProcessed: 1,
        onboardedCount: 1,
        candidateCount: 0,
        failedCount: 0,
        markupKindCount: 3,
      },
      markupKinds: [
        {
          kind: "p",
          category: "element",
          workCount: 1,
          occurrenceCount: 5,
          examples: [
            {
              workId: LatinWorks.CAESAR_DBG,
              workTitle: "De bello Gallico",
              author: "Julius Caesar",
              sectionId: "1.1",
              pageId: "1",
              readerUrl: "/work/caesar/de_bello_gallico/1#sec-1.1",
              url: "/work/caesar/de_bello_gallico/1#sec-1.1",
              teiSnippet: "<p>Gallia</p>",
              renderedHtml: '<div class="reader-passage"><p>Gallia</p></div>',
            },
          ],
        },
        {
          kind: "hi@italic",
          category: "rend",
          workCount: 1,
          occurrenceCount: 2,
          examples: [
            {
              workId: LatinWorks.CAESAR_DBG,
              workTitle: "De bello Gallico",
              author: "Julius Caesar",
              sectionId: "1.1",
              pageId: "1",
              readerUrl: "/work/caesar/de_bello_gallico/1#sec-1.1",
              url: "/work/caesar/de_bello_gallico/1#sec-1.1",
              teiSnippet: '<hi rend="italic">omnis</hi>',
              renderedHtml:
                '<div class="reader-passage"><span class="italic">omnis</span></div>',
            },
          ],
        },
        {
          kind: 'foreign@xml:lang="grc"',
          category: "attr",
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
              teiSnippet: '<foreign xml:lang="grc">λόγος</foreign>',
              renderedHtml:
                '<div class="reader-passage"><span class="foreign">λόγος</span></div>',
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
          rowCount: 5,
          citableRowCount: 5,
          pageCount: 1,
          textParts: ["chapter", "section"],
          markupKinds: ["p", "hi@italic", 'foreign@xml:lang="grc"'],
          pages: {
            first: {
              role: "first",
              pageId: "1",
              title: "Liber 1",
              sectionCount: 1,
              citationRange: ["1.1", "1.1"],
              readerUrl: "/work/caesar/de_bello_gallico/1",
              url: "/work/caesar/de_bello_gallico/1",
              previewHtml: '<div class="reader-passage">Gallia</div>',
            },
          },
          spotCheckPages: [],
        },
      ],
      failures: {},
    };

    const html = formatGalleryHtml(partialReport);
    const dom = new JSDOM(html);
    const nav = dom.window.document.querySelector("nav.gallery-nav");
    expect(nav).not.toBeNull();

    const navLinks = Array.from(nav!.querySelectorAll("a"));
    const hrefs = navLinks.map((a) => a.getAttribute("href"));

    // Active categories in report are included with expected labels
    expect(hrefs).toContain("#cat-element");
    expect(hrefs).toContain("#cat-rend");
    expect(hrefs).toContain("#cat-attr");
    expect(
      navLinks.find((a) => a.getAttribute("href") === "#cat-element")
        ?.textContent
    ).toBe("Content Elements");
    expect(
      navLinks.find((a) => a.getAttribute("href") === "#cat-rend")?.textContent
    ).toBe("Element @rend");
    expect(
      navLinks.find((a) => a.getAttribute("href") === "#cat-attr")?.textContent
    ).toBe("Attributes");

    // Empty categories are omitted (no dead navigation buttons)
    expect(hrefs).not.toContain("#cat-note-element");
    expect(hrefs).not.toContain("#cat-note-rend");
    expect(hrefs).not.toContain("#cat-layout");
    expect(navLinks.some((a) => a.textContent === "Complex Layouts")).toBe(
      false
    );

    // Spot-check link is included when works exist
    expect(hrefs).toContain("#spot-check-index");
    expect(
      navLinks.find((a) => a.getAttribute("href") === "#spot-check-index")
        ?.textContent
    ).toBe("Per-Work Spot-Check Index (1)");

    // Failures link is omitted when no failures
    expect(hrefs).not.toContain("#failures");

    // Every category link in nav points to a section that actually exists in the DOM
    for (const link of navLinks) {
      const href = link.getAttribute("href");
      if (href && href.startsWith("#cat-")) {
        const targetSection = dom.window.document.querySelector(href);
        expect(targetSection).not.toBeNull();
      }
    }
  });

  it("omits spot-check link when works are empty and includes failures link when failures exist", () => {
    const emptyWorksReport: GalleryReport = {
      label: "empty-works",
      createdAt: new Date().toISOString(),
      root: "/corpus",
      includeCandidates: true,
      maxExamples: 1,
      totals: {
        worksProcessed: 0,
        onboardedCount: 0,
        candidateCount: 0,
        failedCount: 1,
        markupKindCount: 0,
      },
      markupKinds: [],
      kindsByName: {},
      works: [],
      failures: {
        "phi9999.phi001.perseus-lat1": "TEI validation error",
      },
    };

    const html = formatGalleryHtml(emptyWorksReport);
    const dom = new JSDOM(html);
    const nav = dom.window.document.querySelector("nav.gallery-nav");
    expect(nav).not.toBeNull();

    const navLinks = Array.from(nav!.querySelectorAll("a"));
    const hrefs = navLinks.map((a) => a.getAttribute("href"));

    // No category links since markupKinds is empty
    for (const cat of [
      "element",
      "note-element",
      "rend",
      "note-rend",
      "attr",
      "layout",
    ]) {
      expect(hrefs).not.toContain(`#cat-${cat}`);
    }

    // Spot-check link is omitted when works are empty
    expect(hrefs).not.toContain("#spot-check-index");

    // Failures link is present with failure count
    expect(hrefs).toContain("#failures");
    expect(
      navLinks.find((a) => a.getAttribute("href") === "#failures")?.textContent
    ).toBe("Failed Candidates (1)");
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
    expect(fs.existsSync(path.join(defaultResult.dir, "gallery.json"))).toBe(
      true
    );
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
    const filteredSingle = filterNotesHtmlToRefs(
      passageSingle,
      sampleNotesHtml
    );
    expect(filteredSingle).toBeDefined();
    expect(filteredSingle).toContain('id="note-n2"');
    expect(filteredSingle).toContain("Second critical note.");
    expect(filteredSingle).not.toContain("First critical note.");
    expect(filteredSingle).not.toContain("Third critical note.");

    // 2. Passage referencing notes 1 and 3 with scoped ID prefixes
    const passageScoped = `<p class="reader-paragraph">Text <a class="reader-note-ref" href="#ex-0-1-0-note-n1">[1]</a> and <a class="reader-note-ref" href="#ex-0-1-0-note-n3">[3]</a></p>`;
    const filteredScoped = filterNotesHtmlToRefs(
      passageScoped,
      sampleNotesHtml
    );
    expect(filteredScoped).toBeDefined();
    expect(filteredScoped).toContain('id="note-n1"');
    expect(filteredScoped).toContain('id="note-n3"');
    expect(filteredScoped).not.toContain('id="note-n2"');

    // 3. Passage referencing via data-note-id
    const passageDataAttr = `<p class="reader-paragraph">Word<span data-note-id="n1">[1]</span></p>`;
    const filteredData = filterNotesHtmlToRefs(
      passageDataAttr,
      sampleNotesHtml
    );
    expect(filteredData).toBeDefined();
    expect(filteredData).toContain('id="note-n1"');
    expect(filteredData).not.toContain('id="note-n2"');

    // 4. Passage referencing NO notes
    const passageNoNotes = `<p class="reader-paragraph">No notes here <a class="section-anchor" href="#sec-1.1">1.1</a></p>`;
    expect(
      filterNotesHtmlToRefs(passageNoNotes, sampleNotesHtml)
    ).toBeUndefined();

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
    expect(rewriteExemplarIds(scoped, "prefix")).toContain(
      'id="prefix-ex-0-1-2-sec-1.1"'
    );

    const rawCss = `.reader-block { margin: 1em 0; } .reader-line, .indent { display: block; }`;
    const scopedCss = scopeCssRules(rawCss, ".before-scope");
    expect(scopedCss).toContain(
      ".before-scope .reader-block { margin: 1em 0; }"
    );
    expect(scopedCss).toContain(
      ".before-scope .reader-line, .before-scope .indent { display: block; }"
    );
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
              teiSnippet:
                '<quote rend="align(blockquote)"><l>Versus</l></quote>',
              renderedHtml:
                '<div class="reader-passage"><span class="blockquote">“<span class="reader-line">Versus</span>”</span></div>',
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
              renderedHtml:
                '<div class="reader-passage"><p class="reader-block">omnis</p></div>',
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
              renderedHtml:
                '<div class="reader-passage"><p class="reader-paragraph"><strong>C.</strong> <span class="italic">Quid</span></p></div>',
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
              previewHtml:
                '<div class="reader-passage">Old spot check passage</div>',
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
              renderedHtml:
                '<div class="reader-passage"><span class="blockquote"><span class="reader-line">Versus</span></span></div>',
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
              renderedHtml:
                '<div class="reader-passage"><p class="reader-block"><strong class="smallcaps">C.</strong> <span class="italic">Quid</span></p></div>',
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
              previewHtml:
                '<div class="reader-passage">New spot check passage</div>',
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
    expect(diffHtml).toContain(
      "Morcus Library Gallery Diff: <code>before-run</code> &rarr; <code>after-run</code>"
    );

    // Review controls & header
    expect(diffHtml).toContain('id="gallery-review-progress"');
    expect(diffHtml).toContain('id="gallery-hide-reviewed"');
    expect(diffHtml).toContain('id="gallery-reset-reviewed"');

    // Kind cards: includes quote@align(blockquote) and ab, excludes hi@italics (collateral change only)
    expect(diffHtml).toContain(
      'data-review-id="diff-kind:rend:quote@align(blockquote)"'
    );
    expect(diffHtml).toContain('data-review-id="diff-kind:element:ab"');
    expect(diffHtml).not.toContain(
      'data-review-id="diff-kind:rend:hi@italics"'
    );
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
    expect(diffHtml).toContain(
      `data-review-id="diff-work:${LatinWorks.CAESAR_DBG}"`
    );

    // Scoped beforeReaderCss
    expect(diffHtml).toContain(
      ".before-scope .reader-block { margin: 1em 0; }"
    );
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
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), "gallery-diff-build-test-")
    );
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

      expect(fs.existsSync(path.join(secondResult.dir, "diff.html"))).toBe(
        true
      );
      const diffContent = fs.readFileSync(
        path.join(secondResult.dir, "diff.html"),
        "utf8"
      );
      expect(diffContent).toContain("Morcus Library Gallery Diff");
      expect(diffContent).toContain("v1");
      expect(diffContent).toContain("v2");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("Human Checkpoint 2 gallery fixes", () => {
  const VERSE_REFS = `<refsDecl>
    <state unit="poem"/>
    <state unit="line"/>
  </refsDecl>`;

  function passageRows(html: string): string[] {
    return html
      .split('<aside class="reader-notes"')[0]
      .split(/\n(?=<div class="reader-section)/);
  }

  it("picks the rendered row of a shallow-id node instead of every row with that id", () => {
    const analyzed = analyzeWorkForGallery(
      {
        workId: LatinWorks.CATULLUS,
        rawXml: makeTei({
          title: "Carmina",
          author: "C. Valerius Catullus",
          refsDecl: VERSE_REFS,
          body: `<div type="edition" n="urn:cts:latinLit:phi0472.phi001.perseus-lat2">
            <div type="textpart" subtype="poem" n="31">
              <head>AUSONIO PAULINUS</head>
              <l n="1">Versus primus</l>
              <l n="2">Versus secundus</l>
              <l n="3">Versus tertius</l>
              <label>Ausonio Paulinus</label>
              <l n="4">Versus quartus</l>
              <l n="5">Versus quintus</l>
              <l n="6">Versus sextus</l>
              <label>Ausonio Paulinus</label>
              <l n="7">Versus septimus</l>
              <l n="8">Versus octavus</l>
            </div>
            <div type="textpart" subtype="poem" n="32">
              <milestone unit="tale" n="Invocatio"/>
              <l n="1">Carmen alterum incipit</l>
              <l n="2">Carmen alterum pergit</l>
              <note>Nota inter versus</note>
              <l n="3">Carmen alterum desinit</l>
            </div>
          </div>`,
        }),
        onboarded: true,
      },
      3
    );

    const labels = analyzed.kinds.get("label")!.candidates;
    expect(labels).toHaveLength(2);
    const [first, second] = labels.map((ex) => passageRows(ex.renderedHtml));
    // One target row with one row of context on each side, not the head and
    // both labels concatenated.
    expect(first).toHaveLength(3);
    expect(first[0]).toContain("Versus tertius");
    expect(first[1]).toContain("gallery-target");
    expect(first[1]).toContain("Ausonio Paulinus");
    expect(first[2]).toContain("Versus quartus");
    expect(first.join("\n")).not.toContain("AUSONIO PAULINUS");
    // The second identical label resolves to the second rendered label.
    expect(second[0]).toContain("Versus sextus");
    expect(second[1]).toContain("gallery-target");
    expect(second[2]).toContain("Versus septimus");

    // A stripped milestone uses the first line after it, not the poem-level
    // row of the note between lines 2 and 3.
    const milestone = analyzed.kinds.get('milestone@unit="tale"')!
      .candidates[0];
    const milestoneRows = passageRows(milestone.renderedHtml);
    const target = milestoneRows.find((r) => r.includes("gallery-target"));
    expect(target).toContain("Carmen alterum incipit");
    expect(target).not.toContain("reader-note-ref");
    expect(milestone.sectionId).toBe("32.1");
    expect(milestone.readerUrl).toContain("#sec-32.1");
  });

  function makeReport(
    label: string,
    kinds: GalleryReport["markupKinds"],
    works: GalleryReport["works"] = []
  ): GalleryReport {
    return {
      label,
      createdAt: new Date().toISOString(),
      root: "/corpus",
      includeCandidates: false,
      maxExamples: 3,
      totals: {
        worksProcessed: works.length,
        onboardedCount: works.length,
        candidateCount: 0,
        failedCount: 0,
        markupKindCount: kinds.length,
      },
      markupKinds: kinds,
      kindsByName: {},
      works,
      failures: {},
    };
  }

  function makeExemplar(
    workId: string,
    sectionId: string,
    renderedHtml: string,
    teiSnippet = "<label>x</label>"
  ): GalleryExemplar {
    return {
      workId,
      workTitle: workId,
      author: "Author",
      sectionId,
      pageId: "1",
      readerUrl: `/work/a/b/1#sec-${sectionId}`,
      url: `/work/a/b/1#sec-${sectionId}`,
      teiSnippet,
      renderedHtml,
    };
  }

  const line = (n: number) =>
    `<span class="reader-line">Versus numero ${n}</span>`;
  const lineRow = (sec: string, n: number, extra = "") =>
    `<div class="reader-section${extra}" id="sec-${sec}"><div class="reader-gutter"></div><div class="reader-passage">${line(
      n
    )}</div></div>`;
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);

  it("trims a Before poem to the lines a split After preview shows", () => {
    const bigPoem = `<div class="reader-section gallery-target" id="sec-31"><div class="reader-gutter"></div><div class="reader-passage"><h3 class="reader-subheading">TITULUS</h3>${range(
      1,
      9
    )
      .map(line)
      .join("\n")}\n<strong>Ausonio Paulinus</strong>\n${range(10, 40)
      .map(line)
      .join("\n")}</div></div>`;
    const afterRows = [
      lineRow("31.9", 9),
      `<div class="reader-section gallery-target" id="sec-31"><div class="reader-gutter"></div><div class="reader-passage"><span class="reader-line"><strong>Ausonio Paulinus</strong></span></div></div>`,
      lineRow("31.10", 10),
    ].join("\n");
    const workId = "stoa0045.stoa011.perseus-lat2";
    const kind = (html: string) => [
      {
        kind: "label",
        category: "element" as const,
        workCount: 1,
        occurrenceCount: 1,
        examples: [makeExemplar(workId, "31", html)],
      },
    ];
    const spotWork = (previewHtml: string) => [
      {
        workId,
        author: "Ausonius",
        title: "Epistulae",
        urlAuthor: "ausonius",
        urlName: "epistulae",
        onboarded: true,
        rowCount: 1,
        citableRowCount: 1,
        pageCount: 1,
        textParts: ["poem"],
        markupKinds: ["label"],
        pages: {
          first: {
            role: "first" as const,
            pageId: "31",
            title: "Epistula 31",
            sectionCount: 1,
            citationRange: ["31", "31"] as [string, string],
            readerUrl: "/work/ausonius/epistulae/31",
            url: "/work/ausonius/epistulae/31",
            previewHtml,
          },
        },
        spotCheckPages: [],
      },
    ];
    const bigSpotPoem = `<div class="reader-section" id="sec-31"><div class="reader-gutter"></div><div class="reader-passage">${range(
      1,
      40
    )
      .map(line)
      .join("\n")}</div></div>`;
    const afterSpot = range(1, 5)
      .map((n) => lineRow(`31.${n}`, n))
      .join("\n");

    const html = renderGalleryDiffHtml(
      makeReport("before", kind(bigPoem), spotWork(bigSpotPoem)),
      makeReport("after", kind(afterRows), spotWork(afterSpot))
    );

    expect(html).toContain("gallery-elided");
    // The exemplar keeps lines 9-10 and the label between them; the heading,
    // lines before the window, and the rest of the poem are trimmed.
    expect(html).toContain("Versus numero 9<");
    expect(html).toContain("Versus numero 10<");
    expect(html).not.toContain("TITULUS");
    expect(html).not.toContain("Versus numero 8<");
    // The spot-check keeps After's first 5 lines; nothing past them remains,
    // in either preview or markup diff.
    expect(html).toContain("Versus numero 1<");
    expect(html).toContain("Versus numero 5<");
    expect(html).not.toContain("Versus numero 11<");
    expect(html).not.toContain("Versus numero 40<");
  });

  it("never pairs exemplars from different works", () => {
    const before = makeReport("before", [
      {
        kind: 'milestone@unit="loebline"',
        category: "attr",
        workCount: 1,
        occurrenceCount: 1,
        examples: [
          makeExemplar(
            "stoa0058.stoa004.perseus-lat2",
            "1",
            lineRow("1", 1).replace("Versus numero 1", "De fide catholica"),
            '<milestone unit="loebline" n="1"/>'
          ),
        ],
      },
    ]);
    const after = makeReport("after", [
      {
        kind: 'milestone@unit="loebline"',
        category: "attr",
        workCount: 1,
        occurrenceCount: 1,
        examples: [
          makeExemplar(
            "stoa0058.stoa003.perseus-lat1",
            "1",
            lineRow("1", 1).replace("Versus numero 1", "De hebdomadibus"),
            '<milestone unit="loebline" n="1"/>'
          ),
        ],
      },
    ]);
    const html = renderGalleryDiffHtml(before, after);
    // Shown as new (After only), not diffed against the other work.
    expect(html).toContain("De hebdomadibus");
    expect(html).not.toContain("De fide catholica");
    expect(html).not.toContain('<mark class="diff-token-del">');
  });

  it("ignores shifted footnote numbers for body markup kinds", () => {
    const noteRef = (n: number) =>
      `<a class="reader-note-ref" id="noteref-n${n}" href="#note-n${n}" role="doc-noteref" aria-label="Note ${n}"><sup>[${n}]</sup></a>`;
    const supRow = (n: number) =>
      `<div class="reader-section gallery-target" id="sec-2.23"><div class="reader-gutter"></div><div class="reader-passage"><p class="reader-paragraph">Plinius${noteRef(
        n
      )} scripsit <span class="superscript">2</span></p></div></div>`;
    const kinds = (n: number) => [
      {
        kind: "hi@sup",
        category: "rend" as const,
        workCount: 1,
        occurrenceCount: 1,
        examples: [
          makeExemplar(
            "phi0978.phi001.perseus-lat2",
            "2.23",
            supRow(n),
            '<hi rend="sup">2</hi>'
          ),
        ],
      },
    ];
    const html = renderGalleryDiffHtml(
      makeReport("before", kinds(565)),
      makeReport("after", kinds(564))
    );
    expect(html).not.toContain('data-review-id="diff-kind:rend:hi@sup"');
    expect(html).toContain("No markup kind exemplar differences detected.");
    expect(normalizeNoteRefNumbers(noteRef(565))).toBe(
      normalizeNoteRefNumbers(noteRef(12))
    );

    // A dropped footnote marker is a note change, not a `hi@sup` change.
    const droppedRef = kinds(565);
    droppedRef[0].examples[0].renderedHtml = supRow(565).replace(
      noteRef(565),
      ""
    );
    const droppedHtml = renderGalleryDiffHtml(
      makeReport("before", kinds(565)),
      makeReport("after", droppedRef)
    );
    expect(droppedHtml).not.toContain('data-review-id="diff-kind:rend:hi@sup"');
  });

  describe("delta gallery", () => {
    const priorWork = {
      workId: LatinWorks.CAESAR_DBG,
      rawXml: makeTei({
        body: `<div type="edition" n="urn:x">
          <div type="textpart" subtype="chapter" n="1">
            <div type="textpart" subtype="section" n="1"><p>Gallia <hi rend="italic">est</hi>.</p></div>
          </div>
        </div>`,
      }),
      onboarded: true,
    };
    const newWork = {
      workId: LatinWorks.TACITUS_AGRICOLA,
      rawXml: makeTei({
        title: "Nova",
        author: "Novus Auctor",
        body: `<div type="edition" n="urn:x">
          <div type="textpart" subtype="chapter" n="1">
            <div type="textpart" subtype="section" n="1"><p>Nova <hi rend="italic">res</hi> <hi rend="bold">fortis</hi>.</p></div>
          </div>
        </div>`,
      }),
      onboarded: true,
    };
    const candidateWork = {
      workId: "phi9999.phi011.perseus-lat2",
      rawXml: makeTei({
        title: "Candidata",
        author: "Alius Auctor",
        body: `<div type="edition" n="urn:x">
          <div type="textpart" subtype="chapter" n="1">
            <div type="textpart" subtype="section" n="1"><p>Nondum <hi rend="uppercase">onboarded</hi>.</p></div>
          </div>
        </div>`,
      }),
      onboarded: false,
    };

    it("covers only newly onboarded works and the kinds only they exercise", () => {
      const prior = buildGalleryReportFromInputs([priorWork], {
        label: "phase-before",
      });
      const delta = buildDeltaGalleryReportFromInputs(
        [priorWork, newWork, candidateWork],
        prior,
        { label: "phase-after", includeCandidates: true }
      );
      expect(delta.label).toBe("phase-after-delta");
      expect(delta.includeCandidates).toBe(false);
      expect(delta.works.map((w) => w.workId)).toEqual([newWork.workId]);
      const kinds = delta.markupKinds.map((k) => k.kind);
      expect(kinds).toContain("hi@bold");
      // Already exercised before the onboarding.
      expect(kinds).not.toContain("hi@italic");
      // Only exercised by a skipped candidate.
      expect(kinds).not.toContain("hi@uppercase");
      for (const k of delta.markupKinds) {
        for (const ex of k.examples) {
          expect(ex.workId).toBe(newWork.workId);
        }
      }
      expect(delta.totals.candidateCount).toBe(0);
    });

    it("writes <label>-delta from buildGallery and the CLI's --delta-from / --compare-with", async () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-delta-"));
      try {
        const root = path.join(tmp, "latinLit");
        const outDir = path.join(tmp, "out");
        const write = (w: { workId: string; rawXml: string }) => {
          const [a, b] = w.workId.split(".");
          const dir = path.join(root, "data", a, b);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, `${w.workId}.xml`), w.rawXml);
        };
        write(priorWork);
        write(newWork);
        write(candidateWork);
        fs.mkdirSync(path.join(outDir, "phase-before"), { recursive: true });
        fs.writeFileSync(
          path.join(outDir, "phase-before", "gallery.json"),
          JSON.stringify(
            buildGalleryReportFromInputs([priorWork], { label: "phase-before" })
          )
        );

        const parser = new ArgumentParser();
        configureLibraryParser(parser);
        const parsed = parser.parse_args([
          "gallery",
          "--root",
          root,
          "--out",
          outDir,
          "--label",
          "phase-after",
          "--works",
          [priorWork, newWork, candidateWork].map((w) => w.workId).join(","),
          "--compare-with",
          "phase-before",
          "--delta-from",
          "phase-before",
        ]);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
        try {
          expect(await runLibraryCli(parsed)).toBe(true);
        } finally {
          logSpy.mockRestore();
        }
        expect(
          fs.existsSync(path.join(outDir, "phase-after", "diff.html"))
        ).toBe(true);
        const delta: GalleryReport = JSON.parse(
          fs.readFileSync(
            path.join(outDir, "phase-after-delta", "gallery.json"),
            "utf8"
          )
        );
        expect(delta.works.map((w) => w.workId)).toEqual([newWork.workId]);
        expect(delta.markupKinds.map((k) => k.kind)).toContain("hi@bold");
        expect(delta.markupKinds.map((k) => k.kind)).not.toContain(
          "hi@uppercase"
        );
        expect(
          fs.existsSync(path.join(outDir, "phase-after-delta", "index.html"))
        ).toBe(true);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
  describe("Changed Markup Kind Exemplars shows only real changes", () => {
    const WORK = "phi0448.phi001.perseus-lat2";
    const OTHER_WORK = "phi0474.phi001.perseus-lat2";
    const NEW_WORK = "phi2331.phi002.perseus-lat2";

    const headRow = (text: string, target = false) =>
      `<div class="reader-section${
        target ? " gallery-target" : ""
      }"><div class="reader-gutter"></div><div class="reader-passage"><h3 class="reader-subheading">${text}</h3></div></div>`;
    const kindOf = (
      kind: string,
      examples: GalleryExemplar[],
      category: GalleryReport["markupKinds"][number]["category"] = "element"
    ) => ({
      kind,
      category,
      workCount: 1,
      occurrenceCount: examples.length,
      examples,
    });
    const spotWork = (workId: string, previewHtml?: string) => ({
      workId,
      author: "Author",
      title: workId,
      urlAuthor: "a",
      urlName: "b",
      onboarded: true,
      rowCount: 5,
      citableRowCount: 5,
      pageCount: 1,
      textParts: ["chapter", "section"],
      markupKinds: [],
      pages:
        previewHtml === undefined
          ? {}
          : {
              first: {
                role: "first" as const,
                pageId: "1",
                title: "Liber 1",
                sectionCount: 5,
                citationRange: ["1.1", "1.5"] as [string, string],
                readerUrl: "/work/a/b/1",
                url: "/work/a/b/1",
                previewHtml,
              },
            },
      spotCheckPages: [],
    });
    /** The part of diff.html between two section ids. */
    const sectionOf = (html: string, id: string, nextId: string) =>
      html.slice(
        html.indexOf(`<section id="${id}"`),
        html.indexOf(`<section id="${nextId}"`)
      );
    const changedKindsSection = (html: string) =>
      sectionOf(html, "diff-kinds", "diff-new-coverage");
    const newCoverageSection = (html: string) =>
      sectionOf(html, "diff-new-coverage", "diff-works");

    function writeRenderIndex(
      dir: string,
      pageHash: string,
      notesHash?: string
    ) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "index.json"),
        JSON.stringify({
          version: 1,
          label: path.basename(dir),
          createdAt: "",
          root: "",
          works: {
            [WORK]: {
              id: WORK,
              pages: [
                {
                  id: "1",
                  file: "1",
                  title: "",
                  sectionCount: 1,
                  citationRange: ["1", "1"],
                  html: pageHash,
                  notes: notesHash,
                },
              ],
            },
          },
          failures: {},
        })
      );
    }

    it("drops exemplars on pages byte-identical in both renders", () => {
      const tmp = fs.mkdtempSync(
        path.join(os.tmpdir(), "gallery-render-guard-")
      );
      try {
        const before = makeReport(
          "before",
          [
            kindOf("lg", [
              makeExemplar(WORK, "1.1", lineRow("1.1", 1, " gallery-target")),
            ]),
          ],
          [spotWork(WORK)]
        );
        const after = makeReport(
          "after",
          [
            kindOf("lg", [
              makeExemplar(
                WORK,
                "1.1",
                lineRow("1.1", 1, " gallery-target").replace(
                  "numero",
                  "mutatus"
                )
              ),
            ]),
          ],
          [spotWork(WORK)]
        );
        const beforeRender = path.join(tmp, "before-render");
        const afterRender = path.join(tmp, "after-render");
        writeRenderIndex(beforeRender, "samehash", "notes1");
        writeRenderIndex(afterRender, "samehash", "notes1");

        const identical = renderGalleryDiffHtml(
          before,
          after,
          undefined,
          undefined,
          {
            beforeRenderDir: beforeRender,
            afterRenderDir: afterRender,
          }
        );
        expect(identical).not.toContain(
          'data-review-id="diff-kind:element:lg"'
        );
        expect(identical).toContain(
          "No markup kind exemplar differences detected."
        );
        expect(identical).toContain(
          "1 exemplar on a page byte-identical in the Before and After renders"
        );

        // Different notes on the page: it changed, so the exemplar is shown.
        writeRenderIndex(afterRender, "samehash", "notes2");
        const changed = renderGalleryDiffHtml(
          before,
          after,
          undefined,
          undefined,
          {
            beforeRenderDir: beforeRender,
            afterRenderDir: afterRender,
          }
        );
        expect(changed).toContain('data-review-id="diff-kind:element:lg"');
        // Without render dirs the exemplar is shown too.
        expect(renderGalleryDiffHtml(before, after)).toContain(
          'data-review-id="diff-kind:element:lg"'
        );
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("drops exemplars whose target rows are unchanged in both spot-check previews", () => {
      const kind = 'seg@type="card"';
      const spotRows = range(1, 5)
        .map((n) => lineRow(`1.${n}`, n))
        .join("\n");
      const before = makeReport(
        "before",
        // Another spot in the same work: the After exemplar is unpaired.
        [
          kindOf(
            kind,
            [makeExemplar(WORK, "9", headRow("LIBER", true), "<seg/>")],
            "attr"
          ),
        ],
        [spotWork(WORK, spotRows)]
      );
      const afterEx = makeExemplar(
        WORK,
        "1.2",
        [
          lineRow("1.1", 1),
          lineRow("1.2", 2, " gallery-target"),
          lineRow("1.3", 3),
        ].join("\n"),
        '<seg type="card" n="2"/>'
      );
      const after = makeReport(
        "after",
        [kindOf(kind, [afterEx], "attr")],
        [spotWork(WORK, spotRows)]
      );
      const unchanged = renderGalleryDiffHtml(before, after);
      expect(changedKindsSection(unchanged)).not.toContain("exemplar-item");
      expect(unchanged).toContain(
        "1 exemplar whose target rows are unchanged in both galleries' spot-check preview of the page"
      );

      // The page's preview changed: the unpaired exemplar is shown, labelled
      // honestly and without a DOM diff against an empty Before.
      const changedBefore = makeReport("before", before.markupKinds, [
        spotWork(
          WORK,
          spotRows.replace("Versus numero 2", "Versus antiquus 2")
        ),
      ]);
      const changed = renderGalleryDiffHtml(changedBefore, after);
      const section = changedKindsSection(changed);
      expect(section).toContain('data-unpaired="true"');
      expect(section).toContain("no paired Before exemplar");
      expect(changed).not.toContain("CSS styling change");
    });

    it("drops exemplars whose target row is unchanged in the paired Before exemplar", () => {
      const before = makeReport(
        "before",
        [
          kindOf("head", [
            makeExemplar(
              WORK,
              "1",
              headRow("COMMENTARIUS PRIMUS", true),
              "<head/>"
            ),
          ]),
        ],
        [spotWork(WORK)]
      );
      const afterWindow = (title: string) =>
        [headRow(title, true), lineRow("1.1.1", 1), lineRow("1.1.2", 2)].join(
          "\n"
        );
      const after = makeReport(
        "after",
        [
          kindOf("head", [
            makeExemplar(
              WORK,
              "1",
              afterWindow("COMMENTARIUS PRIMUS"),
              "<head/>"
            ),
          ]),
        ],
        [spotWork(WORK)]
      );
      // After only adds context rows around the same head row.
      const unchanged = renderGalleryDiffHtml(before, after);
      expect(unchanged).not.toContain(
        'data-review-id="diff-kind:element:head"'
      );
      expect(unchanged).toContain(
        "1 exemplar whose target rows are unchanged in the paired Before exemplar"
      );

      const changedAfter = makeReport(
        "after",
        [
          kindOf("head", [
            makeExemplar(
              WORK,
              "1",
              afterWindow("COMMENTARIUS SECUNDUS"),
              "<head/>"
            ),
          ]),
        ],
        [spotWork(WORK)]
      );
      expect(renderGalleryDiffHtml(before, changedAfter)).toContain(
        'data-review-id="diff-kind:element:head"'
      );
    });

    it("lists works and kinds the Before gallery lacks as new coverage", () => {
      const opener = makeExemplar(
        NEW_WORK,
        "1",
        lineRow("1", 1, " gallery-target").replace(
          "Versus numero 1",
          "Diocletiano Augusto"
        ),
        '<label rend="opener">Diocletiano Augusto</label>'
      );
      const docAuthor = makeExemplar(
        OTHER_WORK,
        "1",
        lineRow("1", 1, " gallery-target").replace(
          "Versus numero 1",
          "Flavius Vopiscus"
        ),
        "<docAuthor>Flavius Vopiscus</docAuthor>"
      );
      const before = makeReport(
        "before",
        [
          kindOf("label", [
            makeExemplar(WORK, "1", lineRow("1", 1, " gallery-target")),
          ]),
        ],
        [spotWork(WORK), spotWork(OTHER_WORK)]
      );
      const after = makeReport(
        "after",
        [
          kindOf("label", [opener]),
          kindOf("docAuthor", [docAuthor]),
          kindOf("label@opener", [opener], "rend"),
        ],
        [spotWork(WORK), spotWork(OTHER_WORK), spotWork(NEW_WORK)]
      );
      const html = renderGalleryDiffHtml(before, after);
      expect(changedKindsSection(html)).not.toContain("exemplar-item");
      expect(html).toContain("No markup kind exemplar differences detected.");
      const coverage = newCoverageSection(html);
      expect(coverage).toContain(
        "Newly Covered Markup Kinds (Not in Before Gallery): 2 exemplars"
      );
      expect(coverage).toContain("Diocletiano Augusto");
      expect(coverage).toContain("work not in Before");
      expect(coverage).toContain("Flavius Vopiscus");
      expect(coverage).toContain("kind not in Before");
      // The opener passage is listed once, with both of its kinds.
      expect(coverage.match(/new-coverage-item/g)).toHaveLength(2);
      expect(coverage).toContain('<span class="badge">label@opener</span>');
      // No Before pane and no diff for new coverage.
      expect(coverage).not.toContain("before-scope");
      expect(coverage).not.toContain("html-diff-details");
    });

    it("shows a passage chosen for several kinds once, with all its kinds", () => {
      const oldWindow = lineRow("1", 1, " gallery-target");
      const newWindow = oldWindow.replace("numero", "mutatus");
      const before = makeReport(
        "before",
        [
          kindOf("head", [makeExemplar(WORK, "1", oldWindow, "<head/>")]),
          kindOf(
            "head@align(center)",
            [makeExemplar(WORK, "1", oldWindow, "<head/>")],
            "rend"
          ),
          kindOf(
            'seg@type="tale"',
            [makeExemplar(WORK, "1", oldWindow, "<seg n='a'/>")],
            "attr"
          ),
        ],
        [spotWork(WORK)]
      );
      const after = makeReport(
        "after",
        [
          kindOf("head", [makeExemplar(WORK, "1", newWindow, "<head/>")]),
          kindOf(
            "head@align(center)",
            [makeExemplar(WORK, "1", newWindow, "<head/>")],
            "rend"
          ),
          kindOf(
            'seg@type="tale"',
            [
              makeExemplar(WORK, "1", newWindow, "<seg n='a'/>"),
              makeExemplar(WORK, "1", newWindow, "<seg n='b'/>"),
            ],
            "attr"
          ),
        ],
        [spotWork(WORK)]
      );
      const html = renderGalleryDiffHtml(before, after);
      const section = changedKindsSection(html);
      expect(section.match(/class="exemplar-item"/g)).toHaveLength(1);
      expect(section).toContain('data-review-id="diff-kind:element:head"');
      expect(section).not.toContain(
        'data-review-id="diff-kind:rend:head@align(center)"'
      );
      expect(section).toContain("Also the exemplar for:");
      expect(section).toContain(
        '<span class="badge also-kind">head@align(center)</span>'
      );
      expect(section).toContain(
        '<span class="badge also-kind">seg@type=&quot;tale&quot;</span>'
      );
      expect(html).toContain(
        "1. Changed Markup Kind Exemplars (1 kinds, 1 exemplars)"
      );
    });

    it("labels unpaired exemplars honestly even when After gains a heading row", () => {
      const before = makeReport(
        "before",
        [
          kindOf("seg", [
            makeExemplar(
              WORK,
              "7",
              lineRow("7", 7, " gallery-target"),
              "<seg n='7'/>"
            ),
          ]),
        ],
        [spotWork(WORK)]
      );
      const after = makeReport(
        "after",
        [
          kindOf("seg", [
            makeExemplar(
              WORK,
              "1",
              [
                headRow("DIRAE"),
                lineRow("1", 1, " gallery-target"),
                lineRow("2", 2),
              ].join("\n"),
              "<seg n='1'/>"
            ),
          ]),
        ],
        [spotWork(WORK)]
      );
      const html = renderGalleryDiffHtml(before, after);
      const section = changedKindsSection(html);
      expect(section).toContain('data-review-id="diff-kind:element:seg"');
      expect(section).toContain("no paired Before exemplar");
      expect(section).toContain('data-unpaired="true"');
      expect(html).not.toContain("CSS styling change");
      expect(html).not.toContain(".reader-block margin: 1em 0");
      // Nothing from After leaks into the empty Before pane, even though the
      // heading row would be "irrelevant" to `seg`; all of After is inserted.
      expect(section).toMatch(
        /html-diff-pane-before">\s*<div class="diff-col-header">Before HTML \(&minus;\)<\/div>\s*<pre><code><\/code><\/pre>/
      );
      expect(section).toContain('<mark class="diff-token-ins">');
    });

    it("keeps each side's own tokens when folding a collateral change into context", () => {
      const row = (wrapper: string, cls: string) =>
        `<div class="reader-passage"><p class="${wrapper}">Alpha</p><p>x <span class="${cls}">Quid</span> y</p></div>`;
      const html = renderGalleryDiffHtml(
        makeReport(
          "before",
          [
            kindOf(
              "hi@italics",
              [makeExemplar(WORK, "1", row("reader-paragraph", "italic"))],
              "rend"
            ),
          ],
          [spotWork(WORK)]
        ),
        makeReport(
          "after",
          [
            kindOf(
              "hi@italics",
              [makeExemplar(WORK, "1", row("reader-block", "bold"))],
              "rend"
            ),
          ],
          [spotWork(WORK)]
        )
      );
      const panes = (side: "before" | "after") => {
        const start = html.indexOf(`html-diff-pane-${side}"`);
        return html.slice(start, html.indexOf("</pre>", start));
      };
      // The paragraph-wrapper change is collateral for hi@italics: shown
      // unhighlighted, with Before's wrapper on the Before side only.
      expect(panes("before")).toContain("reader-paragraph");
      expect(panes("before")).not.toContain("reader-block");
      expect(panes("after")).toContain("reader-block");
      expect(panes("after")).not.toContain("reader-paragraph");
      // The italic change itself is highlighted.
      expect(panes("before")).toContain(
        '<mark class="diff-token-del">&lt;span class=&quot;italic&quot;&gt;</mark>'
      );
      expect(panes("after")).toContain(
        '<mark class="diff-token-ins">&lt;span class=&quot;bold&quot;&gt;</mark>'
      );
    });

    it("never lists a card's own kind as another kind it exemplifies", () => {
      const oldWindow = lineRow("1", 1, " gallery-target");
      const newWindow = oldWindow.replace("numero", "mutatus");
      const kind = 'seg@type="tale"';
      const html = renderGalleryDiffHtml(
        makeReport(
          "before",
          [
            kindOf(
              kind,
              [makeExemplar(WORK, "1", oldWindow, "<seg n='a'/>")],
              "attr"
            ),
          ],
          [spotWork(WORK)]
        ),
        makeReport(
          "after",
          [
            kindOf(
              kind,
              [
                makeExemplar(WORK, "1", newWindow, "<seg n='a'/>"),
                makeExemplar(WORK, "1", newWindow, "<seg n='b'/>"),
              ],
              "attr"
            ),
          ],
          [spotWork(WORK)]
        )
      );
      const section = changedKindsSection(html);
      expect(section.match(/class="exemplar-item"/g)).toHaveLength(1);
      expect(section).not.toContain("Also the exemplar for:");
      expect(html).toContain("1 exemplar repeating a passage already shown");
    });

    it("drops exemplars whose target rows appear unchanged elsewhere on the page in Before", () => {
      const kind = 'seg@type="chapter"';
      const target = lineRow("1.3", 3, " gallery-target");
      const afterEx = makeExemplar(
        WORK,
        "1.3",
        [lineRow("1.2", 2), target, lineRow("1.4", 4)].join("\n"),
        '<seg type="chapter" n="3"/>'
      );
      const afterSpot = range(1, 5)
        .map((n) => lineRow(`1.${n}`, n))
        .join("\n");
      // Before's preview of the page differs in line 1 only; line 3 is there.
      const beforeSpot = afterSpot.replace(
        "Versus numero 1",
        "Versus antiquus 1"
      );
      const before = makeReport(
        "before",
        // Another spot of the work, so the After exemplar is unpaired.
        [
          kindOf(
            kind,
            [
              makeExemplar(
                WORK,
                "9",
                lineRow("9", 9, " gallery-target"),
                "<seg/>"
              ),
            ],
            "attr"
          ),
        ],
        [spotWork(WORK, beforeSpot)]
      );
      const after = makeReport(
        "after",
        [kindOf(kind, [afterEx], "attr")],
        [spotWork(WORK, afterSpot)]
      );
      const html = renderGalleryDiffHtml(before, after);
      expect(changedKindsSection(html)).not.toContain("exemplar-item");
      expect(html).toContain(
        "1 exemplar whose target rows appear unchanged elsewhere on the same page in the Before gallery"
      );

      // A target row without text (a stanza spacer) proves nothing.
      const spacer = `<div class="reader-section gallery-target section-verse"><div class="reader-gutter"></div><div class="reader-passage"><span class="line-space" aria-hidden="true"></span></div></div>`;
      const spacerAfter = makeReport(
        "after",
        [
          kindOf(
            kind,
            [makeExemplar(WORK, "1.3", spacer, '<seg type="chapter" n="3"/>')],
            "attr"
          ),
        ],
        [spotWork(WORK, afterSpot)]
      );
      const spacerBefore = makeReport("before", before.markupKinds, [
        spotWork(
          WORK,
          `${beforeSpot}\n${spacer.replace(" gallery-target", "")}`
        ),
      ]);
      expect(
        changedKindsSection(renderGalleryDiffHtml(spacerBefore, spacerAfter))
      ).toContain("exemplar-item");
    });

    it("never feeds the synthetic elision marker into the markup diff and shows citation-split badge", () => {
      const workId = "stoa0045.stoa011.perseus-lat2";
      const bigPoem = `<div class="reader-section gallery-target" id="sec-31"><div class="reader-gutter"></div><div class="reader-passage">${range(
        1,
        9
      )
        .map(line)
        .join("\n")}\n<strong>Ausonio Paulinus</strong>\n${range(10, 40)
        .map(line)
        .join("\n")}</div></div>`;
      const afterRows = [
        lineRow("31.9", 9),
        `<div class="reader-section gallery-target"><div class="reader-gutter"></div><div class="reader-passage"><span class="reader-line"><strong>Ausonio Paulinus</strong></span></div></div>`,
        lineRow("31.10", 10),
      ].join("\n");
      const html = renderGalleryDiffHtml(
        makeReport(
          "before",
          [kindOf("label", [makeExemplar(workId, "31", bigPoem)])],
          [spotWork(workId)]
        ),
        makeReport(
          "after",
          [kindOf("label", [makeExemplar(workId, "31", afterRows)])],
          [spotWork(workId)]
        )
      );
      // Shown in the Before preview, but never as a deletion.
      expect(html).toContain('class="reader-line gallery-elided"');
      expect(html).toContain('<mark class="diff-token-ins">');
      expect(html).toContain("citation: §31 → §31.9–31.10");
      expect(html).not.toMatch(
        /<mark class="diff-token-del">(?:(?!<\/mark>)[\s\S])*gallery-elided/
      );
    });

    it("skips non-rendering marker kinds (milestone, lb, pb) from Section 1", () => {
      const oldWindow = lineRow("1", 1, " gallery-target");
      const newWindow = oldWindow.replace("numero", "mutatus");
      const before = makeReport(
        "before",
        [
          kindOf("milestone", [
            makeExemplar(WORK, "1", oldWindow, "<milestone/>"),
          ]),
          kindOf("lb", [makeExemplar(WORK, "1", oldWindow, "<lb/>")]),
          kindOf("pb", [makeExemplar(WORK, "1", oldWindow, "<pb/>")]),
        ],
        [spotWork(WORK)]
      );
      const after = makeReport(
        "after",
        [
          kindOf("milestone", [
            makeExemplar(WORK, "1", newWindow, "<milestone/>"),
          ]),
          kindOf("lb", [makeExemplar(WORK, "1", newWindow, "<lb/>")]),
          kindOf("pb", [makeExemplar(WORK, "1", newWindow, "<pb/>")]),
        ],
        [spotWork(WORK)]
      );
      const html = renderGalleryDiffHtml(before, after);
      expect(changedKindsSection(html)).not.toContain("exemplar-item");
      expect(html).toContain(
        "3 exemplars from non-rendering marker kinds (milestone, lb, pb)"
      );
    });

    it("drops context-only changes where only the outer verse citation gutter changed", () => {
      const beforePoem = `<div class="reader-section gallery-target" id="sec-1"><div class="reader-gutter"><a class="section-anchor" href="#sec-1">1</a></div><div class="reader-passage"><div class="reader-lg">${range(
        1,
        8
      )
        .map(line)
        .join(
          "\n"
        )}\n<span class="reader-line">quamquam difficile est; <span class="foreign greek" lang="el">γνῶθι</span></span>\n${range(
        10,
        20
      )
        .map(line)
        .join("\n")}</div></div></div>`;
      const afterRows = [
        lineRow("1.8", 8),
        `<div class="reader-section gallery-target" id="sec-1.9"><div class="reader-gutter"><a class="section-anchor" href="#sec-1.9">1.9</a></div><div class="reader-passage"><span class="reader-line">quamquam difficile est; <span class="foreign greek" lang="el">γνῶθι</span></span></div></div>`,
        lineRow("1.10", 10),
      ].join("\n");
      const before = makeReport(
        "before",
        [
          kindOf(
            'foreign@xml:lang="greek"',
            [
              makeExemplar(
                WORK,
                "1",
                beforePoem,
                '<foreign xml:lang="greek">γνῶθι</foreign>'
              ),
            ],
            "attr"
          ),
        ],
        [spotWork(WORK)]
      );
      const after = makeReport(
        "after",
        [
          kindOf(
            'foreign@xml:lang="greek"',
            [
              makeExemplar(
                WORK,
                "1.9",
                afterRows,
                '<foreign xml:lang="greek">γνῶθι</foreign>'
              ),
            ],
            "attr"
          ),
        ],
        [spotWork(WORK)]
      );
      const html = renderGalleryDiffHtml(before, after);
      expect(changedKindsSection(html)).not.toContain("exemplar-item");
      expect(html).toContain(
        "1 exemplar whose own rendered footprint is unchanged (context-only or citation-gutter change)"
      );
    });

    it("populates Before pane from beforeRenderDir for newly rendered page-1 headings", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-before-loc-"));
      try {
        const beforeRender = path.join(tmp, "before-render");
        const afterRender = path.join(tmp, "after-render");
        writeRenderIndex(beforeRender, "hash-b");
        writeRenderIndex(afterRender, "hash-a");
        fs.mkdirSync(path.join(beforeRender, WORK), { recursive: true });
        fs.mkdirSync(path.join(afterRender, WORK), { recursive: true });
        const sec1 = lineRow("1", 1);
        const heading = headRow("PRO P. QVINCTIO ORATIO");
        fs.writeFileSync(path.join(beforeRender, WORK, "1.html"), sec1);
        fs.writeFileSync(
          path.join(afterRender, WORK, "1.html"),
          `${heading}\n${sec1}`
        );

        const before = makeReport(
          "before",
          [
            kindOf("head", [
              makeExemplar(OTHER_WORK, "1", headRow("OTHER", true), "<head/>"),
            ]),
          ],
          [spotWork(WORK, sec1), spotWork(OTHER_WORK)]
        );
        const after = makeReport(
          "after",
          [
            kindOf("head", [
              makeExemplar(
                WORK,
                "1",
                `${headRow("PRO P. QVINCTIO ORATIO", true)}\n${sec1}`,
                "<head>PRO P. QVINCTIO ORATIO</head>"
              ),
            ]),
          ],
          [spotWork(WORK, `${heading}\n${sec1}`), spotWork(OTHER_WORK)]
        );

        const html = renderGalleryDiffHtml(
          before,
          after,
          undefined,
          undefined,
          {
            beforeRenderDir: beforeRender,
            afterRenderDir: afterRender,
          }
        );
        const section = changedKindsSection(html);
        expect(section).toContain('data-status="newly-rendered"');
        expect(section).toContain("Newly rendered");
        expect(section).not.toContain('data-unpaired="true"');
        expect(section).toContain("Versus numero 1");
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("surfaces No longer rendered cards when a kind is dropped in After and never synthesizes an After pane without observed After HTML", () => {
      const beforeNoteHtml = `${lineRow("149", 1, " gallery-target").replace(
        "Versus numero 1",
        'Versus <a class="reader-note-ref" href="#note-n1">[1]</a> numero 1'
      )}\n<aside class="reader-notes" role="doc-endnotes"><ol class="reader-notes-list"><li class="reader-note gallery-target" id="note-n1"><a class="reader-note-backref" href="#noteref-n1">[1]</a><div class="reader-note-body">5</div></li></ol></aside>`;
      const before = makeReport(
        "before",
        [
          kindOf(
            "note@n",
            [
              makeExemplar(
                WORK,
                "149",
                beforeNoteHtml,
                '<note n="marg">5</note>'
              ),
            ],
            "attr"
          ),
        ],
        [{ ...spotWork(WORK), markupKinds: ["l", "note@n"] }]
      );
      // 1. When After has an observed row for sec-149 (e.g. in spot-checks or afterRenderDir),
      // the No longer rendered card is surfaced with that real After row.
      const afterWithObserved = makeReport(
        "after",
        [],
        [{ ...spotWork(WORK, lineRow("149", 1)), markupKinds: ["l"] }]
      );
      const html = renderGalleryDiffHtml(before, afterWithObserved);
      const section = changedKindsSection(html);
      expect(section).toContain('data-status="no-longer-rendered"');
      expect(section).toContain("No longer rendered");
      expect(section).toContain('<mark class="diff-token-del">');

      // 2. When After has NO observed HTML for the work/page (neither in afterRenderDir nor in spot-checks),
      // renderGalleryDiffHtml never fabricates an After pane by stripping tags from Before.
      const afterWithoutObserved = makeReport(
        "after",
        [],
        [{ ...spotWork(WORK), markupKinds: ["l"] }]
      );
      const htmlUnverified = renderGalleryDiffHtml(
        before,
        afterWithoutObserved
      );
      expect(changedKindsSection(htmlUnverified)).not.toContain(
        "exemplar-item"
      );
    });

    it("distinguishes unpaired exemplars from newly-rendered exemplars and treats renamed headings on an existing Before page as changed", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-b2-status-"));
      try {
        const beforeRender = path.join(tmp, "before-render");
        const afterRender = path.join(tmp, "after-render");
        writeRenderIndex(beforeRender, "hash-b");
        writeRenderIndex(afterRender, "hash-a");
        fs.mkdirSync(path.join(beforeRender, WORK), { recursive: true });
        fs.mkdirSync(path.join(afterRender, WORK), { recursive: true });

        // Before page already has an un-id'd heading "LIBER PRIMUS" before sec-1;
        // After renames that heading to "LIBER I". This is a "changed" heading, not "newly-rendered".
        const sec1 = lineRow("1", 1);
        fs.writeFileSync(
          path.join(beforeRender, WORK, "1.html"),
          `${headRow("LIBER PRIMUS")}\n${sec1}`
        );
        fs.writeFileSync(
          path.join(afterRender, WORK, "1.html"),
          `${headRow("LIBER I")}\n${sec1}`
        );

        const before = makeReport(
          "before",
          [
            kindOf("head", [
              makeExemplar(OTHER_WORK, "1", headRow("OTHER", true), "<head/>"),
            ]),
          ],
          [spotWork(WORK), spotWork(OTHER_WORK)]
        );
        const after = makeReport(
          "after",
          [
            kindOf("head", [
              makeExemplar(
                WORK,
                "1",
                `${headRow("LIBER I", true)}\n${sec1}`,
                "<head>LIBER I</head>"
              ),
              // OTHER_WORK is not in beforeRenderDir and its Before exemplar is at a different section ("1" vs "9")
              makeExemplar(
                OTHER_WORK,
                "9",
                lineRow("9", 9, " gallery-target"),
                "<head>UNPAIRED</head>"
              ),
            ]),
          ],
          [spotWork(WORK), spotWork(OTHER_WORK)]
        );

        const html = renderGalleryDiffHtml(
          before,
          after,
          undefined,
          undefined,
          {
            beforeRenderDir: beforeRender,
            afterRenderDir: afterRender,
          }
        );
        const section = changedKindsSection(html);
        // WORK exemplar has its Before heading located from beforeRenderDir and is "changed"
        expect(section).toContain('data-status="changed"');
        expect(section).toContain("LIBER PRIMUS");
        // OTHER_WORK exemplar has no Before HTML and is labeled "unpaired", never "newly-rendered"
        expect(section).toContain('data-status="unpaired"');
        expect(section).toContain("Unpaired");
        expect(section).not.toContain('data-status="newly-rendered"');
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("discovers change-driven exemplars (p, note newly-rendered, note@n changed/removed) directly from render diff with real TEI lookup and strict section pairing (B3, B4, N7, N8)", () => {
      const tmp = fs.mkdtempSync(
        path.join(os.tmpdir(), "gallery-b3-discover-")
      );
      try {
        const xmlRoot = path.join(tmp, "latinLit");
        const [workGrp, workSub] = WORK.split(".");
        const workXmlDir = path.join(xmlRoot, "data", workGrp, workSub);
        fs.mkdirSync(workXmlDir, { recursive: true });
        fs.writeFileSync(
          path.join(workXmlDir, `${WORK}.xml`),
          makeTei({
            body: `<div type="edition" n="urn:x">
              <div type="textpart" subtype="chapter" n="1">
                <head>Caput Primum</head>
                <div type="textpart" subtype="section" n="2"><p>Textus <note n="I Cor. VII, 39."/></p></div>
              </div>
              <div type="textpart" subtype="chapter" n="2">
                <div type="textpart" subtype="section" n="1"><p>Fabella admonet <note n="marg">12</note></p></div>
              </div>
            </div>`,
          })
        );

        const beforeRender = path.join(tmp, "before-render");
        const afterRender = path.join(tmp, "after-render");
        fs.mkdirSync(path.join(beforeRender, WORK), { recursive: true });
        fs.mkdirSync(path.join(afterRender, WORK), { recursive: true });
        fs.mkdirSync(path.join(beforeRender, OTHER_WORK), { recursive: true });
        fs.mkdirSync(path.join(afterRender, OTHER_WORK), { recursive: true });

        const writeIdx = (
          dir: string,
          p1Hash: string,
          p1Notes: string | undefined,
          p2Hash: string,
          p2Notes: string | undefined
        ) => {
          fs.writeFileSync(
            path.join(dir, "index.json"),
            JSON.stringify({
              version: 1,
              label: path.basename(dir),
              createdAt: "",
              root: xmlRoot,
              works: {
                [WORK]: {
                  id: WORK,
                  title: "Work One",
                  author: "Caesar",
                  urlAuthor: "caesar",
                  urlName: "work-one",
                  pages: [
                    {
                      id: "1",
                      file: "1",
                      title: "P1",
                      sectionCount: 2,
                      citationRange: ["1.1", "1.2"],
                      html: p1Hash,
                      notes: p1Notes,
                    },
                    {
                      id: "2",
                      file: "2",
                      title: "P2",
                      sectionCount: 1,
                      citationRange: ["2.1", "2.1"],
                      html: p2Hash,
                      notes: p2Notes,
                    },
                  ],
                },
                [OTHER_WORK]: {
                  id: OTHER_WORK,
                  title: "Work Two",
                  author: "Cicero",
                  urlAuthor: "cicero",
                  urlName: "work-two",
                  pages: [
                    {
                      id: "1",
                      file: "1",
                      title: "P1",
                      sectionCount: 1,
                      citationRange: ["1", "1"],
                      html: p1Hash,
                      notes: p1Notes,
                    },
                  ],
                },
              },
              failures: {},
            })
          );
        };

        writeIdx(beforeRender, "h1-b", "n1-b", "h2-b", "n2-b");
        writeIdx(afterRender, "h1-a", "n1-a", "h2-a", undefined);

        // WORK page 1: un-anchored <h3 class="reader-subheading"> gains id="sec-1.1" (citation-only -> ignored by N7),
        // and note-n1 on sec-1.2 changes from empty body "" to "I Cor. VII, 39." (note@n changed -> real TEI lookup B4)
        fs.writeFileSync(
          path.join(beforeRender, WORK, "1.html"),
          `<div class="reader-section"><div class="reader-gutter"></div><div class="reader-passage"><h3 class="reader-subheading">Caput Primum</h3></div></div>\n<div class="reader-section" id="sec-1.2"><div class="reader-gutter"></div><div class="reader-passage"><p class="reader-paragraph">Textus <a class="reader-note-ref" href="#note-n1">[1]</a></p></div></div>`
        );
        fs.writeFileSync(
          path.join(afterRender, WORK, "1.html"),
          `<div class="reader-section" id="sec-1.1"><div class="reader-gutter"><a class="section-anchor" href="#sec-1.1">1.1</a></div><div class="reader-passage"><h3 class="reader-subheading">Caput Primum</h3></div></div>\n<div class="reader-section" id="sec-1.2"><div class="reader-gutter"></div><div class="reader-passage"><p class="reader-paragraph">Textus <a class="reader-note-ref" href="#note-n1">[1]</a></p></div></div>`
        );
        fs.writeFileSync(
          path.join(beforeRender, WORK, "1.notes.html"),
          `<aside class="reader-notes" role="doc-endnotes"><ol class="reader-notes-list"><li class="reader-note" id="note-n1"><a class="reader-note-backref" href="#noteref-n1">[1]</a><div class="reader-note-body"></div></li></ol></aside>`
        );
        fs.writeFileSync(
          path.join(afterRender, WORK, "1.notes.html"),
          `<aside class="reader-notes" role="doc-endnotes"><ol class="reader-notes-list"><li class="reader-note" id="note-n1"><a class="reader-note-backref" href="#noteref-n1">[1]</a><div class="reader-note-body">I Cor. VII, 39.</div></li></ol></aside>`
        );

        // WORK page 2: <span class="reader-line"> becomes <p class="reader-block"> (`p`),
        // and vacuous note-n1 is dropped (`note@n` no-longer-rendered)
        fs.writeFileSync(
          path.join(beforeRender, WORK, "2.html"),
          `<div class="reader-section" id="sec-2.1"><div class="reader-gutter"></div><div class="reader-passage"><span class="reader-line">Fabella admonet <a class="reader-note-ref" href="#note-n1">[1]</a></span></div></div>`
        );
        fs.writeFileSync(
          path.join(afterRender, WORK, "2.html"),
          `<div class="reader-section" id="sec-2.1"><div class="reader-gutter"></div><div class="reader-passage"><p class="reader-block">Fabella admonet </p></div></div>`
        );
        fs.writeFileSync(
          path.join(beforeRender, WORK, "2.notes.html"),
          `<aside class="reader-notes" role="doc-endnotes"><ol class="reader-notes-list"><li class="reader-note" id="note-n1"><a class="reader-note-backref" href="#noteref-n1">[1]</a><div class="reader-note-body">12</div></li></ol></aside>`
        );

        // OTHER_WORK page 1 (no XML on disk -> "No source TEI (found from the render diff)"):
        // - note-n1 on newly inserted un-anchored <head> has no matching section in Before and must NOT pair against sec-1
        // - note-n2 on sec-1 matches sec-1 in Before and is discovered as `note` newly-rendered
        fs.writeFileSync(
          path.join(beforeRender, OTHER_WORK, "1.html"),
          `<div class="reader-section" id="sec-1"><div class="reader-gutter"></div><div class="reader-passage"><p class="reader-paragraph">Initium</p></div></div>`
        );
        fs.writeFileSync(
          path.join(afterRender, OTHER_WORK, "1.html"),
          `<div class="reader-section"><div class="reader-gutter"></div><div class="reader-passage"><h3 class="reader-subheading">Titulus <a class="reader-note-ref" href="#note-n1">[1]</a></h3></div></div>\n<div class="reader-section" id="sec-1"><div class="reader-gutter"></div><div class="reader-passage"><p class="reader-paragraph">Initium <a class="reader-note-ref" href="#note-n2">[2]</a></p></div></div>`
        );
        fs.writeFileSync(
          path.join(afterRender, OTHER_WORK, "1.notes.html"),
          `<aside class="reader-notes" role="doc-endnotes"><ol class="reader-notes-list"><li class="reader-note" id="note-n1"><a class="reader-note-backref" href="#noteref-n1">[1]</a><div class="reader-note-body">Heading Note</div></li><li class="reader-note" id="note-n2"><a class="reader-note-backref" href="#noteref-n2">[2]</a><div class="reader-note-body">See Introduction, p. x.</div></li></ol></aside>`
        );

        const before = makeReport(
          "before",
          [],
          [spotWork(WORK), spotWork(OTHER_WORK)]
        );
        const after = makeReport(
          "after",
          [],
          [spotWork(WORK), spotWork(OTHER_WORK)]
        );
        const html = renderGalleryDiffHtml(
          before,
          after,
          undefined,
          undefined,
          {
            beforeRenderDir: beforeRender,
            afterRenderDir: afterRender,
          }
        );
        const section = changedKindsSection(html);
        expect(section).toContain('data-review-id="diff-kind:element:p"');
        // Real TEI snippets with preserved spaces (B4):
        expect(section).toContain(
          "&lt;p&gt;Fabella admonet &lt;note n=&quot;marg&quot;&gt;12&lt;/note&gt;&lt;/p&gt;"
        );
        expect(section).toContain(
          "&lt;note n=&quot;I Cor. VII, 39.&quot;/&gt;"
        );
        expect(section).toContain(
          "&lt;note n=&quot;marg&quot;&gt;12&lt;/note&gt;"
        );
        // Citation-anchor-only head change is excluded (N7):
        expect(section).not.toContain(
          'data-review-id="diff-kind:element:head"'
        );
        // Note on newly inserted heading is skipped (not paired against sec-1), while note on sec-1 is discovered (B4):
        expect(section).toContain('data-review-id="diff-kind:element:note"');
        expect(section).not.toContain("Heading Note");
        expect(section).toContain("See Introduction, p. x.");
        expect(section).toContain("No source TEI (found from the render diff)");
        expect(section).toContain('data-review-id="diff-kind:attr:note@n"');
        // `gallery-target` is stripped from `<li class="reader-note">` in token diffs (N8):
        expect(section).not.toContain("&lt;li class=&quot;gallery-target");
        expect(section).not.toContain("reader-note gallery-target&quot;");
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("supports makeRenderWindowLocator (id, exact/needle text, ancestor prefix, note path, and page.file stem) and normalizeCitationChrome", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-locator-"));
      try {
        const renderDir = path.join(tmp, "render");
        fs.mkdirSync(path.join(renderDir, WORK), { recursive: true });
        fs.writeFileSync(
          path.join(renderDir, "index.json"),
          JSON.stringify({
            version: 1,
            label: "test",
            createdAt: "",
            root: "",
            works: {
              [WORK]: {
                id: WORK,
                pages: [
                  {
                    id: "8.1A*",
                    file: "8.1A_",
                    title: "",
                    sectionCount: 2,
                    citationRange: ["31", "32"],
                    html: "h1",
                    notes: "n1",
                  },
                ],
              },
            },
            failures: {},
          })
        );
        const sec31 = `<div class="reader-section" id="sec-31"><div class="reader-gutter"></div><div class="reader-passage"><span class="reader-line">Ausonio Paulinus salutem plurimam dicit</span></div></div>`;
        const sec32 = `<div class="reader-section" id="sec-32"><div class="reader-gutter"></div><div class="reader-passage"><span class="reader-line">Secundus versus longior</span></div></div>`;
        fs.writeFileSync(
          path.join(renderDir, WORK, "8.1A_.html"),
          `${sec31}\n${sec32}`
        );
        fs.writeFileSync(
          path.join(renderDir, WORK, "8.1A_.notes.html"),
          `<aside class="reader-notes" role="doc-endnotes"><ol class="reader-notes-list"><li class="reader-note" id="note-n1"><a class="reader-note-backref" href="#noteref-n1">[1]</a><div class="reader-note-body">Nota bene</div></li></ol></aside>`
        );

        const locate = makeRenderWindowLocator(renderDir);
        // 1. Ancestor prefix match ("31.18" -> "31") using `page.file` ("8.1A_") for pageId "8.1A*"
        const ancestorEx: GalleryExemplar = {
          ...makeExemplar(
            WORK,
            "31.18",
            `<div class="reader-section gallery-target" id="sec-31.18"><div class="reader-gutter"></div><div class="reader-passage"><span class="reader-line">Alia verba</span></div></div>`
          ),
          pageId: "8.1A*",
        };
        const locatedAncestor = locate(ancestorEx, false);
        expect(locatedAncestor?.status).toBe("matched");
        expect(locatedAncestor?.html).toContain('id="sec-31"');

        // 2. Note match path
        const noteEx: GalleryExemplar = {
          ...makeExemplar(
            WORK,
            "31",
            `${sec31.replace(
              'class="reader-section"',
              'class="reader-section gallery-target"'
            )}\n<aside class="reader-notes" role="doc-endnotes"><ol class="reader-notes-list"><li class="reader-note gallery-target" id="note-n9"><a class="reader-note-backref" href="#noteref-n9">[9]</a><div class="reader-note-body">Nota bene</div></li></ol></aside>`,
            "<note>Nota bene</note>"
          ),
          pageId: "8.1A*",
          inNote: true,
        };
        const locatedNote = locate(noteEx, true);
        expect(locatedNote?.status).toBe("matched");
        expect(locatedNote?.html).toContain("Nota bene");

        // 3. Inline space preservation in normalizeCitationChrome (`N2`)
        const withSpace = normalizeCitationChrome(
          `<div class="reader-section" id="sec-1"><div class="reader-gutter"></div><div class="reader-passage"><span>alpha</span> <span>beta</span></div></div>`,
          true
        );
        const withoutSpace = normalizeCitationChrome(
          `<div class="reader-section" id="sec-1"><div class="reader-gutter"></div><div class="reader-passage"><span>alpha</span><span>beta</span></div></div>`,
          true
        );
        expect(withSpace).not.toBe(withoutSpace);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("writes diff.html for two existing galleries through `library gallery-diff`", async () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-diff-cli-"));
      try {
        const outDir = path.join(tmp, "out");
        const writeReport = (label: string, report: GalleryReport) => {
          fs.mkdirSync(path.join(outDir, label), { recursive: true });
          fs.writeFileSync(
            path.join(outDir, label, "gallery.json"),
            JSON.stringify(report)
          );
        };
        writeReport(
          "before",
          makeReport(
            "before",
            [
              kindOf("lg", [
                makeExemplar(WORK, "1.1", lineRow("1.1", 1, " gallery-target")),
              ]),
            ],
            [spotWork(WORK)]
          )
        );
        writeReport(
          "after",
          makeReport(
            "after",
            [
              kindOf("lg", [
                makeExemplar(
                  WORK,
                  "1.1",
                  lineRow("1.1", 1, " gallery-target").replace(
                    "numero",
                    "mutatus"
                  )
                ),
              ]),
            ],
            [spotWork(WORK)]
          )
        );
        const beforeRender = path.join(tmp, "before-render");
        const afterRender = path.join(tmp, "after-render");
        writeRenderIndex(beforeRender, "samehash");
        writeRenderIndex(afterRender, "samehash");

        const parser = new ArgumentParser();
        configureLibraryParser(parser);
        const parsed = parser.parse_args([
          "gallery-diff",
          "--out",
          outDir,
          "--before",
          "before",
          "--after",
          "after",
          "--before-render",
          beforeRender,
          "--after-render",
          afterRender,
        ]);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
        try {
          expect(await runLibraryCli(parsed)).toBe(true);
        } finally {
          logSpy.mockRestore();
        }
        const diffHtml = fs.readFileSync(
          path.join(outDir, "after", "diff.html"),
          "utf8"
        );
        expect(diffHtml).toContain("Morcus Library Gallery Diff");
        expect(diffHtml).not.toContain('data-review-id="diff-kind:element:lg"');
        expect(diffHtml).toContain(
          "byte-identical in the Before and After renders"
        );
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe("selectWorkSpotChecks & Most Interesting Spot-Check Windows", () => {
    it("emits only 1 spot-check window for a 1-page work with <= 5 citable rows, and 3 non-overlapping windows for a 1-page work with >= 15 rows", () => {
      expect(
        selectWorkSpotChecks({
          id: "x",
          title: "Empty",
          author: "A",
          urlAuthor: "a",
          urlName: "empty",
          attribution: "perseus",
          hasMacra: false,
          hasTranslation: false,
          paginationDepth: 1,
          license: "Public Domain",
          tocHtml: "",
          textParts: ["section"],
          pages: [],
          navTree: { id: [], children: [] },
        }).spotCheckPages
      ).toEqual([]);

      const shortOnePage = analyzeWorkForGallery({
        workId: LatinWorks.CAESAR_DBG,
        onboarded: true,
        rawXml: makeTei({
          title: "Brevis",
          author: "Auctor",
          body: `<div type="edition" n="urn:x">
            <div type="textpart" subtype="chapter" n="1">
              <div type="textpart" subtype="section" n="1"><p>Unus.</p></div>
              <div type="textpart" subtype="section" n="2"><p>Duo.</p></div>
              <div type="textpart" subtype="section" n="3"><p>Tres.</p></div>
            </div>
          </div>`,
        }),
      });
      expect(shortOnePage.spotCheck.pageCount).toBe(1);
      expect(shortOnePage.spotCheck.pages.first).toBeDefined();
      expect(shortOnePage.spotCheck.pages.first?.label).toBe("OPENING");
      expect(shortOnePage.spotCheck.pages.middle).toBeUndefined();
      expect(shortOnePage.spotCheck.pages.last).toBeUndefined();
      expect(shortOnePage.spotCheck.spotCheckPages).toHaveLength(1);

      const longSections = Array.from(
        { length: 15 },
        (_, i) =>
          `<div type="textpart" subtype="section" n="${
            i + 1
          }"><p>Sententia ordinaria numero ${i + 1}.</p></div>`
      ).join("\n");
      const longOnePage = analyzeWorkForGallery({
        workId: LatinWorks.CAESAR_DBG,
        onboarded: true,
        rawXml: makeTei({
          title: "Longus",
          author: "Auctor",
          body: `<div type="edition" n="urn:x"><div type="textpart" subtype="chapter" n="1">${longSections}</div></div>`,
        }),
      });
      expect(longOnePage.spotCheck.pageCount).toBe(1);
      expect(longOnePage.spotCheck.spotCheckPages).toHaveLength(3);
      const { first, middle, last } = longOnePage.spotCheck.pages;
      expect(first?.label).toBe("OPENING");
      expect(first?.windowRange).toEqual(["1.1", "1.5"]);
      expect(first?.readerUrl).toBe("/work/auctor/longus/1");
      expect(middle?.label).toBe("MID-PAGE");
      expect(middle?.windowRange).toEqual(["1.6", "1.10"]);
      expect(middle?.readerUrl).toBe("/work/auctor/longus/1#sec-1.6");
      expect(last?.label).toBe("CLOSING");
      expect(last?.windowRange).toEqual(["1.11", "1.15"]);
      expect(last?.readerUrl).toBe("/work/auctor/longus/1#sec-1.11");
    });

    it("selects a mid-page high-signal window as FEATURED MARKUP with scoped notes, windowRange, and reason badge", () => {
      const plainSecs = (from: number, to: number) =>
        Array.from(
          { length: to - from + 1 },
          (_, idx) =>
            `<div type="textpart" subtype="section" n="${
              from + idx
            }"><p>Prosa simplex ${from + idx}${
              from + idx === 1
                ? '<note place="foot">Opening footnote only</note>'
                : ""
            }.</p></div>`
        ).join("\n");

      const richMidSecs = [
        `<div type="textpart" subtype="section" n="10"><p>Introitus <foreign xml:lang="greek">λόγος</foreign><note place="foot">Mid-page critical note</note>.</p></div>`,
        `<div type="textpart" subtype="section" n="11"><p><quote rend="blockquote"><l>Versus citatus in prosa</l><l rend="indent">Versus indentatus</l></quote></p></div>`,
        `<div type="textpart" subtype="section" n="12"><p><label> M. </label> Quid ais?</p></div>`,
        `<div type="textpart" subtype="section" n="13"><p>Responsum <hi rend="italic">clarum</hi>.</p></div>`,
        `<div type="textpart" subtype="section" n="14"><p>Clausula fenestrae.</p></div>`,
      ].join("\n");

      const report = buildGalleryReportFromInputs(
        [
          {
            workId: LatinWorks.CAESAR_DBG,
            onboarded: true,
            rawXml: makeTei({
              title: "Satura",
              author: "Varro",
              body: `<div type="edition" n="urn:x">
                <div type="textpart" subtype="chapter" n="1">
                  ${plainSecs(1, 9)}
                  ${richMidSecs}
                  ${plainSecs(15, 20)}
                </div>
                <div type="textpart" subtype="chapter" n="2">
                  <div type="textpart" subtype="section" n="1"><p>Caput alterum.</p></div>
                </div>
              </div>`,
            }),
          },
        ],
        { label: "spot-featured" }
      );

      const work = report.works[0];
      const middle = work.pages.middle!;
      expect(middle).toBeDefined();
      expect(middle.pageId).toBe("1");
      expect(middle.label).toBe("FEATURED MARKUP");
      expect(middle.windowRange).toEqual(["1.10", "1.14"]);
      expect(middle.readerUrl).toBe("/work/varro/satura/1#sec-1.10");
      expect(middle.reason).toContain("featured:");
      expect(middle.reason).toContain("mixed verse+prose");
      expect(middle.reason).toContain("split/indented line");
      expect(middle.reason).toContain("blockquote");
      expect(middle.reason).toContain("foreign/greek");
      expect(middle.reason).toContain("1 note");
      // Notes are filtered strictly to the 5-row window (rows 10-14), excluding the note in row 1.
      expect(middle.previewHtml).toContain("Mid-page critical note");
      expect(middle.previewHtml).not.toContain("Opening footnote only");

      const html = formatGalleryHtml(report);
      expect(html).toContain("FEATURED MARKUP");
      expect(html).toContain("&sect;1.10&ndash;1.14");
      expect(html).toContain(`<span class="badge">${middle.reason}</span>`);
      expect(html).toContain("1 (&sect;1.10)");
    });

    it("prefers an unused structural boundary page (STRUCTURAL EDGE) for Slot 3 when present", () => {
      const analyzed = analyzeWorkForGallery({
        workId: LatinWorks.CAESAR_DBG,
        onboarded: true,
        rawXml: makeTei({
          title: "Comoedia",
          author: "Plautus",
          body: `<div type="edition" n="urn:x">
            <div type="textpart" subtype="chapter" n="1">
              <div type="textpart" subtype="section" n="1"><p>Initium.</p></div>
            </div>
            <div type="textpart" subtype="chapter" n="2">
              <div type="textpart" subtype="section" n="1"><p>Medium cum <foreign xml:lang="greek">τέχνη</foreign><note place="foot">Nota</note>.</p></div>
            </div>
            <div type="textpart" subtype="chapter" n="prol">
              <div type="textpart" subtype="section" n="1"><p>Prologus poetae.</p></div>
            </div>
            <div type="textpart" subtype="chapter" n="3">
              <div type="textpart" subtype="section" n="1"><p>Finis.</p></div>
            </div>
          </div>`,
        }),
      });
      const { first, middle, last } = analyzed.spotCheck.pages;
      expect(first?.pageId).toBe("1");
      expect(middle?.pageId).toBe("2");
      expect(middle?.label).toBe("FEATURED MARKUP");
      expect(last?.pageId).toBe("prol");
      expect(last?.label).toBe("STRUCTURAL EDGE");
      expect(last?.reason).toContain("boundary page (prol)");

      // B5 + N12 + N14: A verse work whose rows all have container class `section-verse`
      // and passage `<p class="reader-block">` (without `reader-line`) must NOT be tagged
      // "mixed verse+prose", and a letter-suffixed number like `14a` must NOT be treated
      // as a structural boundary page.
      const verseBlockRows = Array.from(
        { length: 6 },
        (_, i) =>
          `<div class="reader-section section-verse" id="sec-1.${
            i + 1
          }"><div class="reader-gutter"><span class="cite-local">${
            i + 1
          }</span></div><div class="reader-passage"><p class="reader-block">Elegia ${
            i + 1
          }</p></div></div>`
      ).join("\n");
      const unanchoredRow = `<div class="reader-section section-verse"><div class="reader-gutter"><span class="cite-local">99</span></div><div class="reader-passage"><p class="reader-block">Sine id</p></div></div>`;
      const checks = selectWorkSpotChecks({
        id: "phi0692.phi006",
        title: "Elegiae",
        author: "App. Verg.",
        urlAuthor: "app_verg",
        urlName: "elegiae",
        attribution: "perseus",
        hasMacra: false,
        hasTranslation: false,
        paginationDepth: 1,
        license: "Public Domain",
        tocHtml: "",
        textParts: ["poem", "line"],
        pages: [
          {
            id: ["1"],
            title: "Carmen 1",
            sectionCount: 6,
            citationRange: ["1.1", "1.6"],
            singleHtml: verseBlockRows,
          },
          {
            id: ["14a"],
            title: "Carmen 14a",
            sectionCount: 1,
            citationRange: ["14a.1", "14a.1"],
            singleHtml: unanchoredRow,
          },
          {
            id: ["15"],
            title: "Carmen 15",
            sectionCount: 1,
            citationRange: ["15.1", "15.1"],
            singleHtml: `<div class="reader-section section-verse" id="sec-15.1"><div class="reader-gutter"><span class="cite-local">1</span></div><div class="reader-passage"><p class="reader-block">Finis</p></div></div>`,
          },
        ],
        navTree: { id: [], children: [] },
      });
      for (const sp of checks.spotCheckPages) {
        expect(sp.reason ?? "").not.toContain("mixed verse+prose");
      }
      // `14a` is NOT a boundary page (`STRUCTURAL EDGE`), and un-id'd rows keep `page.citationRange` rather than `cite-local` ("99").
      expect(checks.middle?.pageId).toBe("14a");
      expect(checks.middle?.label).toBe("MIDPOINT");
      expect(checks.middle?.windowRange).toEqual(["14a.1", "14a.1"]);
      expect(checks.last?.pageId).toBe("15");
      expect(checks.last?.label).toBe("CLOSING");
    });

    it("pairs shifted spot-check windows by (pageId, windowStart) or slices from beforeRenderDir in renderGalleryDiffHtml", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-spot-shift-"));
      try {
        const WORK = "phi0448.phi001.perseus-lat2";
        const row = (sec: string, text: string) =>
          `<div class="reader-section" id="sec-${sec}"><div class="reader-gutter"><span class="cite-local">${sec}</span></div><div class="reader-passage"><p class="reader-block">${text}</p></div></div>`;

        const page1Rows = Array.from({ length: 15 }, (_, i) =>
          row(`1.${i + 1}`, `Sententia 1.${i + 1}`)
        );
        const page2Row = row("2.1", "Caput secundum");

        // Before gallery used old top-of-page middle on page 2 (`2.1`), while After
        // gallery uses a mid-page window on page 1 (`1.10`..`1.14`).
        const beforeWork = {
          workId: WORK,
          author: "Caesar",
          title: "DBG",
          urlAuthor: "caesar",
          urlName: "dbg",
          onboarded: true,
          rowCount: 16,
          citableRowCount: 16,
          pageCount: 2,
          textParts: ["chapter", "section"],
          markupKinds: [],
          pages: {
            first: {
              role: "first" as const,
              pageId: "1",
              title: "Liber 1",
              sectionCount: 15,
              citationRange: ["1.1", "1.15"] as [string, string],
              readerUrl: "/work/caesar/dbg/1",
              url: "/work/caesar/dbg/1",
              previewHtml: page1Rows.slice(0, 5).join("\n"),
            },
            middle: {
              role: "middle" as const,
              pageId: "2",
              title: "Liber 2",
              sectionCount: 1,
              citationRange: ["2.1", "2.1"] as [string, string],
              readerUrl: "/work/caesar/dbg/2",
              url: "/work/caesar/dbg/2",
              previewHtml: page2Row,
            },
          },
          spotCheckPages: [],
        };

        const makeAfterWork = (midRows: string[]) => ({
          ...beforeWork,
          pages: {
            first: beforeWork.pages.first,
            middle: {
              role: "middle" as const,
              pageId: "1",
              title: "Liber 1",
              sectionCount: 15,
              citationRange: ["1.1", "1.15"] as [string, string],
              windowRange: ["1.10", "1.14"] as [string, string],
              label: "FEATURED MARKUP",
              reason: "featured: foreign/greek",
              readerUrl: "/work/caesar/dbg/1#sec-1.10",
              url: "/work/caesar/dbg/1#sec-1.10",
              previewHtml: midRows.join("\n"),
            },
          },
          spotCheckPages: [],
        });

        const emptyReport = (
          label: string,
          w: typeof beforeWork
        ): GalleryReport => ({
          label,
          createdAt: "",
          root: tmp,
          includeCandidates: false,
          maxExamples: 3,
          totals: {
            worksProcessed: 1,
            onboardedCount: 1,
            candidateCount: 0,
            failedCount: 0,
            markupKindCount: 0,
          },
          markupKinds: [],
          kindsByName: {},
          works: [w],
          failures: {},
        });

        // 1. Without beforeRenderDir: do NOT diff `1.10..1.14` against `2.1`!
        const diffWithoutRender = renderGalleryDiffHtml(
          emptyReport("before", beforeWork),
          emptyReport("after", makeAfterWork(page1Rows.slice(9, 14)))
        );
        expect(diffWithoutRender).toContain(
          "No spot-check page differences detected."
        );
        expect(diffWithoutRender).toContain(
          "1 spot-check window skipped: no comparable Before window."
        );
        expect(diffWithoutRender).not.toContain("Caput secundum");

        // 2. With beforeRenderDir where `1.10..1.14` is unchanged on page 1:
        // slices `1.10..1.14` from beforeRenderDir and sees zero change.
        const beforeRender = path.join(tmp, "before-render");
        const afterRender = path.join(tmp, "after-render");
        fs.mkdirSync(path.join(beforeRender, WORK), { recursive: true });
        fs.mkdirSync(path.join(afterRender, WORK), { recursive: true });
        fs.writeFileSync(
          path.join(beforeRender, WORK, "1.html"),
          page1Rows.join("\n")
        );
        const modifiedPage1Rows = [...page1Rows];
        // Change row 1.8 (outside both first and middle windows) so page 1 hash differs.
        modifiedPage1Rows[7] = row("1.8", "Sententia 1.8 mutata");
        fs.writeFileSync(
          path.join(afterRender, WORK, "1.html"),
          modifiedPage1Rows.join("\n")
        );
        const writeIdx = (dir: string, h1: string) =>
          fs.writeFileSync(
            path.join(dir, "index.json"),
            JSON.stringify({
              version: 1,
              label: "r",
              createdAt: "",
              root: tmp,
              works: {
                [WORK]: {
                  id: WORK,
                  pages: [
                    {
                      id: "1",
                      file: "1",
                      title: "Liber 1",
                      sectionCount: 15,
                      citationRange: ["1.1", "1.15"],
                      html: h1,
                    },
                  ],
                },
              },
              failures: {},
            })
          );
        writeIdx(beforeRender, "hash-b");
        writeIdx(afterRender, "hash-a");

        const diffUnchangedWindow = renderGalleryDiffHtml(
          emptyReport("before", beforeWork),
          emptyReport("after", makeAfterWork(page1Rows.slice(9, 14))),
          undefined,
          undefined,
          { beforeRenderDir: beforeRender, afterRenderDir: afterRender }
        );
        expect(diffUnchangedWindow).toContain(
          "No spot-check page differences detected."
        );

        // 3. When row `1.10` inside the featured mid-page window actually changed,
        // Section 2 slices the old `1.10..1.14` from beforeRenderDir and shows the real diff!
        const changedMidRows = [
          row("1.10", 'Sententia 1.10 <span class="foreign">λόγος</span>'),
          ...page1Rows.slice(10, 14),
        ];
        const diffChangedWindow = renderGalleryDiffHtml(
          emptyReport("before", beforeWork),
          emptyReport("after", makeAfterWork(changedMidRows)),
          undefined,
          undefined,
          { beforeRenderDir: beforeRender, afterRenderDir: afterRender }
        );
        expect(diffChangedWindow).toContain(
          `data-review-id="diff-work:${WORK}"`
        );
        expect(diffChangedWindow).toContain("FEATURED MARKUP");
        expect(diffChangedWindow).toContain("&sect;1.10&ndash;1.14");
        expect(diffChangedWindow).toContain("featured: foreign/greek");
        expect(diffChangedWindow).toContain("Sententia 1.10");
        expect(diffChangedWindow).not.toContain("Caput secundum");
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe("Dark mode support in formatGalleryHtml & renderGalleryDiffHtml", () => {
    function createSampleReports() {
      const report1 = buildGalleryReportFromInputs(
        [
          {
            workId: LatinWorks.CAESAR_DBG,
            onboarded: true,
            rawXml: makeTei({
              title: "De bello Gallico",
              author: "Caesar",
              body: RICH_PROSE_BODY,
            }),
          },
        ],
        {
          label: "run-1",
          root: "/corpus/root",
          latinLitCommit: "aaaa1111",
          morcusCommit: "bbbb2222",
          maxExamples: 3,
        }
      );
      const report2 = buildGalleryReportFromInputs(
        [
          {
            workId: LatinWorks.CAESAR_DBG,
            onboarded: true,
            rawXml: makeTei({
              title: "De bello Gallico",
              author: "Caesar",
              body: RICH_PROSE_BODY,
            }),
          },
        ],
        {
          label: "run-2",
          root: "/corpus/root",
          latinLitCommit: "cccc3333",
          morcusCommit: "dddd4444",
          maxExamples: 3,
        }
      );
      return { report1, report2 };
    }

    it("formatGalleryHtml includes dark mode toggle pill, CSS variables, and early theme script", () => {
      const { report1 } = createSampleReports();
      const html = formatGalleryHtml(report1);

      expect(html).toContain('id="gallery-dark-mode"');
      expect(html).toContain('html[data-theme="dark"]');
      expect(html).toContain('body[data-theme="dark"]');
      expect(html).toContain("@media (prefers-color-scheme: dark)");
      expect(html).toContain("morcus-gallery-theme");
      expect(html).toContain("color-scheme: light dark;");
      expect(html).toContain("--bg: #141413");
      expect(html).toContain("--surface: #1e1e1c");
      expect(html).toContain("--reviewed-bg");
      expect(html).toContain("--reviewed-surface");
      expect(html).toContain("--reviewed-border");
      expect(html).toContain("--reviewed-fg");
    });

    it("renderGalleryDiffHtml includes dark mode toggle pill, CSS variables, and early theme script", () => {
      const { report1, report2 } = createSampleReports();
      const html = renderGalleryDiffHtml(report1, report2);

      expect(html).toContain('id="gallery-dark-mode"');
      expect(html).toContain('html[data-theme="dark"]');
      expect(html).toContain('body[data-theme="dark"]');
      expect(html).toContain("@media (prefers-color-scheme: dark)");
      expect(html).toContain("morcus-gallery-theme");
      expect(html).toContain("var(--diff-del-bg)");
      expect(html).toContain("var(--diff-ins-bg)");
      expect(html).toContain(
        ":is(.badge-status-changed, .diff-status-changed)"
      );
    });

    it("toggling #gallery-dark-mode in jsdom updates data-theme and localStorage in formatGalleryHtml", () => {
      const { report1 } = createSampleReports();
      const html = formatGalleryHtml(report1);

      const dom = new JSDOM(html, {
        runScripts: "dangerously",
        url: "https://example.com/gallery.html",
      });

      const checkbox = dom.window.document.getElementById(
        "gallery-dark-mode"
      ) as HTMLInputElement | null;
      expect(checkbox).not.toBeNull();
      expect(checkbox!.checked).toBe(false);
      expect(
        dom.window.document.documentElement.getAttribute("data-theme")
      ).toBeNull();

      // Toggle dark mode ON
      checkbox!.checked = true;
      checkbox!.dispatchEvent(
        new dom.window.Event("change", { bubbles: true })
      );

      expect(
        dom.window.document.documentElement.getAttribute("data-theme")
      ).toBe("dark");
      expect(dom.window.document.body.getAttribute("data-theme")).toBe("dark");
      expect(dom.window.localStorage.getItem("morcus-gallery-theme")).toBe(
        "dark"
      );

      // Toggle dark mode OFF
      checkbox!.checked = false;
      checkbox!.dispatchEvent(
        new dom.window.Event("change", { bubbles: true })
      );

      expect(
        dom.window.document.documentElement.getAttribute("data-theme")
      ).toBe("light");
      expect(dom.window.document.body.getAttribute("data-theme")).toBe("light");
      expect(dom.window.localStorage.getItem("morcus-gallery-theme")).toBe(
        "light"
      );
    });

    it("initializes dark mode on load when localStorage has saved 'dark' in formatGalleryHtml", () => {
      const { report1 } = createSampleReports();
      const html = formatGalleryHtml(report1);

      const dom = new JSDOM(html, {
        runScripts: "dangerously",
        url: "https://example.com/gallery.html",
        beforeParse(window) {
          window.localStorage.setItem("morcus-gallery-theme", "dark");
        },
      });

      expect(
        dom.window.document.documentElement.getAttribute("data-theme")
      ).toBe("dark");
      expect(dom.window.document.body.getAttribute("data-theme")).toBe("dark");
      const checkbox = dom.window.document.getElementById(
        "gallery-dark-mode"
      ) as HTMLInputElement | null;
      expect(checkbox).not.toBeNull();
      expect(checkbox!.checked).toBe(true);
    });

    it("toggling #gallery-dark-mode in jsdom updates data-theme and localStorage in renderGalleryDiffHtml", () => {
      const { report1, report2 } = createSampleReports();
      const html = renderGalleryDiffHtml(report1, report2);

      const dom = new JSDOM(html, {
        runScripts: "dangerously",
        url: "https://example.com/diff.html",
      });

      const checkbox = dom.window.document.getElementById(
        "gallery-dark-mode"
      ) as HTMLInputElement | null;
      expect(checkbox).not.toBeNull();
      expect(checkbox!.checked).toBe(false);

      // Toggle dark mode ON
      checkbox!.checked = true;
      checkbox!.dispatchEvent(
        new dom.window.Event("change", { bubbles: true })
      );

      expect(
        dom.window.document.documentElement.getAttribute("data-theme")
      ).toBe("dark");
      expect(dom.window.document.body.getAttribute("data-theme")).toBe("dark");
      expect(dom.window.localStorage.getItem("morcus-gallery-theme")).toBe(
        "dark"
      );

      // Toggle dark mode OFF
      checkbox!.checked = false;
      checkbox!.dispatchEvent(
        new dom.window.Event("change", { bubbles: true })
      );

      expect(
        dom.window.document.documentElement.getAttribute("data-theme")
      ).toBe("light");
      expect(dom.window.document.body.getAttribute("data-theme")).toBe("light");
      expect(dom.window.localStorage.getItem("morcus-gallery-theme")).toBe(
        "light"
      );
    });

    it("initializes dark mode on load when localStorage has saved 'dark' in renderGalleryDiffHtml", () => {
      const { report1, report2 } = createSampleReports();
      const html = renderGalleryDiffHtml(report1, report2);

      const dom = new JSDOM(html, {
        runScripts: "dangerously",
        url: "https://example.com/diff.html",
        beforeParse(window) {
          window.localStorage.setItem("morcus-gallery-theme", "dark");
        },
      });

      expect(
        dom.window.document.documentElement.getAttribute("data-theme")
      ).toBe("dark");
      expect(dom.window.document.body.getAttribute("data-theme")).toBe("dark");
      const checkbox = dom.window.document.getElementById(
        "gallery-dark-mode"
      ) as HTMLInputElement | null;
      expect(checkbox).not.toBeNull();
      expect(checkbox!.checked).toBe(true);
    });
  });
});
