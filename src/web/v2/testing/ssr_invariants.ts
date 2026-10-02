/**
 * DOM helpers and invariants shared by the SSR conformance harnesses:
 * `testing/ssr_conformance_harness.ts` (right after upgrade) and
 * `testing/interaction_harness.ts` (after user interaction). The reviewed exception lists live in
 * `created_dom_allowlist.ts` and `isomorphic_rerenders.ts`.
 */

import { revealTarget } from "@/web/v2/core/reveal.client";

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
 * inside a closed `<dialog>`, or gated by `data-js-only`. Also ignores text
 * fields marked `data-unsubmitted`: useful on their own without a form (e.g.
 * a box to copy text from) and deliberately left out of any submission.
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
  if (
    ctrl.tagName.toLowerCase() === "textarea" &&
    ctrl.hasAttribute("data-unsubmitted") &&
    !ctrl.hasAttribute("name")
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

export interface AddressProblems {
  readonly duplicateIds: string[];
  readonly danglingHrefs: string[];
  readonly unrevealedTargets: string[];
}

/**
 * The in-page address checks (SSR conformance section 3) on the live
 * `document`: ids are unique and non-empty, every visible `#hash` link
 * resolves, and `revealTarget` reveals its target (opens enclosing
 * `<details>`, clears `[hidden]`, activates its companion panel view).
 *
 * Revealing changes the page, so run it last.
 */
export function checkAddresses(): AddressProblems {
  const root = document.body;
  const duplicateIds: string[] = [];
  const danglingHrefs: string[] = [];
  const unrevealedTargets: string[] = [];

  const seenIds = new Set<string>();
  for (const el of Array.from(root.querySelectorAll("[id]"))) {
    const id = el.getAttribute("id") ?? "";
    if (!id) {
      duplicateIds.push(`empty id on ${describeElement(el)}`);
      continue;
    }
    if (seenIds.has(id)) duplicateIds.push(`duplicate id="#${id}"`);
    seenIds.add(id);
  }

  const anchors = Array.from(
    root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')
  );
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href") ?? "";
    if (href === "#" || href === "#top") continue;

    const rawId = href.slice(1);
    let targetId: string;
    try {
      targetId = decodeURIComponent(rawId);
    } catch {
      targetId = rawId;
    }

    const target = document.getElementById(targetId);
    if (!target) {
      danglingHrefs.push(
        `${describeElement(anchor)} points to missing #${targetId}`
      );
      continue;
    }

    // An anchor that is itself `[hidden]` (such as `#panel-tab-notes` on
    // a page with no footnotes) is not an active user-facing link.
    if (anchor.closest("[hidden]")) continue;

    // Close any enclosing <details> first so we verify `revealTarget`
    // actually opens closed disclosures.
    const ancestorDetails = target.closest("details");
    if (ancestorDetails) ancestorDetails.open = false;

    revealTarget(target);

    // Check that no ancestor <details> remains closed, no ancestor has
    // `hidden`, and any enclosing `.reader-panel-view` is now `.active`.
    for (
      let cur: HTMLElement | null = target;
      cur && cur !== root;
      cur = cur.parentElement
    ) {
      if (cur instanceof HTMLDetailsElement && !cur.open) {
        unrevealedTargets.push(
          `#${targetId} remained inside closed ${describeElement(
            cur
          )} after revealTarget()`
        );
      }
      if (cur.hasAttribute("hidden")) {
        unrevealedTargets.push(
          `#${targetId} remained inside [hidden] ${describeElement(
            cur
          )} after revealTarget()`
        );
      }
      if (
        cur.classList.contains("reader-panel-view") &&
        !cur.classList.contains("active")
      ) {
        unrevealedTargets.push(
          `#${targetId} inside ${describeElement(
            cur
          )} did not activate its companion panel view on revealTarget()`
        );
      }
    }
  }
  return { duplicateIds, danglingHrefs, unrevealedTargets };
}
