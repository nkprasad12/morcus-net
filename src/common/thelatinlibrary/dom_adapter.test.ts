import { JSDOM } from "jsdom";
import { parse } from "parse5";

import {
  adaptDomElement,
  createParse5BodyParser,
  defaultHtmlBodyParser,
  domParserBodyParser,
  extractLenientPage,
  extractText,
  findElements,
  getAttr,
  hasClass,
  isElement,
  parseHtmlToMinimalBody,
  setDefaultHtmlBodyParser,
  type MinimalElementNode,
} from "@/common/thelatinlibrary";

const parse5Parser = createParse5BodyParser(parse);

/** Representative Latin Library layouts (pilot and non-pilot). */
const SAMPLES: Record<string, string> = {
  resgestae: `<!DOCTYPE html><html><head><title>Res Gestae</title>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head>
    <body><h1>RES GESTAE DIVI AVGVSTI</h1>
    <p class="internal_navigation"><a href="#1">1</a> <a href="#2">2</a></p>
    <p>Rerum gestarum divi Augusti, quibus orbem terrarum.</p>
    <p>[<a name="1">1</a>] Annos undeviginti natus exercitum privato consilio.</p>
    <p>[<a name="2">2</a>] Qui parentem meum trucidaverunt, eos in exilium expuli.</p>
    <p>[1] Appendix.</p>
    <div class="footer"><p><a href="/aug.html">Augustus</a> <a href="/index.html">The Latin Library</a></p></div>
    </body></html>`,
  justin: `<html><head><title>Justin XI</title></head><body>
    <p class=pagehead>IVSTINI EPITOMA LIBER XI</p><p class=border></p>
    <div align="center">LIBER XI</div>
    <p>I. In exercitu Alexandri 2 diversus animorum motus. [II] Post haec.</p>
    <p>II. Inde Thebas petit.</p>
    <p class=border></p>
    <p><table border=0><tr><td><a href="/justin.html">Justin</a><td><a href="/index.html">The Latin Library</a></table></p>
    </body></html>`,
  gaius: `<html><body><p class="pagehead">GAI INSTITVTIONVM COMMENTARIVS PRIMVS</p>
    <p class="margin"><a href="#1">1</a> <a href="#2">2</a></p>
    <p>[I. De iure civili et naturali.] <a name="1">1.</a> Omnes populi &amp; gentes.
    <a name="2">2.</a> Constant autem iura populi Romani.</p>
    <p class=border></p></body></html>`,
  digest: `<html><body><p class=pagehead>DIGESTORUM LIBER PRIMUS</p>
    <div align="center">LIBER PRIMUS</div>
    <p>Dig. 1.1.0. De iustitia et iure. <br> Dig. 1.2.0. De origine iuris.</p>
    <p><b>Dig. 1.1.0. De iustitia et iure.</b></p>
    <p>Dig. 1.1.1pr.</p><p>Ulpianus 1 inst.</p><p>Iuri operam daturum.</p>
    <div class="footer">The Latin Library</div></body></html>`,
  poetry: `<!DOCTYPE html><html><body><div class="page_wrapper">
    <h1>VERGILI AENEIDOS LIBER PRIMVS</h1>
    <p class="poem">Arma virumque cano, Troiae qui primus ab oris<br>
    Italiam, fato profugus, Laviniaque venit<br>
    litora, multum ille et terris iactatus et alto</p>
    </div></body></html>`,
  loose: `<html><body>Textus solus<br>linea altera<br><br><i>alia</i> &nbsp; pars
    <center><hr></center><h2>CAPVT II</h2><ul><li>unus</li><li>duo</li></ul>
    <blockquote><p>citatio</p></blockquote><!-- comment --></body></html>`,
};

function withDomParser<T>(fn: () => T): T {
  const g = globalThis as { DOMParser?: unknown };
  const original = g.DOMParser;
  g.DOMParser = new JSDOM("").window.DOMParser;
  try {
    return fn();
  } finally {
    g.DOMParser = original;
  }
}

