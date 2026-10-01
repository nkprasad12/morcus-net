/**
 * DOM helpers and invariants shared by the SSR conformance harnesses:
 * `core/ssr_conformance.test.ts` (right after upgrade) and
 * `core/interaction_conformance.test.ts` (after user interaction).
 */

export function describeElement(el: Element): string {
  const id = el.id ? `#${el.id}` : "";
  const classes =
    typeof el.className === "string" && el.className.trim()
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
  return `<${el.tagName.toLowerCase()}${id}${classes}>`;
}

/** Parses `html` into a detached wrapper whose custom elements haven't upgraded. */
export function parseInert(html: string): HTMLDivElement {
  const tpl = document.createElement("template");
  // Test-only: our own SSR output, parsed into jsdom. (`*.test.ts` files are
  // exempt from this rule; this shared helper isn't.)
  // eslint-disable-next-line no-unsanitized/property
  tpl.innerHTML = html;
  const wrapper = document.createElement("div");
  wrapper.append(tpl.content);
  return wrapper;
}

/** Every `morcus-*` element under `root`, in document order. */
export function morcusElements(root: Element): Element[] {
  return Array.from(root.querySelectorAll("*")).filter((el) =>
    el.localName.startsWith("morcus-")
  );
}

/** The nearest `morcus-*` element enclosing `el` (itself included). */
export function nearestMorcus(el: Element): Element | null {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    if (cur.localName.startsWith("morcus-")) return cur;
  }
  return null;
}

/**
 * When client code may first create an element: during `onConnect()`
 * (`upgrade`, which also covers everything later), or only in response to
 * the user (`interaction`).
 */
export type CreationPhase = "upgrade" | "interaction";

export interface CreatedDomRule {
  /** Matches the created element itself. */
  readonly selector: string;
  /**
   * Also covers everything created inside an element matching `selector`,
   * whether that element is server-rendered or created.
   */
  readonly subtree?: true;
  readonly from: CreationPhase;
  /** Why this element can't be server-rendered. Required for review. */
  readonly reason: string;
}

/**
 * The only elements client code may create (PE RFC §7). Everything else must
 * already exist in the SSR HTML. Adding an entry needs human review: prefer
 * rendering the element on the server and adopting it on upgrade.
 */
export const CREATED_DOM_ALLOWLIST: readonly CreatedDomRule[] = [
  {
    selector: ".lat-word",
    from: "upgrade",
    reason:
      "Inline word links wrapped by `tokenizeElement` in passages and entries.",
  },
  {
    selector: "morcus-corpus-suggestions > ul",
    subtree: true,
    from: "upgrade",
    reason:
      "Options of the server-rendered corpus listbox, built from the text at the caret. " +
      "On upgrade only if the input already has focus (`corpus-focused-before-upgrade`).",
  },
  {
    selector: "morcus-dict-suggestions > ul",
    subtree: true,
    from: "interaction",
    reason:
      "Options of the server-rendered dict listbox, built from the typed prefix " +
      "(`ComboboxController.renderItems`), as for the corpus listbox above.",
  },
];

export function isAllowlistedCreation(
  el: Element,
  phase: CreationPhase
): boolean {
  return CREATED_DOM_ALLOWLIST.some((rule) => {
    if (rule.from === "interaction" && phase === "upgrade") return false;
    if (el.matches(rule.selector)) return true;
    return rule.subtree === true && el.parentElement?.closest(rule.selector);
  });
}

export interface IsomorphicRerender {
  /** The component that re-renders it. */
  readonly owner: string;
  /** Matched against the element alone, without ancestors (it may be detached). */
  readonly selector: string;
  /**
   * `self`: the matched element is replaced (`replaceWithHtml`).
   * `contents`: its children are replaced (`setHtml`).
   */
  readonly replaces: "self" | "contents";
  /** The `.common.ts` renderer both the server and the client use. */
  readonly renderer: string;
}

/**
 * Server-rendered UI that the client re-renders after an interaction with
 * the same `.common.ts` renderer the server used (README, "The `.common.ts`
 * contract"), so the replacement markup can't drift from the SSR markup.
 * Inside these, the interaction harness allows SSR nodes to be replaced.
 * Adding an entry needs human review.
 */
