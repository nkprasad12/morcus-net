import fs from "fs";
import path from "path";

import {
  decodeLatinLibraryHtmlBytes,
  sniffDeclaredCharset,
} from "@/common/thelatinlibrary/encoding";

const latin1 = (s: string) =>
  Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xff));
const utf8 = (s: string) => new TextEncoder().encode(s);

describe("sniffDeclaredCharset", () => {
  it("reads <meta charset> and http-equiv forms", () => {
    expect(sniffDeclaredCharset(utf8(`<meta charset="ISO-8859-1">`))).toBe(
      "iso-8859-1"
    );
    expect(
      sniffDeclaredCharset(
        utf8(
          `<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=windows-1252">`
        )
      )
    ).toBe("windows-1252");
    expect(sniffDeclaredCharset(utf8(`<html><head></head>`))).toBeUndefined();
  });

  it("only looks at the first 1,024 bytes", () => {
    const late = " ".repeat(1100) + `<meta charset="iso-8859-1">`;
    expect(sniffDeclaredCharset(utf8(late))).toBeUndefined();
  });
});

describe("decodeLatinLibraryHtmlBytes", () => {
  it("decodes UTF-8 pages", () => {
    const html = `<meta charset="utf-8"><p>Cæsar — “Gallia” ā ē</p>`;
    expect(decodeLatinLibraryHtmlBytes(utf8(html))).toBe(html);
  });

  it("decodes undeclared UTF-8", () => {
    expect(decodeLatinLibraryHtmlBytes(utf8("<p>æquus</p>"))).toBe(
      "<p>æquus</p>"
    );
  });

  it("decodes declared ISO-8859-1 as windows-1252", () => {
    const html = `<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"><p>C\u00e6sar \u00eb</p>`;
    expect(decodeLatinLibraryHtmlBytes(latin1(html))).toBe(html);
    // 0x93/0x94 are curly quotes in windows-1252.
    const quoted = Uint8Array.from([
      ...latin1(`<meta charset="iso-8859-1">`),
      0x93,
      0x61,
      0x94,
    ]);
    expect(decodeLatinLibraryHtmlBytes(quoted)).toBe(
      `<meta charset="iso-8859-1">\u201ca\u201d`
    );
  });

  it("falls back to windows-1252 for invalid UTF-8 with no declaration", () => {
    const bytes = latin1("<p>pr\u00e6tor \u00e9dition</p>");
    const decoded = decodeLatinLibraryHtmlBytes(bytes);
    expect(decoded).toBe("<p>pr\u00e6tor \u00e9dition</p>");
    expect(decoded).not.toContain("\uFFFD");
  });

  it("accepts an ArrayBuffer and drops a UTF-8 BOM", () => {
    const withBom = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8("<p>a</p>")]);
    expect(decodeLatinLibraryHtmlBytes(withBom.buffer)).toBe("<p>a</p>");
  });

  it("decodes UTF-16LE and UTF-16BE pages with a BOM", () => {
    const le = Uint8Array.from([
      0xff, 0xfe, 0x3c, 0x00, 0x70, 0x00, 0x3e, 0x00, 0xe6, 0x00, 0x3c, 0x00,
      0x2f, 0x00, 0x70, 0x00, 0x3e, 0x00,
    ]);
    const be = Uint8Array.from([
      0xfe, 0xff, 0x00, 0x3c, 0x00, 0x70, 0x00, 0x3e, 0x00, 0xe6, 0x00, 0x3c,
      0x00, 0x2f, 0x00, 0x70, 0x00, 0x3e,
    ]);
    expect(decodeLatinLibraryHtmlBytes(le)).toBe("<p>æ</p>");
    expect(decodeLatinLibraryHtmlBytes(be)).toBe("<p>æ</p>");
  });

  it("handles empty input", () => {
    expect(decodeLatinLibraryHtmlBytes(new Uint8Array())).toBe("");
  });

  const envFile = path.join(process.cwd(), ".env");
  const root =
    process.env.THELATINLIBRARY_ROOT ??
    (fs.existsSync(envFile)
      ? /^THELATINLIBRARY_ROOT=(.*)$/m
          .exec(fs.readFileSync(envFile, "utf8"))?.[1]
          .trim()
      : undefined);
  const gaius1 =
    root === undefined ? undefined : path.join(root, "raw", "gaius1.html");
  const describeIfGaius =
    gaius1 !== undefined && fs.existsSync(gaius1) ? describe : describe.skip;
  describeIfGaius("on the snapshot", () => {
    it("decodes the Latin-1 raw/gaius1.html without U+FFFD", () => {
      const bytes = fs.readFileSync(gaius1!);
      const decoded = decodeLatinLibraryHtmlBytes(bytes);
      expect(decoded).not.toContain("\uFFFD");
      expect(decoded).toContain("GAI INSTITVTIONVM");
      // A naive UTF-8 read corrupts it.
      expect(bytes.toString("utf8")).toContain("\uFFFD");
    });
  });
});
