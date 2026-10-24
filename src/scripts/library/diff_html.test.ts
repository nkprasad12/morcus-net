import {
  mergeDelta,
  normalizeHtml,
  summarizePageDiff,
  tokenizeHtml,
} from "@/scripts/library/diff_html";

describe("normalizeHtml", () => {
  it("ignores attribute order, class order and quoting", () => {
    expect(normalizeHtml(`<span class="b a" data-x='1' id=q>t</span>`)).toEqual(
      normalizeHtml(`<span id="q" data-x="1" class="a  b">t</span>`)
    );
  });

  it("decodes character references in text and attributes", () => {
    expect(
      normalizeHtml(`<a title="&#39;x&#39;">it&#x27;s &amp; </a>`)
    ).toEqual(normalizeHtml(`<a title="'x'">it's &amp; </a>`));
  });

  it("keeps whitespace in text significant", () => {
    expect(normalizeHtml("<p>ab</p>")).not.toEqual(normalizeHtml("<p>a b</p>"));
  });

  it("lower-cases tag and attribute names and handles self-closing tags", () => {
    expect(normalizeHtml(`<BR CLASS="x"/>`)).toEqual(`<br class="x" />`);
  });
});

describe("tokenizeHtml", () => {
  it("splits words, spaces, tags and comments", () => {
    const tokens = tokenizeHtml(`<p class="x">arma virumque<!-- c --></p>`);
    expect(tokens.map((t) => [t.kind, t.norm])).toEqual([
      ["start", `<p class="x">`],
      ["text", "arma"],
      ["text", " "],
      ["text", "virumque"],
      ["comment", "<!-- c -->"],
      ["end", "</p>"],
    ]);
  });

  it("treats a stray < as text", () => {
    expect(tokenizeHtml("a < b").map((t) => t.kind)).toEqual([
      "text",
      "text",
      "text",
      "text",
      "text",
    ]);
  });
});

describe("summarizePageDiff", () => {
  it("reports identical input as unchanged", () => {
    const s = summarizePageDiff("<p>x</p>", "<p>x</p>");
    expect(s.changed).toBe(false);
    expect(s.rawChanged).toBe(false);
    expect(s.hunks).toEqual([]);
  });

  it("reports attribute reordering as cosmetic only", () => {
    const s = summarizePageDiff(
      `<div class="a b" id="s1">x</div>`,
      `<div id="s1" class="b a">x</div>`
    );
    expect(s.changed).toBe(false);
    expect(s.rawChanged).toBe(true);
  });

  it("counts tag, class and attribute deltas", () => {
    const s = summarizePageDiff(
      `<div class="reader-section"><span class="indent">a</span> b</div>`,
      `<div class="reader-section" id="sec-1"><em>a</em> <em>b</em></div>`
    );
    expect(s.changed).toBe(true);
    expect(s.textChanged).toBe(false);
    expect(s.tags).toEqual({ em: 2, span: -1 });
    expect(s.classes).toEqual({ indent: -1 });
    expect(s.attrs).toEqual({ "div@id": 1 });
  });

  it("renders a word-level hunk with context", () => {
    const s = summarizePageDiff(
      "<p>Gallia est omnis divisa in partes tres</p>",
      "<p>Gallia est omnis divisa in partes quattuor</p>"
    );
    expect(s.textChanged).toBe(true);
    expect(s.hunkCount).toBe(1);
    expect(s.hunks[0].text).toBe(
      "omnis divisa in partes [-tres-]{+quattuor+}</p>"
    );
    expect(s.hunks[0]).toMatchObject({ removed: 1, added: 1 });
  });

  it("folds nearby changes into one hunk and caps the hunk count", () => {
    const words = (n: number, mark: (i: number) => string) =>
      Array.from({ length: n }, (_, i) => mark(i)).join(" ");
    const before = words(200, (i) => `w${i}`);
    // Change words 10 and 11 (adjacent: one hunk) and every 30th word after.
    const after = words(200, (i) =>
      i === 10 || i === 11 || (i > 20 && i % 30 === 0) ? `X${i}` : `w${i}`
    );
    const s = summarizePageDiff(before, after, { maxHunks: 2 });
    expect(s.hunkCount).toBe(1 + 6);
    expect(s.hunks).toHaveLength(2);
    expect(s.hunks[0].text).toBe(
      "w6 w7 w8 w9 [-w10-]{+X10+} [-w11-]{+X11+} w12 w13 w14 w15"
    );
  });

  it("counts a repeated mechanical change as one pattern", () => {
    const row = (i: number, cls: string) =>
      `<div class="${cls}" id="sec-${i}">w${i}</div>`;
    const before = [1, 2, 3].map((i) => row(i, "s")).join("\n");
    const after = [1, 2, 3].map((i) => row(i, "s indent")).join("\n");
    const s = summarizePageDiff(before, after, { maxHunks: 1 });
    expect(s.hunkCount).toBe(3);
    expect(s.patterns).toEqual({
      '[-<div class="s" id="sec-#">-]{+<div class="indent s" id="sec-#">+}': 3,
    });
    expect(s.hunks[0].signature).toBe(Object.keys(s.patterns)[0]);
  });

  it("handles a fragment that appears or disappears", () => {
    const added = summarizePageDiff(undefined, `<ol><li>n</li></ol>`);
    expect(added.changed).toBe(true);
    expect(added.tags).toEqual({ li: 1, ol: 1 });
    const removed = summarizePageDiff(`<ol><li>n</li></ol>`, undefined);
    expect(removed.tags).toEqual({ li: -1, ol: -1 });
  });

  it("gives up on huge diffs but still counts markup", () => {
    const before = Array.from({ length: 300 }, (_, i) => `a${i}`).join(" ");
    const after = Array.from({ length: 300 }, (_, i) => `<b>b${i}</b>`).join(
      " "
    );
    const s = summarizePageDiff(before, after, { maxEditLength: 10 });
    expect(s.changed).toBe(true);
    expect(s.tooLarge).toBe(true);
    expect(s.tags).toEqual({ b: 300 });
  });
});

describe("mergeDelta", () => {
  it("sums and drops zeroes", () => {
    expect(mergeDelta({ a: 1, b: 2 }, { a: -1, c: 3 })).toEqual({ b: 2, c: 3 });
  });
});