export const ISOMORPHIC_RERENDERS: readonly IsomorphicRerender[] = [
  {
    owner: "morcus-dict-search",
    selector: ".lang-chips",
    replaces: "contents",
    renderer: "renderLangChipsHtml (dict/search_bar.common.ts)",
  },
  {
    owner: "morcus-dict-search",
    selector: ".inflect-chip",
    replaces: "self",
    renderer: "renderInflectChipHtml (dict/search_bar.common.ts)",
  },
];

/**
 * Whether `el` lies in an isomorphic re-render region. `parentOf` gives the
 * ancestry to use: the pre-interaction one for a removed element.
 */
export function inIsomorphicRerender(
  el: Element,
  parentOf: (el: Element) => Node | null | undefined = (e) => e.parentNode
): boolean {
  const ancestry: Element[] = [];
  for (let cur: Node | null | undefined = el; cur instanceof Element; ) {
    ancestry.push(cur);
    cur = parentOf(cur);
  }
  return ISOMORPHIC_RERENDERS.some((region) => {
    const at = ancestry.findIndex(
      (a, i) =>
        a.matches(region.selector) && (region.replaces === "self" || i > 0)
    );
    return (
      at >= 0 &&
      ancestry.slice(at + 1).some((a) => a.localName === region.owner)
    );
  });
}

/** Every element under `root`, mapped to its parent. */
export function snapshotTree(root: ParentNode): Map<Element, Node> {
  const parents = new Map<Element, Node>();
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (el.parentNode) parents.set(el, el.parentNode);
  }
  return parents;
}

export interface TreeDiff {
  /** Baseline elements no longer under `root`. */
  readonly removed: Element[];
  /** Baseline elements under `root` with a different parent. */
  readonly reparented: { el: Element; from: Node }[];
  /** Elements under `root` that aren't in the baseline. */
  readonly created: Element[];
}

export function diffTree(
  baseline: ReadonlyMap<Element, Node>,
  root: Element
): TreeDiff {
  const removed: Element[] = [];
  const reparented: { el: Element; from: Node }[] = [];
  for (const [el, parent] of baseline) {
    if (!root.contains(el)) removed.push(el);
    else if (el.parentNode !== parent) reparented.push({ el, from: parent });
  }
  const created = Array.from(root.querySelectorAll("*")).filter(
    (el) => !baseline.has(el)
  );
  return { removed, reparented, created };
}

export function describeParent(node: Node | null, root: Element): string {
  return node instanceof Element && node !== root
    ? describeElement(node)
    : "#root";
}

/**
 * Why `ctrl` would be a dead control without JS, or `null` if it works
 * natively: a link with an `href`, a submit button for a form, or a named
 * form control inside a form. Ignores controls that aren't exposed: hidden,
 * inside a closed `<dialog>`, or gated by `data-js-only`.
 */
export function noJsControlViolation(
  ctrl: Element,
  root: ParentNode & NonElementParentNode
): string | null {
  if (
    ctrl.closest("[data-js-only]") ||
    ctrl.closest("[hidden]") ||
    ctrl.closest("dialog")
  ) {
    return null;
  }
  const formOf = () => {
    const formId = ctrl.getAttribute("form");
    return (
      ctrl.closest("form") ?? (formId ? root.getElementById(formId) : null)
    );
  };

  const tag = ctrl.tagName.toLowerCase();
  if (tag === "a") {
    return ctrl.getAttribute("href")?.trim()
      ? null
      : "is an <a> without href outside [data-js-only]";
  }
  if (tag === "button") {
    const type = (ctrl.getAttribute("type") ?? "submit").toLowerCase();
    return type === "submit" && formOf()
      ? null
      : `(type="${type}") is visible without JS but does not submit a <form>`;
  }
  // input, select, textarea
  if (ctrl.hasAttribute("disabled")) return null;
  const inputType = (ctrl.getAttribute("type") ?? "text").toLowerCase();
  if (inputType === "hidden") return null;
  return formOf() && ctrl.getAttribute("name")?.trim()
    ? null
    : "is a live form control outside a <form> or missing a name attribute in No-JS mode";
}

export const NO_JS_CONTROLS = "button, input, select, textarea, a";
