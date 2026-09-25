/**
 * @jest-environment jsdom
 */
import {
  isLatinWord,
  tokenizeSubtree,
  tokenizeTargets,
} from "@/web/v2/core/tokenize.client";

describe("isLatinWord", () => {
  it("identifies plain Latin words", () => {
    expect(isLatinWord("Gallia", true)).toEqual({
      isLatin: true,
      cleanWord: "Gallia",
    });
    expect(isLatinWord("omnis", true)).toEqual({
      isLatin: true,
      cleanWord: "omnis",
    });
  });

  it("handles combining diacritics and macra", () => {
    expect(isLatinWord("Mu\u0304sa", true)).toEqual({
      isLatin: true,
      cleanWord: "Musa",
    });
    expect(isLatinWord("M\u016Bsa", true)).toEqual({
      isLatin: true,
      cleanWord: "Musa",
    });
  });

  it("rejects non-words and tokens with numbers", () => {
    expect(isLatinWord(",", false)).toEqual({
      isLatin: false,
      cleanWord: ",",
    });
    expect(isLatinWord("123", true)).toEqual({
      isLatin: false,
      cleanWord: "123",
    });
    expect(isLatinWord("sec1", true)).toEqual({
      isLatin: false,
      cleanWord: "sec1",
    });
  });
});

describe("tokenizeSubtree", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("tokenizes plain Latin text into custom elements", () => {
    const div = document.createElement("div");
    div.innerHTML = "Gallia est omnis divisa in partes tres.";
    document.body.appendChild(div);

    tokenizeSubtree(div, {
      renderWord: (token, cleanWord) => {
        const span = document.createElement("span");
        span.className = "lat-word";
        span.dataset.word = cleanWord;
        span.textContent = token;
        return span;
      },
    });

    const spans = div.querySelectorAll(".lat-word");
    expect(spans).toHaveLength(7);
    expect(spans[0].textContent).toBe("Gallia");
    expect(spans[0].getAttribute("data-word")).toBe("Gallia");
    expect(div.textContent).toBe("Gallia est omnis divisa in partes tres.");
  });

  it("is idempotent and avoids double-tokenizing", () => {
    const div = document.createElement("div");
    div.innerHTML = "Arma virumque cano";
    document.body.appendChild(div);

    const renderWord = (token: string) => {
      const span = document.createElement("span");
      span.className = "lat-word";
      span.textContent = token;
      return span;
    };

    tokenizeSubtree(div, { renderWord });
    expect(div.querySelectorAll(".lat-word")).toHaveLength(3);
    expect(div.dataset.wordsEnhanced).toBe("true");

    // Re-run
    tokenizeSubtree(div, { renderWord });
    expect(div.querySelectorAll(".lat-word")).toHaveLength(3);
  });

  it("rejects standard exclusion elements (a, button, script, style, lang=el, data-no-tokenize)", () => {
    const div = document.createElement("div");
    div.innerHTML = `
      <p>Before <a href="#">link word</a> middle</p>
      <button>Button Text</button>
      <script>const x = "code";</script>
      <style>.class { color: red; }</style>
      <span lang="el">\u03bb\u03cc\u03b3\u03bf\u03c2</span>
      <div data-no-tokenize="true">Ignored content</div>
      <div data-no-linkify="true">Also ignored content</div>
      <svg><text>SVG Text</text></svg>
      <p>After text</p>
    `;
    document.body.appendChild(div);

    tokenizeSubtree(div, {
      renderWord: (token) => {
        const span = document.createElement("span");
        span.className = "lat-word";
        span.textContent = token;
        return span;
      },
    });

    const words = Array.from(div.querySelectorAll(".lat-word")).map(
      (w) => w.textContent
    );
    expect(words).toEqual(["Before", "middle", "After", "text"]);
  });

  it("honors caller-provided isExcludedElement", () => {
    const div = document.createElement("div");
    div.innerHTML = `
      <b class="lsOrth">habeo</b>
      <span class="lsHover">abbr</span>
      <span>validus</span>
    `;
    document.body.appendChild(div);

    tokenizeSubtree(div, {
      renderWord: (token) => {
        const span = document.createElement("span");
        span.className = "lat-word";
        span.textContent = token;
        return span;
      },
      isExcludedElement: (el) =>
        el.classList.contains("lsOrth") || el.classList.contains("lsHover"),
    });

    const words = Array.from(div.querySelectorAll(".lat-word")).map(
      (w) => w.textContent
    );
    expect(words).toEqual(["validus"]);
  });

  it("tracks 0-based wordIndex across isWord tokens while skipping .reader-gap and note links", () => {
    const div = document.createElement("div");
    div.innerHTML = `
      <p>Gallia 15 <span class="reader-gap text-muted">[gap]</span> est<a class="reader-note-ref" href="#note-n1"><sup>[1]</sup></a> omnis.</p>
    `;
    document.body.appendChild(div);

    const seen: Array<{ token: string; index: number }> = [];
    tokenizeSubtree(div, {
      renderWord: (token, _clean, wordIndex) => {
        seen.push({ token, index: wordIndex });
        const span = document.createElement("span");
        span.className = "lat-word";
        span.dataset.idx = String(wordIndex);
        span.textContent = token;
        return span;
      },
    });

    // "Gallia" is word 0, "15" is word 1 (not Latin, but increments wordIndex),
    // "[gap]" and "[1]" are skipped, "est" is word 2, "omnis" is word 3.
    expect(seen).toEqual([
      { token: "Gallia", index: 0 },
      { token: "est", index: 2 },
      { token: "omnis", index: 3 },
    ]);
  });
});

describe("tokenizeTargets", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("finds and tokenizes elements matching data-tokenize-target='true'", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="header">Title</div>
      <div class="content" data-tokenize-target="true">Gallia est omnis divisa.</div>
      <div class="footer">Non-target text</div>
    `;
    document.body.appendChild(container);

    tokenizeTargets(container, {
      renderWord: (token) => {
        const span = document.createElement("span");
        span.className = "lat-word";
        span.textContent = token;
        return span;
      },
    });

    const words = Array.from(container.querySelectorAll(".lat-word")).map(
      (w) => w.textContent
    );
    expect(words).toEqual(["Gallia", "est", "omnis", "divisa"]);
  });

  it("tokenizes container directly if container itself matches data-tokenize-target='true'", () => {
    const container = document.createElement("div");
    container.setAttribute("data-tokenize-target", "true");
    container.textContent = "Arma virumque cano";
    document.body.appendChild(container);

    tokenizeTargets(container, {
      renderWord: (token) => {
        const span = document.createElement("span");
        span.className = "lat-word";
        span.textContent = token;
        return span;
      },
    });

    expect(container.querySelectorAll(".lat-word")).toHaveLength(3);
  });

  it("falls back to fallbackSelector when no primary target matches", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="reader-section">
        <p class="reader-paragraph">Legacy paragraph text</p>
      </div>
      <div class="sidebar">Sidebar text</div>
    `;
    document.body.appendChild(container);

    tokenizeTargets(container, {
      targetSelector: "[data-tokenize-target='true']",
      fallbackSelector: "p.reader-paragraph",
      renderWord: (token) => {
        const span = document.createElement("span");
        span.className = "lat-word";
        span.textContent = token;
        return span;
      },
    });

    const words = Array.from(container.querySelectorAll(".lat-word")).map(
      (w) => w.textContent
    );
    expect(words).toEqual(["Legacy", "paragraph", "text"]);
  });
});
