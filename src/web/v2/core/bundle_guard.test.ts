/**
 * @jest-environment jsdom
 */

async function loadGuard(): Promise<
  typeof import("@/web/v2/core/bundle_guard.client")
> {
  let mod: typeof import("@/web/v2/core/bundle_guard.client") | undefined;
  await jest.isolateModulesAsync(async () => {
    mod = await import("@/web/v2/core/bundle_guard.client");
  });
  return mod!;
}

function reportError(): void {
  window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
}

const root = document.documentElement;

beforeEach(() => {
  jest.useFakeTimers();
  root.removeAttribute("data-js-failed");
});

afterEach(() => {
  jest.useRealTimers();
  root.removeAttribute("data-js-failed");
});

describe("bundle_guard", () => {
  test("an error that aborts evaluation marks <html> failed", async () => {
    await loadGuard();
    reportError();
    jest.runAllTimers();
    expect(root.hasAttribute("data-js-failed")).toBe(true);
  });

  test("an error reported while evaluation still completes is ignored", async () => {
    const guard = await loadGuard();
    // E.g. a connectedCallback throwing during customElements.define().
    reportError();
    guard.markBundleEvaluated();
    jest.runAllTimers();
    expect(root.hasAttribute("data-js-failed")).toBe(false);
  });

  test("errors after evaluation are ignored", async () => {
    const guard = await loadGuard();
    guard.markBundleEvaluated();
    reportError();
    jest.runAllTimers();
    expect(root.hasAttribute("data-js-failed")).toBe(false);
  });
});
