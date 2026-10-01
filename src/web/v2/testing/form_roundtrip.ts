/**
 * Helpers for the `*_form_conformance.test.ts` suites: render a real SSR
 * response into jsdom, change form controls as a user would, serialize the
 * whole `<form>` with `new FormData(form)`, and send the result to the V2
 * router through supertest. Covers the gap between SSR string assertions and
 * browser E2E tests (see docs/DESIGN_TRAPS.md, "Testing").
 */

/**
 * Serializes a `<form>` in JSDOM into a GET request URL using `new FormData(form)`,
 * matching native browser form submission (including hidden inputs and repeated keys).
 */
export function serializeGetForm(form: HTMLFormElement): string {
  const action = form.getAttribute("action") || "/v2/dicts";
  const formData = new FormData(form);
  const params = new URLSearchParams();
  formData.forEach((value, key) => {
    if (typeof value === "string") {
      params.append(key, value);
    }
  });
  const qs = params.toString();
  return qs ? `${action}?${qs}` : action;
}
