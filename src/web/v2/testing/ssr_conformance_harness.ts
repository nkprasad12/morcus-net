/**
 * The runtime SSR & progressive-enhancement conformance harness (PE RFC
 * Review §2.3 / Phase 2.3), shared by the `*_ssr_conformance.test.ts` file
 * next to each feature. Uses real `.server.ts` renderer output
 * (`testing/ssr_fixtures.ts`) rather than hand-written HTML stubs.
 *
 * Enforces, on each suite's fixtures:
 * 1. Tree fingerprint (P1): Upgrading custom elements never removes or reparents
 *    any server-rendered element, and inserts no un-allowlisted DOM nodes.
 * 2. No-JS controls (P5): Every interactive control visible without JS is native
 *    (a link with `href`, a submit button inside a `<form>`, or a named form control
 *    inside a `<form>`).
 * 3. Addresses & revealability: Every `id` is unique, every in-page `href="#..."`
 *    resolves to an element in the document, and `revealTarget()` makes every
 *    targeted element visible after upgrade.
 * 4. Failed-owner sweep: with any one `morcus-*` instance failed in
 *    `onConnect()` (or never defined) and everything else upgraded, no
 *    listener cancels a native activation on a control in that instance or
 *    pointing into it; and after a bundle failure (`<html data-js-failed>`)
 *    no listener cancels any activation on the page.
 *
 * Checks that need every page at once (every registered element appears in
 * some fixture; the page setups match the entry files; every connect-time or
 * delegated selector lookup matches in some fixture) stay in
 * `core/ssr_conformance.test.ts`.
 *
 * Suites must mock the modules `testing/ssr_fixtures.ts` asks for.
 */

import "@/web/v2/v2_elements.client";
import { isAllowlistedCreation } from "@/web/v2/testing/created_dom_allowlist";
import {
  installMatchMediaStub,
  mountFixture,
  runPageSetups,
  type SsrFixture,
} from "@/web/v2/testing/ssr_fixtures";
import {
  NO_JS_CONTROLS,
  checkAddresses,
  describeElement,
  describeParent,
  diffTree,
  morcusElements,
  nearestMorcus,
  noJsControlViolation,
  parseInert,
  snapshotTree,
} from "@/web/v2/testing/ssr_invariants";

/**
 * Below these the suite's section 4 is probably vacuous (e.g. a fixture that
 * lost its components). Set each to about 70% of the suite's current count.
 */
export interface SsrSweepFloors {
  /** `morcus-*` instances failed, per failure mode. */
  readonly sweptInstances: number;
  /** Activations dispatched across those instances, per failure mode. */
  readonly sweepActivations: number;
  /** Activations dispatched after a bundle failure. */
  readonly bundleFailureActivations: number;
}

export interface SsrSuite {
  /** Builds the feature's fixtures (`testing/ssr_fixtures.ts`). */
  readonly fixtures: () => SsrFixture[] | Promise<SsrFixture[]>;
  readonly floors: SsrSweepFloors;
}

/** A stub `fetch`: these checks are synchronous and ignore responses. */
function installStubFetch(): void {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(""),
        json: () => Promise.resolve([]),
      })
    ),
  });
}

