/**
 * Auto-escaping HTML template literal for UI V2.
 *
 * The point of this module is to make the safe path the default one. Any value
 * interpolated into an `html` template is escaped unless it is explicitly
 * wrapped in {@link raw}, which makes every trusted-HTML decision greppable and
 * reviewable rather than implicit.
 *
 * `html` returns a *branded string* rather than a wrapper object. It is a real
 * string at runtime, so it flows into DOM APIs, SSR concatenation and
 * `String`-typed interfaces without unwrapping, while a plain `string` is not
 * assignable back to it. Markup reaches the DOM through the typed sinks in
 * `core/dom.client.ts`; see the note there on why the lint rule alone is not
 * sufficient.
 *
 * This module must not import `he`: it is ~100 KB of poorly tree-shakeable
 * CommonJS, and this is a `.common.ts` that reaches the client bundle.
 *
 * Note that prettier formats the markup inside `html` templates. It is
 * whitespace-aware, so it will not introduce a rendered gap between inline
 * elements, but it does reflow block elements across lines and rewrites
 * single-quoted attributes to double quotes. Exact-output assertions in tests
 * should therefore stick to inline elements.
 */

declare const SAFE_HTML: unique symbol;

/**
 * A string whose dynamic parts have already been HTML-escaped.
 *
 * Assignable to `string`, but a plain `string` is not assignable to it, so a
 * function declaring `SafeHtml` cannot accidentally return raw input.
 */
export type SafeHtml = string & { readonly [SAFE_HTML]: true };

const RAW = Symbol("rawHtml");

/** Pre-rendered markup that {@link html} should interpolate without escaping. */
export interface RawHtml {
  readonly [RAW]: string;
}

/** Values accepted inside an {@link html} interpolation. */
export type Interpolatable =
  | string
  | number
  | boolean
  | null
  | undefined
  | RawHtml;

/**
 * Escapes the five characters that are syntactically significant in HTML text
 * and attribute values.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Marks a string as trusted markup, exempting it from escaping.
 *
 * Every call is a security assertion: the argument must be markup this code
 * produced, never anything derived from user input.
 */
export function raw(value: string): RawHtml {
  return { [RAW]: value };
}

function isRaw(value: unknown): value is RawHtml {
  return typeof value === "object" && value !== null && RAW in value;
}

/**
 * Concatenates already-escaped fragments for interpolation into a parent
 * template.
 *
 * Returns {@link RawHtml} because the parts are escaped already; re-escaping
 * them at the interpolation site would double-encode them.
 */
export function joinHtml(parts: SafeHtml[], separator: string = ""): RawHtml {
  return raw(parts.join(separator));
}

/**
 * Builds an HTML string, escaping every interpolated value.
 *
 * Note that a {@link SafeHtml} interpolated directly is escaped *again*: the
 * brand is erased at runtime, so there is no way to recognise it. Compose with
 * {@link joinHtml} or {@link raw} instead. The failure mode is visible
 * double-encoded text rather than an injection, so it fails safe.
 */
export function html(
  strings: TemplateStringsArray,
  ...values: Interpolatable[]
): SafeHtml {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    out += isRaw(value)
      ? value[RAW]
      : escapeHtml(value === null || value === undefined ? "" : String(value));
    out += strings[i + 1];
  }
  // The one place the brand is applied. A branded type cannot be produced
  // without an assertion, and confining it here is the point: this function is
  // what makes the claim true, so nothing else needs to assert it.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return out as SafeHtml;
}
