/**
 * @jest-environment jsdom
 */
import "@/web/v2/dict/dict_suggestions.client";
import { MorcusDictSuggestions } from "@/web/v2/dict/dict_suggestions.client";

describe("MorcusDictSuggestions Web Component", () => {
  let el: MorcusDictSuggestions;

  beforeEach(() => {
    document.body.innerHTML = "";
    el = document.createElement(
      "morcus-dict-suggestions"
    ) as MorcusDictSuggestions;
    document.body.appendChild(el);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("renders suggestions list when items are set", () => {
    el.items = [
      { word: "habeo", lang: "La" },
      { word: "amicitia", lang: "La" },
    ];

    const items = el.querySelectorAll<HTMLLIElement>(".suggestion-item");
    expect(items.length).toBe(2);
    expect(items[0].dataset.word).toBe("habeo");
    expect(items[1].dataset.word).toBe("amicitia");
  });

  test("emits suggestion-select on item mousedown", () => {
    el.items = [{ word: "habeo", lang: "La" }];
    const onSelect = jest.fn();
    el.addEventListener("suggestion-select", onSelect);

    const item = el.querySelector<HTMLLIElement>(".suggestion-item");
    expect(item).not.toBeNull();
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    item!.dispatchEvent(event);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { word: "habeo" },
      })
    );
    expect(event.defaultPrevented).toBe(true);
  });

  test("preserves event delegation across DOM disconnect and reconnect", () => {
    el.items = [{ word: "habeo", lang: "La" }];
    const onSelect = jest.fn();
    el.addEventListener("suggestion-select", onSelect);

    // Disconnect and reconnect element (e.g. DOM move or re-parenting)
    el.remove();
    document.body.appendChild(el);

    const item = el.querySelector<HTMLLIElement>(".suggestion-item");
    expect(item).not.toBeNull();
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    item!.dispatchEvent(event);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { word: "habeo" },
      })
    );
  });
});
