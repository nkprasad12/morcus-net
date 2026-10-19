/**
 * Helpers for the `*_form_conformance.test.ts` suites: render a real SSR
 * response into jsdom, change form controls as a user would, serialize the
 * whole `<form>` with `new FormData(form)`, and send the result to the V2
 * router through supertest. Covers the gap between SSR string assertions and
 * browser E2E tests (see docs/DESIGN_TRAPS.md, "Testing").
 */

/** The form's `action` attribute; every form under test must declare one. */
function formAction(form: HTMLFormElement): string {
  const action = form.getAttribute("action");
  if (!action) {
    throw new Error(
      "form_roundtrip: the <form> has no `action` attribute; SSR forms must " +
        "declare where they submit."
    );
  }
  return action;
}

/**
 * Serializes the form's controls as a browser would on submit
 * (`new FormData(form, submitter)`), keeping string entries only, as
 * `application/x-www-form-urlencoded`. Includes hidden inputs, repeated keys
 * and out-of-tree controls associated via `form="<id>"`.
 */
function serializeFormBody(
  form: HTMLFormElement,
  submitter?: HTMLElement | null
): string {
  const params = new URLSearchParams();
  new FormData(form).forEach((value, key) => {
    if (typeof value === "string") {
      params.append(key, value);
    }
  });
  // Browsers include a named submitter's `name=value`. JSDOM's `FormData` ignores its
  // `submitter` argument, so add it explicitly.
  if (
    (submitter instanceof HTMLButtonElement ||
      submitter instanceof HTMLInputElement) &&
    submitter.name
  ) {
    params.append(submitter.name, submitter.value);
  }
  return params.toString();
}

/**
 * Serializes a `<form>` in JSDOM into a GET request URL using `new FormData(form)`,
 * matching native browser form submission (including hidden inputs and repeated keys).
 * Pass the clicked `submitter` to include a named submit button's `name=value`, as browsers do.
 */
export function serializeGetForm(
  form: HTMLFormElement,
  submitter?: HTMLElement | null
): string {
  const action = formAction(form);
  const qs = serializeFormBody(form, submitter);
  return qs ? `${action}?${qs}` : action;
}

interface SerializedPostForm {
  action: string;
  body: string;
}

/**
 * Serializes a `<form method="post">` in JSDOM into its `action` path and
 * `application/x-www-form-urlencoded` body string using `new FormData(form)`,
 * including out-of-tree controls associated via `form="<id>"`.
 */
export function serializePostForm(
  form: HTMLFormElement,
  submitter?: HTMLElement | null
): SerializedPostForm {
  return {
    action: formAction(form),
    body: serializeFormBody(form, submitter),
  };
}
