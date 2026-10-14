/**
 * @jest-environment jsdom
 */
import {
  canSwapWordOnHover,
  createWordSpan,
  isLatinWord,
  swapWordSpanForLink,
  syncWordGroupHover,
  tokenizeSubtree,
  tokenizeTargets,
  WORD_GROUP_HOVER_CLASS,
  wordGroupParts,
  type WordPart,
} from "@/web/v2/core/tokenize.client";

describe("createWordSpan", () => {
  it("builds a plain, non-focusable span", () => {
    const span = createWordSpan("Gallia");
    expect(span.outerHTML).toBe(
      '<span class="lat-word" data-word="Gallia">Gallia</span>'
    );
  });

  it("takes a separate data-word and extra class", () => {
    const span = createWordSpan("Galliā", {
      word: "Gallia",
      extraClass: "reader-match",
    });
    expect(span.className).toBe("lat-word reader-match");
    expect(span.dataset.word).toBe("Gallia");
    expect(span.textContent).toBe("Galliā");
  });
});

describe("swapWordSpanForLink", () => {
  it("replaces the span with an unfocusable anchor keeping class, data and text", () => {
    const parent = document.createElement("p");
    const span = createWordSpan("arma", {
      word: "arma",
      extraClass: "reader-match",
    });
    span.dataset.wordGroup = "7";
    parent.append("Cano ", span, " virumque");

    const a = swapWordSpanForLink(span, "/v2/dicts?q=arma");

    expect(a.localName).toBe("a");
    expect(a.parentElement).toBe(parent);
    expect(span.isConnected).toBe(false);
    expect(a.className).toBe("lat-word reader-match");
    expect(a.dataset.word).toBe("arma");
    expect(a.dataset.wordGroup).toBe("7");
    expect(a.getAttribute("href")).toBe("/v2/dicts?q=arma");
    expect(a.textContent).toBe("arma");
    expect(parent.textContent).toBe("Cano arma virumque");
    expect(a.getAttribute("role")).toBeNull();
    // An `<a href>` is focusable by default; the word must stay out of the
    // tab order, which is the whole reason it was a span.
    expect(a.getAttribute("tabindex")).toBe("-1");
    expect(a.tabIndex).toBe(-1);
  });

  it("keeps an element that is already a link, refreshing its href", () => {
    const a = document.createElement("a");
    a.className = "lat-word";
    a.href = "/v2/dicts?q=arma&d=1";
    expect(swapWordSpanForLink(a, "/v2/dicts?q=arma&d=1")).toBe(a);
    expect(a.getAttribute("href")).toBe("/v2/dicts?q=arma&d=1");
    expect(swapWordSpanForLink(a, "/v2/dicts?q=arma&d=2")).toBe(a);
    expect(a.getAttribute("href")).toBe("/v2/dicts?q=arma&d=2");
  });
});

