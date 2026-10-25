import { dedentTemplateStrings } from "@/web/ui/core/dom/html.common";

/**
 * Tag for server-rendered markup written as a plain template literal.
 *
 * Behaves like an untagged template (values are interpolated verbatim, with
 * no escaping) except that the template's own indentation is removed; see
 * `dedentTemplateStrings` in `core/dom/html.common.ts`. Escape untrusted
 * values yourself, or use the escaping `html` tag instead.
 *
 * Server-only on purpose: client code builds markup with `html`, which
 * escapes by default.
 */
export function ssr(
  templateStrings: TemplateStringsArray,
  ...values: unknown[]
): string {
  const strings = dedentTemplateStrings(templateStrings);
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += String(values[i]);
    out += strings[i + 1];
  }
  return out;
}
