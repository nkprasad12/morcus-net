/**
 * @jest-environment jsdom
 */
import "@/web/v2/reader/reader_view.client";
import { MorcusReaderView } from "@/web/v2/reader/reader_view.client";

describe("MorcusReaderView client tokenization & macra handling", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function createReaderView(innerPassageHtml: string): MorcusReaderView {
    const el = document.createElement("morcus-reader-view") as MorcusReaderView;
    el.innerHTML = `
      <div class="v2-reader-split-layout v2-reader-layout-empty">
        <section class="v2-reader-text-panel">
          <div class="v2-reader-text-card">
            <article class="v2-reader-passage" id="v2-reader-passage">
              ${innerPassageHtml}
            </article>
          </div>
        </section>
        <aside class="v2-reader-dict-panel">
          <div class="v2-reader-sheet-bar">
            <div class="v2-reader-sheet-teaser">
              <span class="v2-reader-sheet-label">Tap any word</span>
            </div>
          </div>
          <iframe id="v2-dict-frame" src="/v2/dicts?embedded=1"></iframe>
        </aside>
        <dialog id="v2-reader-settings-dialog">
          <input type="checkbox" id="v2-toggle-macra" checked />
        </dialog>
      </div>
    `;
    document.body.appendChild(el);
    return el;
  }

  test("tokenizes Aeneid text with decomposed NFD macra without splitting words", () => {
    // Aeneid 1.8 with combining macrons (\u0304): Mūsa, mihī causās memorā, quō nūmine laesō
    const passageHtml = `
      <div class="v2-reader-section" id="sec-1.8">
        <span class="v2-reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304, quo\u0304 nu\u0304mine laeso\u0304.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);

    const words = Array.from(el.querySelectorAll<HTMLElement>(".v2-lat-word"));
    const wordTexts = words.map((w) => w.textContent);

    // Verified: Musa is NOT split into 'Mu' and 'sa'
    expect(wordTexts).toEqual([
      "Mu\u0304sa",
      "mihi\u0304",
      "causa\u0304s",
      "memora\u0304",
      "quo\u0304",
      "nu\u0304mine",
      "laeso\u0304",
    ]);

    // Data-word attributes preserved
    expect(words[0].getAttribute("data-word")).toBe("Mu\u0304sa");
    expect(words[2].getAttribute("data-word")).toBe("causa\u0304s");

    // Interstitial punctuation and spaces preserved
    const line = el.querySelector(".v2-reader-line")!;
    expect(line.textContent).toBe(
      "Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304, quo\u0304 nu\u0304mine laeso\u0304."
    );
  });

  test("tokenizes precomposed NFC macra without splitting", () => {
    // Composed: Mūsa, causās
    const passageHtml = `
      <div class="v2-reader-section" id="sec-1.8">
        <span class="v2-reader-line">M\u016Bsa, mihi caus\u0101s memor\u0101.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);

    const words = Array.from(el.querySelectorAll<HTMLElement>(".v2-lat-word"));
    const wordTexts = words.map((w) => w.textContent);

    expect(wordTexts).toEqual(["Mūsa", "mihi", "causās", "memorā"]);
  });

  test("clicking a word with macra opens dictionary with query and activates word", () => {
    const passageHtml = `
      <div class="v2-reader-section" id="sec-1.8">
        <span class="v2-reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);
    const musaWord = el.querySelector<HTMLElement>(".v2-lat-word")!;
    expect(musaWord.textContent).toBe("Mu\u0304sa");

    musaWord.click();

    // Word receives active highlight class
    expect(musaWord.classList.contains("v2-word-active")).toBe(true);

    // Dictionary iframe source is updated with Latin filter
    const iframe = el.querySelector<HTMLIFrameElement>("#v2-dict-frame")!;
    expect(iframe.src).toContain("/v2/dicts?q=Mu%CC%84sa&lang=La&embedded=1");

    // Sheet label updated
    const sheetLabel = el.querySelector<HTMLElement>(".v2-reader-sheet-label")!;
    expect(sheetLabel.innerHTML).toContain("Mu\u0304sa");
  });

  test("findWordElement highlights word matching unaccented, NFC, or NFD queries", () => {
    const passageHtml = `
      <div class="v2-reader-section" id="sec-1.8">
        <span class="v2-reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);
    const musaWord = el.querySelector<HTMLElement>(".v2-lat-word")!;

    // Case 1: Search unaccented "musa" matches "Mūsa"
    // @ts-expect-error accessing private method for test verification
    const matchUnaccented = el.findWordElement("musa");
    expect(matchUnaccented).toBe(musaWord);

    // Case 2: Search NFC precomposed "Mūsa" matches "Mu\u0304sa"
    // @ts-expect-error accessing private method for test verification
    const matchNfc = el.findWordElement("M\u016Bsa");
    expect(matchNfc).toBe(musaWord);

    // Case 3: Search exact NFD "Mu\u0304sa" matches
    // @ts-expect-error accessing private method for test verification
    const matchNfd = el.findWordElement("Mu\u0304sa");
    expect(matchNfd).toBe(musaWord);
  });

  test("toggling Show Macra in settings strips and restores vowel markings", () => {
    const passageHtml = `
      <div class="v2-reader-section" id="sec-1.8">
        <span class="v2-reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);
    const words = Array.from(el.querySelectorAll<HTMLElement>(".v2-lat-word"));
    expect(words[0].textContent).toBe("Mu\u0304sa");
    expect(words[2].textContent).toBe("causa\u0304s");

    const toggleMacra = el.querySelector<HTMLInputElement>("#v2-toggle-macra")!;
    expect(toggleMacra).not.toBeNull();

    // Toggle macra OFF
    toggleMacra.checked = false;
    toggleMacra.dispatchEvent(new Event("change"));

    expect(words[0].textContent).toBe("Musa");
    expect(words[2].textContent).toBe("causas");
    // data-word attribute remains intact for search/click lookup
    expect(words[0].getAttribute("data-word")).toBe("Mu\u0304sa");

    // Toggle macra back ON
    toggleMacra.checked = true;
    toggleMacra.dispatchEvent(new Event("change"));

    expect(words[0].textContent).toBe("Mu\u0304sa");
    expect(words[2].textContent).toBe("causa\u0304s");
  });
});