describe("canSwapWordOnHover", () => {
  function pointerOver(init: PointerEventInit): PointerEvent {
    // jsdom has no PointerEvent constructor; a MouseEvent with the pointer
    // fields attached is enough for the predicate.
    const e = new MouseEvent("pointerover", init) as PointerEvent & {
      pointerType: string;
    };
    Object.defineProperty(e, "pointerType", {
      value: init.pointerType ?? "mouse",
    });
    return e;
  }

  let p: HTMLParagraphElement;
  let word: HTMLElement;
  let other: HTMLElement;
  beforeEach(() => {
    p = document.createElement("p");
    word = createWordSpan("arma");
    other = createWordSpan("virumque");
    p.append("Cano ", word, " ", other, " cano");
    document.body.appendChild(p);
  });
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    p.remove();
  });

  function select(range: (r: Range) => void) {
    const r = document.createRange();
    range(r);
    document.getSelection()!.addRange(r);
  }

  it("allows a mouse hover with no button held and nothing selected", () => {
    expect(
      canSwapWordOnHover(pointerOver({ pointerType: "mouse" }), word)
    ).toBe(true);
  });

  it("refuses touch and pen", () => {
    expect(
      canSwapWordOnHover(pointerOver({ pointerType: "touch" }), word)
    ).toBe(false);
    expect(canSwapWordOnHover(pointerOver({ pointerType: "pen" }), word)).toBe(
      false
    );
  });

  it("refuses while a button is held (drag-select in progress)", () => {
    expect(
      canSwapWordOnHover(
        pointerOver({ pointerType: "mouse", buttons: 1 }),
        word
      )
    ).toBe(false);
  });

  it("refuses while the word is part of a selection", () => {
    select((r) => r.selectNodeContents(p));
    expect(canSwapWordOnHover(pointerOver({}), word)).toBe(false);
  });

  it("refuses when a selection only partly covers the word", () => {
    // From inside "arma" into the following text.
    select((r) => {
      r.setStart(word.firstChild!, 2);
      r.setEnd(other.firstChild!, 3);
    });
    expect(canSwapWordOnHover(pointerOver({}), word)).toBe(false);
    expect(canSwapWordOnHover(pointerOver({}), other)).toBe(false);
  });

  it("allows a hover when the selection is elsewhere", () => {
    // A phrase selected in one place must not stop middle-click on a word
    // somewhere else on the page.
    select((r) => r.selectNodeContents(other));
    expect(canSwapWordOnHover(pointerOver({}), word)).toBe(true);
  });

  it("swapping a word keeps a selection boundary in the same parent in place", () => {
    // A boundary in the parent is adjusted by the removal and the insertion
    // in equal measure, so it still points at the same sibling. (Boundaries
    // in other text nodes never move per spec, but jsdom gets that wrong, so
    // this test keeps the whole selection in the parent.)
    select((r) => {
      r.setStart(p, 3); // before `other`
      r.setEnd(p, 4); // after `other`
    });
    expect(canSwapWordOnHover(pointerOver({}), word)).toBe(true);
    swapWordSpanForLink(word, "/v2/dicts?q=arma");
    const r = document.getSelection()!.getRangeAt(0);
    expect(r.startContainer).toBe(p);
    expect(r.startOffset).toBe(3);
    expect(p.childNodes[r.startOffset]).toBe(other);
    expect(r.endContainer).toBe(p);
    expect(r.endOffset).toBe(4);
    expect(r.toString()).toBe("virumque");
  });
});

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

