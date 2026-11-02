import crypto from "crypto";
import fs from "fs";
import path from "path";
import * as parse5 from "parse5";
import { parseLatinLibraryExperimentalText } from "@/common/experimental_texts/latin_library_adapter";
import { EXPERIMENTAL_TEXT_DOCUMENT_VERSION } from "@/common/experimental_texts/experimental_text_document";
import {
  createParse5BodyParser,
  decodeLatinLibraryHtmlBytes,
} from "@/common/thelatinlibrary";

const parse5BodyParser = createParse5BodyParser(parse5.parse);

describe("latin_library_adapter", () => {
  it("parses single-page prose with pagination: 'chunks' and preserves inline styles", () => {
    const html = `
      <html>
        <head><title>Abbo Floriacensis</title></head>
        <body>
          <p class="pagehead">PASSIO SANCTI EDMUNDI</p>
          <p>Incipit <i>passio</i> sancti <b>Edmundi</b> regis et martyris.</p>
          <p>Explicit passio.</p>
        </body>
      </html>
    `;

    const doc = parseLatinLibraryExperimentalText(
      [{ path: "raw/abbofloracensis.html", html }],
      { author: "Abbo of Fleury", parser: parse5BodyParser }
    );

    expect(doc.title).toBe("PASSIO SANCTI EDMUNDI");
    expect(doc.author).toBe("Abbo of Fleury");
    expect(doc.pagination).toBe("chunks");
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].id).toBe("1");
    expect(doc.pages[0].blocks).toEqual([
      {
        kind: "paragraph",
        segments: [
          { kind: "text", text: "Incipit " },
          { kind: "text", text: "passio", style: { italic: true } },
          { kind: "text", text: " sancti " },
          { kind: "text", text: "Edmundi", style: { bold: true } },
          { kind: "text", text: " regis et martyris." },
        ],
      },
      {
        kind: "paragraph",
        segments: [{ kind: "text", text: "Explicit passio." }],
      },
    ]);
  });

  it("parses single-page verse (<br> / class='poetry') into 'line' blocks with stanzaStart: true", () => {
    const html = `
      <html>
        <body>
          <h1>CARMEN</h1>
          <p class="poetry">
            Arma virumque cano,<br>
            Troiae qui primus ab oris<br>
            Italiam fato profugus
          </p>
          <p class="poetry">
            Musa, mihi causas memora,<br>
            quo numine laeso
          </p>
        </body>
      </html>
    `;

    const doc = parseLatinLibraryExperimentalText(
      [{ path: "raw/carmen.html", html }],
      {
        parser: parse5BodyParser,
      }
    );

    expect(doc.pagination).toBe("chunks");
    expect(doc.pages).toHaveLength(1);
    const lines = doc.pages[0].blocks;
    expect(lines).toHaveLength(5);
    expect(lines[0]).toEqual({
      kind: "line",
      stanzaStart: true,
      segments: [{ kind: "text", text: "Arma virumque cano," }],
    });
    expect(lines[1]).toEqual({
      kind: "line",
      segments: [{ kind: "text", text: "Troiae qui primus ab oris" }],
    });
    expect(lines[2]).toEqual({
      kind: "line",
      segments: [{ kind: "text", text: "Italiam fato profugus" }],
    });
    expect(lines[3]).toEqual({
      kind: "line",
      stanzaStart: true,
      segments: [{ kind: "text", text: "Musa, mihi causas memora," }],
    });
    expect(lines[4]).toEqual({
      kind: "line",
      segments: [{ kind: "text", text: "quo numine laeso" }],
    });
  });

  it("emits section markers for bracketed/bare numbers without duplicating the raw token inline", () => {
    const html = `
      <html>
        <body>
          <h1>RES GESTAE</h1>
          <p>[1] Annos undeviginti natus exercitum privato consilio comparavi.</p>
          <p>2. Omnis provincias populi Romani recuperavi.</p>
        </body>
      </html>
    `;

    const doc = parseLatinLibraryExperimentalText(
      [{ path: "raw/resgestae.html", html }],
      { parser: parse5BodyParser }
    );

    expect(doc.pages[0].blocks).toEqual([
      {
        kind: "paragraph",
        segments: [
          { kind: "section", label: "1" },
          {
            kind: "text",
            text: "Annos undeviginti natus exercitum privato consilio comparavi.",
          },
        ],
      },
      {
        kind: "paragraph",
        segments: [
          { kind: "section", label: "2" },
          {
            kind: "text",
            text: "Omnis provincias populi Romani recuperavi.",
          },
        ],
      },
    ]);
  });

  it("parses multi-page works with pagination: 'pageBreaks' and one ExperimentalTextPage per file", () => {
    const columba1 = `
      <html>
        <body>
          <h1>VITA SANCTI COLUMBAE: LIBER I</h1>
          <p>Incipit liber primus.</p>
        </body>
      </html>
    `;
    const columba2 = `
      <html>
        <body>
          <h1>VITA SANCTI COLUMBAE: LIBER II</h1>
          <p>Incipit liber secundus.</p>
        </body>
      </html>
    `;

    const doc = parseLatinLibraryExperimentalText(
      [
        { path: "raw/columba1.html", html: columba1 },
        { path: "raw/columba2.html", html: columba2 },
      ],
      {
        author: "Adomnán",
        title: "Vita Sancti Columbae",
        parser: parse5BodyParser,
      }
    );

    expect(doc.pagination).toBe("pageBreaks");
    expect(doc.author).toBe("Adomnán");
    expect(doc.title).toBe("Vita Sancti Columbae");
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[0]).toMatchObject({
      id: "1",
      label: "VITA SANCTI COLUMBAE: LIBER I",
    });
    expect(doc.pages[1]).toMatchObject({
      id: "2",
      label: "VITA SANCTI COLUMBAE: LIBER II",
    });
  });

  it("decodes ISO-8859-1 / windows-1252 bytes without U+FFFD replacement characters", () => {
    // "Gaius § 1 — quaestio" in windows-1252: § = 0xA7, — = 0x97, é = 0xE9
    const latin1Bytes = new Uint8Array([
      0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0x3c, 0x62, 0x6f, 0x64, 0x79, 0x3e,
      0x3c, 0x70, 0x3e, 0x47, 0x61, 0x69, 0x75, 0x73, 0x20, 0xa7, 0x20, 0x31,
      0x20, 0x97, 0x20, 0x70, 0x72, 0x61, 0x65, 0x74, 0x6f, 0x72, 0xe9, 0x3c,
      0x2f, 0x70, 0x3e, 0x3c, 0x2f, 0x62, 0x6f, 0x64, 0x79, 0x3e, 0x3c, 0x2f,
      0x68, 0x74, 0x6d, 0x6c, 0x3e,
    ]);

    const decoded = decodeLatinLibraryHtmlBytes(latin1Bytes);
    expect(decoded).not.toContain("\uFFFD");
    expect(decoded).toContain("Gaius § 1 — praetoré");

    const doc = parseLatinLibraryExperimentalText(
      [{ path: "raw/gaius1.html", html: decoded }],
      { parser: parse5BodyParser }
    );
    expect(doc.pages[0].blocks[0].segments).toEqual([
      { kind: "text", text: "Gaius § 1 — praetoré" },
    ]);
  });

  it("chunks long single-page prose at heading boundaries", () => {
    const html = `
      <html>
        <body>
          <h1>LONG WORK</h1>
          <h2>CAPUT I</h2>
          <p>${"a".repeat(80)}</p>
          <h2>CAPUT II</h2>
          <p>${"b".repeat(80)}</p>
        </body>
      </html>
    `;

    const doc = parseLatinLibraryExperimentalText(
      [{ path: "raw/long.html", html }],
      {
        parser: parse5BodyParser,
        chunkTargetChars: 100,
      }
    );

    expect(doc.pagination).toBe("chunks");
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[0].label).toBe("CAPUT I");
    expect(doc.pages[1].label).toBe("CAPUT II");
  });

  it("matches the golden hash for EXPERIMENTAL_TEXT_DOCUMENT_VERSION on sample_ll.html", () => {
    const sampleHtml = fs.readFileSync(
      path.join(__dirname, "testdata/sample_ll.html"),
      "utf8"
    );
    const parsed = parseLatinLibraryExperimentalText(
      [{ path: "raw/abbofloracensis.html", html: sampleHtml }],
      { author: "Abbo of Fleury", parser: parse5BodyParser }
    );
    const actualHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(parsed))
      .digest("hex");
    const expectedByVersion: Readonly<Record<number, string>> = {
      1: "77b8673b7dd1d7f1695ec6b9602c2c3ff2c0bf76d7ec3c2425c108399b0446b9",
    };
    const expectedHash = expectedByVersion[EXPERIMENTAL_TEXT_DOCUMENT_VERSION];
    if (actualHash !== expectedHash) {
      throw new Error(
        `parser output changed: bump EXPERIMENTAL_TEXT_DOCUMENT_VERSION and add the new hash (expected ${String(
          expectedHash
        )}, got ${actualHash})`
      );
    }
  });
});