describe("node helpers", () => {
  const { body } = parseHtmlToMinimalBody(
    `<html><body><p class="a  b" ID="x">t <a name="n">u</a></p><!--c--></body></html>`,
    parse5Parser
  );
  const p = body.childNodes.find(isElement)!;

  it("reads attributes and classes", () => {
    expect(getAttr(p, "id")).toBe("x");
    expect(getAttr(p, "missing")).toBeUndefined();
    expect(hasClass(p, "b")).toBe(true);
    expect(hasClass(p, "c")).toBe(false);
    expect(isElement(body.childNodes[1])).toBe(false);
  });

  it("finds descendants in document order", () => {
    expect(findElements(body, () => true).map((e) => e.tagName)).toEqual([
      "p",
      "a",
    ]);
  });

  it("extracts text like the pilot, optionally keeping line breaks", () => {
    const { body: b } = parseHtmlToMinimalBody(
      `<p>  Arma&nbsp;virumque <br> cano,<br><br><br>Troiae <script>x</script>qui</p>`,
      parse5Parser
    );
    const para = b.childNodes.find(isElement)!;
    expect(extractText(para)).toBe("Arma virumque cano, Troiae qui");
    expect(extractText(para, { preserveLineBreaks: true })).toBe(
      "Arma virumque\ncano,\n\nTroiae qui"
    );
  });

  it("separates words at block boundaries", () => {
    const { body: b } = parseHtmlToMinimalBody(
      `<table><tr><td>Liber I</td><td>Liber II</td></tr></table><div><p>So. Dic<p>Am. Cibus</div>`,
      parse5Parser
    );
    expect(extractText(b)).toBe("Liber I Liber II So. Dic Am. Cibus");
  });

  it("returns the head title", () => {
    expect(
      parseHtmlToMinimalBody(
        "<title> Caesar:\n Gallic War </title><p>x</p>",
        parse5Parser
      ).headTitle
    ).toBe("Caesar: Gallic War");
  });
});

describe("DOMParser adapter", () => {
  it("adapts DOM elements into the minimal shape", () => {
    const doc = new JSDOM(
      `<body><P CLASS="x" Data-Y="1">a<BR>b<!--c--></P></body>`
    ).window.document;
    const body = adaptDomElement(doc.body);
    const p = body.childNodes[0] as MinimalElementNode;
    expect(p.tagName).toBe("p");
    expect(p.attrs).toEqual([
      { name: "class", value: "x" },
      { name: "data-y", value: "1" },
    ]);
    expect(p.childNodes).toEqual([
      { nodeName: "#text", value: "a" },
      { tagName: "br", attrs: [], childNodes: [] },
      { nodeName: "#text", value: "b" },
      { nodeName: "#comment" },
    ]);
  });

  it("is the default parser when DOMParser exists", () => {
    expect(defaultHtmlBodyParser()).toBeUndefined();
    withDomParser(() => {
      expect(defaultHtmlBodyParser()).toBe(domParserBodyParser);
      const page = extractLenientPage(SAMPLES.resgestae);
      expect(page.pageTitle).toBe("RES GESTAE DIVI AVGVSTI");
    });
  });

  it("falls back to a registered parser", () => {
    setDefaultHtmlBodyParser(parse5Parser);
    try {
      expect(defaultHtmlBodyParser()).toBe(parse5Parser);
      expect(extractLenientPage(SAMPLES.justin).headings).toEqual(["LIBER XI"]);
    } finally {
      setDefaultHtmlBodyParser(undefined);
    }
  });

  it.each(Object.keys(SAMPLES))(
    "gives the same LenientPageContent as parse5 on %s",
    (name) => {
      const html = SAMPLES[name];
      for (const preserveLineBreaks of [false, true]) {
        const viaParse5 = extractLenientPage(html, {
          parser: parse5Parser,
          preserveLineBreaks,
        });
        const viaDom = withDomParser(() =>
          extractLenientPage(html, {
            parser: domParserBodyParser,
            preserveLineBreaks,
          })
        );
        // Element objects differ (parse5 nodes carry parent pointers etc.),
        // so compare everything through a plain projection.
        const project = (page: typeof viaParse5) =>
          JSON.parse(
            JSON.stringify(page, (key, value) =>
              key === "element" || key === "paragraphs" ? undefined : value
            )
          );
        expect(project(viaDom)).toEqual(project(viaParse5));
        expect(viaDom.paragraphs.map((p) => extractText(p))).toEqual(
          viaParse5.paragraphs.map((p) => extractText(p))
        );
        expect(viaDom.blocks.length).toBeGreaterThan(0);
      }
      expect(
        withDomParser(() => parseHtmlToMinimalBody(html, domParserBodyParser))
          .headTitle
      ).toBe(parseHtmlToMinimalBody(html, parse5Parser).headTitle);
    }
  );
});