/** Registers a feature's SSR conformance tests in the calling test file. */
export function describeSsrConformance(name: string, suite: SsrSuite): void {
  const { floors } = suite;
  describe(`SSR & Progressive-Enhancement Runtime Conformance: ${name}`, () => {
    const fixtures: SsrFixture[] = [];

    beforeAll(async () => {
      installMatchMediaStub();
      fixtures.push(...(await suite.fixtures()));
    });

    beforeEach(() => {
      localStorage.clear();
      document.body.replaceChildren();
      window.history.replaceState(null, "", "/");
      installStubFetch();
    });

    afterEach(() => {
      document.body.replaceChildren();
      jest.restoreAllMocks();
    });

    describe("1. Tree fingerprint: upgrade reparents no SSR node and builds no un-allowlisted DOM (P1)", () => {
      test("all SSR fixtures preserve their tree across custom element upgrade", () => {
        expect(fixtures.length).toBeGreaterThan(0);

        for (const fixture of fixtures) {
          document.body.replaceChildren();

          // Parse inside an inert <template> so custom elements do not upgrade
          // until moved into `document.body`. Because we move the exact nodes,
          // object identity is preserved across upgrade.
          const rootWrapper = parseInert(fixture.html);
          const ssrTree = snapshotTree(rootWrapper);

          // Attach to document.body -> triggers custom element upgrade & onConnect().
          mountFixture(fixture, rootWrapper);

          const { removed, reparented, created } = diffTree(
            ssrTree,
            rootWrapper
          );
          expect({
            fixture: fixture.name,
            removedSsrNodes: removed.map(
              (el) => `${fixture.name}: ${describeElement(el)}`
            ),
            reparentedSsrNodes: reparented.map(
              ({ el, from }) =>
                `${fixture.name}: ${describeElement(
                  el
                )} moved from ${describeParent(
                  from,
                  rootWrapper
                )} to ${describeParent(el.parentNode, rootWrapper)}`
            ),
            unexpectedCreatedNodes: created
              .filter((el) => !isAllowlistedCreation(el, "upgrade"))
              .map(
                (el) =>
                  `${fixture.name}: ${describeElement(
                    el
                  )} inside ${describeParent(el.parentElement, rootWrapper)}`
              ),
          }).toEqual({
            fixture: fixture.name,
            removedSsrNodes: [],
            reparentedSsrNodes: [],
            unexpectedCreatedNodes: [],
          });
        }
      });
    });

    describe("2. No-JS controls: every visible control in SSR works natively without JS (P5)", () => {
      test("no dead buttons, unassociated inputs, or href-less links in No-JS SSR markup", () => {
        const violations: string[] = [];

        for (const fixture of fixtures) {
          // A fragment, not the wrapper, so `getElementById` resolves `form=`.
          const root = document.createDocumentFragment();
          root.append(...Array.from(parseInert(fixture.html).childNodes));
          for (const ctrl of Array.from(
            root.querySelectorAll(NO_JS_CONTROLS)
          )) {
            const violation = noJsControlViolation(ctrl, root);
            if (violation) {
              violations.push(
                `${fixture.name}: ${describeElement(ctrl)} ${violation}`
              );
            }
          }
        }

        expect(violations).toEqual([]);
      });
    });

    describe("3. Internal addresses & revealability: unique IDs and resolvable, revealable #hash links", () => {
      test("every SSR fixture has unique IDs and every internal #hash link resolves and reveals", () => {
        const duplicateIds: string[] = [];
        const danglingHrefs: string[] = [];
        const unrevealedTargets: string[] = [];

        for (const fixture of fixtures) {
          document.body.replaceChildren(parseInert(fixture.html));
          const found = checkAddresses();
          const prefix = (problem: string) => `${fixture.name}: ${problem}`;
          duplicateIds.push(...found.duplicateIds.map(prefix));
          danglingHrefs.push(...found.danglingHrefs.map(prefix));
          unrevealedTargets.push(...found.unrevealedTargets.map(prefix));
        }

        expect({
          duplicateIds,
          danglingHrefs,
          unrevealedTargets,
        }).toEqual({
          duplicateIds: [],
          danglingHrefs: [],
          unrevealedTargets: [],
        });
      });
    });

    describe("4. Failed-owner sweep: a component that failed keeps its No-JS behaviour", () => {
      test.each([
        ["onConnect throws", "throws"],
        ["tag is never defined", "undefined"],
      ] as const)(
        "no listener cancels a native activation in, or pointing into, a component whose %s",
        (_label, mode) => {
          const { instancesSwept, activations, violations, listenerErrors } =
            sweepFailedOwners(fixtures, mode);
          expect(instancesSwept).toBeGreaterThanOrEqual(floors.sweptInstances);
          expect(activations).toBeGreaterThanOrEqual(floors.sweepActivations);
          expect({ violations, listenerErrors }).toEqual({
            violations: [],
            listenerErrors: [],
          });
        }
      );

      test("after a bundle failure on <html>, no listener cancels any activation", () => {
        jest.spyOn(console, "warn").mockImplementation(() => {});
        // jsdom logs "not implemented" for native submits it can't perform.
        jest.spyOn(console, "error").mockImplementation(() => {});
        const violations: string[] = [];
        let activations = 0;
        document.documentElement.setAttribute("data-js-failed", "");
        try {
          for (const fixture of fixtures) {
            if (fixture.focusBeforeUpgrade) continue;
            document.body.replaceChildren();
            window.history.replaceState(null, "", "/");
            const wrapper = parseInert(fixture.html);
            const cleanups: (() => void)[] = [];
            try {
              document.body.appendChild(wrapper);
              cleanups.push(...runPageSetups());
              const controls = Array.from(
                wrapper.querySelectorAll(NATIVE_CONTROLS)
              );
              for (const control of controls) {
                for (const event of activationEvents(control)) {
                  if (!control.isConnected) break;
                  activations++;
                  control.dispatchEvent(event);
                  if (event.defaultPrevented) {
                    violations.push(
                      `${fixture.name}: ${eventName(
                        event
                      )} on ${describeElement(control)} was cancelled`
                    );
                  }
                }
              }
            } finally {
              for (const cleanup of cleanups) cleanup();
            }
          }
        } finally {
          document.documentElement.removeAttribute("data-js-failed");
        }
        expect(activations).toBeGreaterThanOrEqual(
          floors.bundleFailureActivations
        );
        expect(violations).toEqual([]);
      });
    });
  });
}

