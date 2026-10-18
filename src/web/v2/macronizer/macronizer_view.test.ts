/**
 * @jest-environment jsdom
 */

import "@/web/v2/macronizer/macronizer_view.client";
import {
  buildMacronizerFixtures,
  installMatchMediaStub,
} from "@/web/v2/testing/ssr_fixtures";

describe("MorcusMacronizerView interactive contracts", () => {
  beforeAll(() => {
    installMatchMediaStub();
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/macronizer");
  });

  function mountResultsFixture(): HTMLElement {
    const fixture = buildMacronizerFixtures().find(
      (f) => f.name === "macronizer-results"
    )!;
    document.body.innerHTML = fixture.html;
    return document.body.querySelector<HTMLElement>("morcus-macronizer-view")!;
  }

  test("clicking an ambiguous word without prior focus focuses it so Enter keeps it and advances", () => {
    const view = mountResultsFixture();
    const word1 = view.querySelector<HTMLElement>("#t1")!;
    const word2 = view.querySelector<HTMLElement>("#t2")!;
    const card1 = view.querySelector<HTMLElement>("#w1")!;
    const card2 = view.querySelector<HTMLElement>("#w2")!;

    // Simulate Safari/macOS Firefox click that does NOT natively focus the <a>
    word1.click();
    expect(document.activeElement).toBe(word1);
    expect(word1.classList.contains("mac-selected")).toBe(true);
    expect(card1.classList.contains("current")).toBe(true);

    // Pressing Enter on the activeElement keeps word1 and advances to word2
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      })
    );

    expect(word1.classList.contains("mac-chosen")).toBe(true);
    expect(word2.classList.contains("mac-selected")).toBe(true);
    expect(card2.classList.contains("current")).toBe(true);
    expect(document.activeElement).toBe(word2);
  });

  test("ArrowDown moves focus into card radio, Escape returns to word, Enter on radio chooses and advances", () => {
    const view = mountResultsFixture();
    const word1 = view.querySelector<HTMLElement>("#t1")!;
    const card1 = view.querySelector<HTMLElement>("#w1")!;

    word1.click();
    expect(document.activeElement).toBe(word1);

    // ArrowDown on word1 focuses the first/shown radio in card1
    word1.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      })
    );
    const radios = card1.querySelectorAll<HTMLInputElement>(
      ".mac-opt-radio input[type='radio']"
    );
    expect(document.activeElement).toBe(radios[0]);

    // Escape on radio returns focus to word1
    radios[0].dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(word1);

    // Focus second radio (mālum) and press Enter -> chooses mālum and advances to word2
    radios[1].focus();
    radios[1].dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      })
    );
    expect(radios[1].checked).toBe(true);
    expect(word1.textContent).toBe("m\u0101lum");
    expect(word1.classList.contains("mac-chosen")).toBe(true);
    expect(document.activeElement).toBe(view.querySelector("#t2"));
  });

  test("toggling vowel checkboxes in Edit macrons updates passage word to NFC, unchecks radios, and marks edited", () => {
    const view = mountResultsFixture();
    const word1 = view.querySelector<HTMLElement>("#t1")!;
    const card1 = view.querySelector<HTMLElement>("#w1")!;

    // First pick radio 1 (mālum)
    const radio1 = card1.querySelector<HTMLInputElement>(
      'input[type="radio"][name="w1"][value="1"]'
    )!;
    radio1.checked = true;
    radio1.dispatchEvent(new Event("change", { bubbles: true }));
    expect(word1.textContent).toBe("m\u0101lum");
    expect(card1.querySelector(".mac-tag")?.textContent).toBe("your choice");

    // Now toggle vowel at position 3 ('u' in malum) so both 'a' (1) and 'u' (3) are long -> mālūm (mālūm)
    const vowelPos3 = card1.querySelector<HTMLInputElement>(
      '.mac-vowels input[type="checkbox"][value="3"]'
    )!;
    vowelPos3.checked = true;
    vowelPos3.dispatchEvent(new Event("change", { bubbles: true }));

    expect(word1.textContent).toBe("m\u0101l\u016Bm");
    expect(word1.getAttribute("data-decision")).toBe("edited");
    expect(radio1.checked).toBe(false);
    expect(card1.querySelector(".mac-tag")?.textContent).toBe("edited");
  });

  test("clicking a plain word populates the shared plain card and allows overriding its vowels", () => {
    const view = mountResultsFixture();
    const plainWord = view.querySelector<HTMLElement>(
      '.mac-plain[data-w="0"]'
    )!;
    const plainCard = view.querySelector<HTMLElement>("#w-plain")!;

    plainWord.click();
    expect(plainCard.classList.contains("current")).toBe(true);
    expect(plainCard.querySelector("[data-plain-orig]")?.textContent).toBe(
      "acclinat"
    );
    expect(plainCard.querySelector("[data-plain-shown]")?.textContent).toBe(
      "accl\u012Bnat"
    );
    expect(
      plainCard.querySelector("[data-plain-lemmas] .mac-lemma-link")
        ?.textContent
    ).toBe("acclino");

    // Toggle first vowel (position 0, 'a') to long -> ācclīnat
    const firstVowel = plainCard.querySelector<HTMLInputElement>(
      '[data-plain-vowels] input[type="checkbox"][value="0"]'
    )!;
    expect(firstVowel).not.toBeNull();
    firstVowel.checked = true;
    firstVowel.dispatchEvent(new Event("change", { bubbles: true }));

    expect(plainWord.textContent).toBe("\u0101ccl\u012Bnat");
    expect(plainWord.classList.contains("mac-chosen")).toBe(true);
    expect(plainCard.querySelector("[data-plain-tag]")?.textContent).toBe(
      "edited"
    );

    // If the user searches inside #mac-dict-frame, clicking the same word again reloads its lookup.
    const iframe = view.querySelector<HTMLIFrameElement>("#mac-dict-frame")!;
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: {
        location: {
          pathname: "/dicts",
          search: "?q=love&o=1&embedded=1",
        },
      },
    });
    const srcSpy = jest.spyOn(iframe, "src", "set");
    plainWord.click();
    expect(srcSpy).toHaveBeenCalledWith(
      "/dicts?q=%C4%81ccl%C4%ABnat&lang=La&o=1&embedded=1"
    );
  });

  test("tier review queue steps through tier 1 (with wrap-around), then tiers 2-4, then tier 5", () => {
    const view = mountResultsFixture();
    const nextBtn = view.querySelector<HTMLButtonElement>("#mac-next-btn")!;

    // Start at #t2 (second tier-1 word) and keep it -> wraps around to #t1 (first tier-1 word)
    const word2 = view.querySelector<HTMLElement>("#t2")!;
    word2.click();
    word2.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement?.id).toBe("t1");

    // Keep #t1 -> Tier 1 is now empty, advances to first Tier 2-4 word (#t3, regis)
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement?.id).toBe("t3");

    // Keep #t3, #t4, #t5 -> advances to Tier 5 unknown word (#t6, Brundisium)
    for (const expectedNext of ["t4", "t5", "t6"]) {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
      expect(document.activeElement?.id).toBe(expectedNext);
    }

    // Keep #t6 -> all words reviewed
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      })
    );
    const statusText = view.querySelector("#mac-status")?.textContent ?? "";
    expect(statusText).toContain("0 need a choice");
    expect(statusText).toContain("0 to check");
    expect(statusText).toContain("0 not in dictionary");

    // Clicking Next when all reviewed does not throw
    nextBtn.click();
  });

  test("adopts initial #wN URL hash on connect", () => {
    window.history.replaceState(null, "", "/macronizer#w2");
    const view = mountResultsFixture();
    expect(view.querySelector("#t2")?.classList.contains("mac-selected")).toBe(
      true
    );
    expect(view.querySelector("#w2")?.classList.contains("current")).toBe(true);
  });

  test("falls back to native form submit when POST partial swap fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: jest.fn(() => Promise.reject(new Error("Network offline"))),
    });

    const landing = buildMacronizerFixtures().find(
      (f) => f.name === "macronizer-landing"
    )!;
    document.body.innerHTML = landing.html;
    const form = document.body.querySelector<HTMLFormElement>("#mac-form")!;
    const textarea = form.querySelector<HTMLTextAreaElement>("#mac-text")!;
    textarea.value = "Gallia est omnis";

    const submitSpy = jest
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});

    try {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );

      // Flush microtasks for rejected fetch -> fallback
      await new Promise((r) => setTimeout(r, 0));
      expect(submitSpy).toHaveBeenCalledTimes(1);
      expect(submitSpy.mock.contexts[0]).toBe(form);
    } finally {
      submitSpy.mockRestore();
    }
  });
});