describe("tokenizeSubtree with joinAcrossInline", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  interface Seen {
    token: string;
    cleanWord: string;
    index: number;
    part?: WordPart;
  }

  function tokenize(
    html: string,
    options: { joinAcrossInline?: boolean } = { joinAcrossInline: true }
  ): { div: HTMLElement; seen: Seen[] } {
    const div = document.createElement("div");
    div.innerHTML = html;
    document.body.appendChild(div);
    const seen: Seen[] = [];
    tokenizeSubtree(div, {
      ...options,
      renderWord: (token, cleanWord, index, _root, part) => {
        seen.push({ token, cleanWord, index, part });
        return createWordSpan(token, { word: part?.word });
      },
    });
    return { div, seen };
  }

  it("keeps a word whole across an inline styling span", () => {
    const { div, seen } = tokenize(
      '<span class="italic">im</span>petu liberavissent'
    );

    expect(seen.map((s) => [s.token, s.index, s.part?.index])).toEqual([
      ["im", 0, 0],
      ["petu", 0, 1],
      ["liberavissent", 1, undefined],
    ]);
    expect(seen[0].part).toEqual({ index: 0, count: 2, word: "impetu" });
    expect(seen[0].cleanWord).toBe("impetu");
    expect(seen[1].cleanWord).toBe("impetu");
    // The styling span stays in place, holding the first part.
    const italic = div.querySelector(".italic");
    expect(italic?.firstElementChild?.textContent).toBe("im");
    expect(div.textContent).toBe("impetu liberavissent");
    const [firstPart, secondPart, wholeWord] = Array.from(
      div.querySelectorAll<HTMLElement>(".lat-word")
    );
    // Words are prose, not controls: nothing is focusable and no part needs
    // ARIA to be read once as a whole word.
    for (const el of [firstPart, secondPart, wholeWord]) {
      expect(el.localName).toBe("span");
      expect(el.getAttribute("role")).toBeNull();
      expect(el.getAttribute("tabindex")).toBeNull();
      expect(el.getAttribute("aria-label")).toBeNull();
      expect(el.getAttribute("aria-hidden")).toBeNull();
    }
    expect(firstPart.dataset.word).toBe("impetu");
    expect(secondPart.dataset.word).toBe("impetu");
    expect(wholeWord.dataset.word).toBe("liberavissent");
  });

  it("gives every part of a word the same group", () => {
    const { div } = tokenize(
      'per <span class="italic">val<span class="bold">le</span>m</span>que'
    );

    const parts = Array.from(div.querySelectorAll<HTMLElement>(".lat-word"));
    expect(parts.map((p) => p.textContent)).toEqual([
      "per",
      "val",
      "le",
      "m",
      "que",
    ]);
    expect(parts[0].dataset.wordGroup).toBeUndefined();
    const group = parts[1].dataset.wordGroup;
    expect(group).toBeDefined();
    expect(parts.slice(1).map((p) => p.dataset.wordGroup)).toEqual(
      Array(4).fill(group)
    );
    expect(parts.slice(1).map((p) => p.dataset.word)).toEqual(
      Array(4).fill("vallemque")
    );
    expect(wordGroupParts(parts[3])).toEqual(parts.slice(1));
    expect(wordGroupParts(parts[0])).toEqual([parts[0]]);
  });

  it("continues across strong, overline, smallcaps, uppercase and superscript", () => {
    const { seen } = tokenize(
      "<strong>a</strong>" +
        '<span class="overline">b</span>' +
        '<span class="smallcaps">c</span>' +
        '<span class="uppercase">d</span>' +
        '<span class="superscript">e</span>f'
    );
    expect(seen.map((s) => s.part?.word)).toEqual(Array(6).fill("abcdef"));
  });

  it("breaks at other elements, note links and gaps", () => {
    const { seen } = tokenize(
      'a<span class="reader-line">b</span>c<span class="reader-line italic">d</span>' +
        'e<a class="reader-note-ref" href="#n"><sup>[1]</sup></a>f' +
        '<span class="reader-gap" data-no-tokenize="true">[gap]</span>g<br>h'
    );
    expect(seen.map((s) => [s.token, s.index, s.part])).toEqual([
      ["a", 0, undefined],
      ["b", 1, undefined],
      ["c", 2, undefined],
      ["d", 3, undefined],
      ["e", 4, undefined],
      ["f", 5, undefined],
      ["g", 6, undefined],
      ["h", 7, undefined],
    ]);
  });

  it("counts non-Latin words that span elements once", () => {
    const { seen } = tokenize(
      '1<span class="italic">5</span> est <span class="italic">omnis</span>'
    );
    expect(seen.map((s) => [s.token, s.index])).toEqual([
      ["est", 1],
      ["omnis", 2],
    ]);
  });

  it("splits at every text node without the option", () => {
    const { seen } = tokenize(
      '<span class="italic">im</span>petu liberavissent',
      {}
    );
    expect(seen.map((s) => [s.token, s.index, s.part])).toEqual([
      ["im", 0, undefined],
      ["petu", 1, undefined],
      ["liberavissent", 2, undefined],
    ]);
  });
});

describe("syncWordGroupHover", () => {
  it("hovers every part of a split word, and keeps it moving between parts", () => {
    const div = document.createElement("div");
    div.innerHTML =
      '<span data-word-group="g">im</span><span data-word-group="g">petu</span>' +
      '<span data-word-group="h">alia</span>';
    document.body.replaceChildren(div);
    div.addEventListener("mouseover", syncWordGroupHover);
    div.addEventListener("mouseout", syncWordGroupHover);
    const [first, second, other] = Array.from(
      div.querySelectorAll<HTMLElement>("span")
    );
    const hovered = () =>
      [first, second, other].map((p) =>
        p.classList.contains(WORD_GROUP_HOVER_CLASS)
      );

    first.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(hovered()).toEqual([true, true, false]);

    first.dispatchEvent(
      new MouseEvent("mouseout", { bubbles: true, relatedTarget: second })
    );
    expect(hovered()).toEqual([true, true, false]);

    second.dispatchEvent(
      new MouseEvent("mouseout", { bubbles: true, relatedTarget: other })
    );
    expect(hovered()).toEqual([false, false, false]);
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
});