interface SweepResult {
  instancesSwept: number;
  activations: number;
  violations: string[];
  listenerErrors: string[];
}

/**
 * Fails each `morcus-*` instance in every fixture in turn, upgrades the rest,
 * and dispatches activations on every control the failure affects.
 *
 * - `throws`: its `onConnect` throws, so it carries `data-js-failed`.
 * - `undefined`: its tag is never defined (its chunk failed to load), so it
 *   never gets `data-upgraded`.
 */
function sweepFailedOwners(
  fixtures: readonly SsrFixture[],
  mode: "throws" | "undefined"
): SweepResult {
  const violations: string[] = [];
  const listenerErrors: string[] = [];
  let instancesSwept = 0;
  let activations = 0;

  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});

  for (const fixture of fixtures) {
    if (fixture.focusBeforeUpgrade) continue;
    const count = morcusElements(parseInert(fixture.html)).length;

    for (let i = 0; i < count; i++) {
      document.body.replaceChildren();
      window.history.replaceState(null, "", "/");
      const wrapper = parseInert(fixture.html);
      let failed = morcusElements(wrapper)[i];
      const label = `${fixture.name}: ${mode} ${describeElement(
        failed
      )} (#${i})`;
      instancesSwept++;

      let restore = () => {};
      if (mode === "throws") restore = forceConnectFailure(failed);
      else failed = renameToUndefinedTag(failed, i);
      const onError = (e: ErrorEvent) => {
        if (e.error !== FORCED_FAILURE) {
          listenerErrors.push(`${label}: ${String(e.error ?? e.message)}`);
        }
        e.preventDefault();
      };
      window.addEventListener("error", onError);
      const cleanups: (() => void)[] = [];
      try {
        document.body.appendChild(wrapper);
        if (mode === "throws") {
          expect(failed.hasAttribute("data-js-failed")).toBe(true);
        } else {
          expect(failed.hasAttribute("data-upgraded")).toBe(false);
        }
        cleanups.push(...runPageSetups());

        for (const control of controlsAffectedBy(
          failed,
          wrapper,
          mode === "throws"
        )) {
          for (const event of activationEvents(control)) {
            if (!control.isConnected) break;
            activations++;
            control.dispatchEvent(event);
            if (event.defaultPrevented) {
              violations.push(
                `${label}: ${eventName(event)} on ${describeElement(
                  control
                )} was cancelled`
              );
            }
          }
        }
      } finally {
        for (const cleanup of cleanups) cleanup();
        window.removeEventListener("error", onError);
        restore();
      }
    }
  }
  return { instancesSwept, activations, violations, listenerErrors };
}

