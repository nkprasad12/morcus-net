/**
 * @jest-environment jsdom
 */
import { bindDismissable } from "@/web/v2/core/widgets/dismissable.client";

afterEach(() => {
  document.body.innerHTML = "";
});

function el(selector: string): HTMLElement {
  return document.querySelector<HTMLElement>(selector)!;
}

function keydown(target: Element, key: string): KeyboardEvent {
  const e = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(e);
  return e;
}

describe("bindDismissable", () => {
  test("reports the dismiss reason", () => {
    document.body.innerHTML = `<div id="pop"></div><button id="out"></button>`;
    const reasons: string[] = [];
    const unbind = bindDismissable({
      container: el("#pop"),
      isOpen: () => true,
      onDismiss: (reason) => reasons.push(reason),
    });
    el("#out").click();
    // Focus on <body>: in scope (an external control would not be).
    keydown(document.body, "Escape");
    unbind();
    expect(reasons).toEqual(["pointer", "escape"]);
  });

  test("still dismisses on a click that points into a failed component", () => {
    document.body.innerHTML = `<div id="pop"></div><a id="a" href="#x">x</a><morcus-x data-js-failed><p id="x"></p></morcus-x>`;
    const onDismiss = jest.fn();
    const unbind = bindDismissable({
      container: el("#pop"),
      isOpen: () => true,
      onDismiss,
    });
    el("#a").click();
    unbind();
    expect(onDismiss).toHaveBeenCalledWith("pointer");
  });

  function bindEscape(
    container: string,
    extra: Partial<Parameters<typeof bindDismissable>[0]> = {}
  ): { onDismiss: jest.Mock; unbind: () => void } {
    const onDismiss = jest.fn();
    const unbind = bindDismissable({
      container: el(container),
      isOpen: () => true,
      onDismiss,
      ...extra,
    });
    return { onDismiss, unbind };
  }

  test("skips Escape already consumed by an inner widget", () => {
    document.body.innerHTML = `<div id="pop"><input id="in"></div>`;
    el("#in").addEventListener("keydown", (e) => e.preventDefault());
    const { onDismiss, unbind } = bindEscape("#pop");
    keydown(el("#in"), "Escape");
    unbind();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  test("skips Escape during IME composition", () => {
    document.body.innerHTML = `<div id="pop"><input id="in"></div>`;
    const { onDismiss, unbind } = bindEscape("#pop");
    el("#in").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      })
    );
    unbind();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  test("skips Escape while an unrelated <dialog open> is open", () => {
    document.body.innerHTML = `<div id="pop"></div><dialog open><button id="d"></button></dialog>`;
    const { onDismiss, unbind } = bindEscape("#pop");
    keydown(document.body, "Escape");
    unbind();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  test("skips Escape with focus in an external control", () => {
    document.body.innerHTML = `<div id="pop"></div><button id="trig"></button><input id="search">`;
    const { onDismiss, unbind } = bindEscape("#pop", {
      triggerEl: el("#trig"),
    });
    el("#search").focus();
    const e = keydown(el("#search"), "Escape");
    expect(onDismiss).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
    keydown(el("#trig"), "Escape");
    unbind();
    expect(onDismiss).toHaveBeenCalledWith("escape");
  });

  test.each([
    ["edit box first", true],
    ["abbr popover first", false],
  ])(
    "Escape on an ignore-matched node dismisses only its overlay (%s)",
    (_, editFirst) => {
      document.body.innerHTML = `<div class="section-edit-box"><textarea></textarea></div><span class="lsHover" tabindex="0">abbr</span><div id="abbr-popover"></div>`;
      const bindEdit = () => bindEscape(".section-edit-box");
      const bindAbbr = () =>
        bindEscape("#abbr-popover", {
          ignore: (t) => t instanceof Element && t.matches(".lsHover"),
        });
      const [edit, abbr] = editFirst
        ? [bindEdit(), bindAbbr()]
        : (() => {
            const a = bindAbbr();
            return [bindEdit(), a];
          })();
      el(".lsHover").focus();
      keydown(el(".lsHover"), "Escape");
      edit.unbind();
      abbr.unbind();
      expect(abbr.onDismiss).toHaveBeenCalledWith("escape");
      expect(edit.onDismiss).not.toHaveBeenCalled();
    }
  );
});