/**
 * Replaces `el` (still inert, in its wrapper) with an element of a tag that
 * is never defined, keeping its attributes and children. Returns the
 * replacement.
 */
function renameToUndefinedTag(el: Element, i: number): Element {
  const replacement = el.ownerDocument.createElement(
    `morcus-never-defined-${i}`
  );
  for (const attr of Array.from(el.attributes)) {
    replacement.setAttribute(attr.name, attr.value);
  }
  replacement.append(...Array.from(el.childNodes));
  el.replaceWith(replacement);
  return replacement;
}

const FORCED_FAILURE = new Error(
  "failed-owner sweep: forced onConnect failure"
);
const NATIVE_CONTROLS =
  "a[href], button, summary, input, select, textarea, form";
const ID_REF_ATTRS = [
  "aria-controls",
  "popovertarget",
  "commandfor",
  "form",
  "for",
] as const;

/** Makes `el` (and only `el`) throw from `onConnect` when it upgrades. */
function forceConnectFailure(el: Element): () => void {
  const ctor = customElements.get(el.localName);
  if (!ctor) throw new Error(`<${el.localName}> is not registered`);
  const proto: unknown = ctor.prototype;
  if (typeof proto !== "object" || proto === null) {
    throw new Error(`<${el.localName}> has no prototype`);
  }
  const original: unknown = Reflect.get(proto, "onConnect");
  if (typeof original !== "function") {
    throw new Error(`<${el.localName}> has no onConnect`);
  }
  const hadOwn = Object.prototype.hasOwnProperty.call(proto, "onConnect");
  Reflect.set(proto, "onConnect", function (this: Element) {
    if (this === el) throw FORCED_FAILURE;
    original.call(this);
  });
  return () => {
    if (hadOwn) Reflect.set(proto, "onConnect", original);
    else Reflect.deleteProperty(proto, "onConnect");
  };
}

/**
 * Native controls whose No-JS behaviour belongs to `failed`, and any control
 * on the page that points at an element inside it. With `includeNested`
 * (a `data-js-failed` owner) that is every control inside it, since the CSS
 * gate drops JS-only UI throughout a failed subtree and the activation gate
 * blocks running children there too. Otherwise (an owner that merely never
 * upgraded) a nested component that is running keeps its own controls.
 */
function controlsAffectedBy(
  failed: Element,
  root: Element,
  includeNested: boolean
): Element[] {
  const out = new Set<Element>();
  for (const el of Array.from(failed.querySelectorAll(NATIVE_CONTROLS))) {
    if (includeNested || nearestMorcus(el) === failed) out.add(el);
  }
  const inFailed = (id: string) => {
    const target = root.ownerDocument.getElementById(id);
    return target !== null && failed.contains(target);
  };
  for (const a of Array.from(root.querySelectorAll('a[href^="#"]'))) {
    const raw = (a.getAttribute("href") ?? "").slice(1);
    let id = raw;
    try {
      id = decodeURIComponent(raw);
    } catch {
      // Keep the raw id.
    }
    if (id && inFailed(id)) out.add(a);
  }
  for (const attr of ID_REF_ATTRS) {
    for (const el of Array.from(root.querySelectorAll(`[${attr}]`))) {
      const ids = (el.getAttribute(attr) ?? "").trim().split(/\s+/);
      if (ids.some((id) => id && inFailed(id))) out.add(el);
    }
  }
  return Array.from(out);
}

function activationEvents(control: Element): Event[] {
  if (control instanceof HTMLFormElement) {
    return [new Event("submit", { bubbles: true, cancelable: true })];
  }
  return [
    new MouseEvent("click", { bubbles: true, cancelable: true }),
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  ];
}

function eventName(e: Event): string {
  return e instanceof KeyboardEvent ? `keydown(${e.key})` : e.type;
}
