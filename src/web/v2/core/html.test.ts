import { escapeHtml, html, joinHtml, raw } from "@/web/v2/core/html.common";
import type { SafeHtml } from "@/web/v2/core/html.common";

describe("escapeHtml", () => {
  it("escapes the five significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes the ampersand first so escapes are not double-encoded", () => {
    // A naive ordering that escapes `<` before `&` would yield `&amp;lt;`.
    expect(escapeHtml("<")).toBe("&lt;");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeHtml("amō, amāre")).toBe("amō, amāre");
  });
});

describe("html", () => {
  it("leaves static markup untouched", () => {
    expect(html`<span class="v2-chip">Hello</span>`).toBe(
      '<span class="v2-chip">Hello</span>'
    );
  });

  it("escapes an interpolated value", () => {
    const word = "amo";
    expect(html`<span>${word}</span>`).toBe("<span>amo</span>");
  });

  it("neutralizes a script payload in element content", () => {
    const payload = "<script>alert(1)</script>";

    const result = html`<div>${payload}</div>`;

    expect(result).not.toContain("<script>");
    expect(result).toBe("<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>");
  });

  it("neutralizes an attribute-breaking payload", () => {
    const payload = `x" onerror="alert(1)`;

    const result = html`<img src="${payload}" />`;

    // The quote that would close the attribute is encoded, so `onerror` stays
    // inside the src value rather than becoming an attribute of its own.
    expect(result).toBe('<img src="x&quot; onerror=&quot;alert(1)" />');
  });

  it("encodes apostrophes, which would otherwise close an attribute", () => {
    // Written against a double-quoted attribute on purpose: prettier formats
    // the embedded HTML in `html` templates and rewrites single-quoted
    // attributes to double quotes, so a single-quoted fixture cannot survive
    // a format run.
    const payload = "x' onerror='alert(1)";

    const result = html`<img src="${payload}" />`;

    expect(result).toContain("&#39;");
    expect(result).not.toMatch(/'/);
  });

  it("renders numbers and booleans", () => {
    expect(html`<span>${42}</span>`).toBe("<span>42</span>");
    expect(html`<span>${false}</span>`).toBe("<span>false</span>");
  });

  it("renders null and undefined as empty rather than as text", () => {
    expect(html`<span>${null}</span>`).toBe("<span></span>");
    expect(html`<span>${undefined}</span>`).toBe("<span></span>");
  });

  it("handles multiple interpolations and adjacent values", () => {
    expect(html`<a href="${"/a"}" title="${"<b>"}">${"x"}${"y"}</a>`).toBe(
      '<a href="/a" title="&lt;b&gt;">xy</a>'
    );
  });

  it("interpolates raw() without escaping", () => {
    const trusted = '<em class="v2-hl">amo</em>';

    expect(html`<div>${raw(trusted)}</div>`).toBe(
      '<div><em class="v2-hl">amo</em></div>'
    );
  });

  it("double-escapes a SafeHtml interpolated without raw()", () => {
    // Pins the documented failure mode: the brand is erased at runtime, so a
    // nested SafeHtml cannot be recognised. It fails safe -- visibly
    // double-encoded text rather than an injection.
    const inner = html`<em>amo</em>`;

    expect(html`<div>${inner}</div>`).toBe(
      "<div>&lt;em&gt;amo&lt;/em&gt;</div>"
    );
  });
});

describe("joinHtml", () => {
  // These use inline elements deliberately. Prettier formats the embedded HTML
  // in `html` templates, and expanding a block element such as `<ul>` across
  // lines injects (inert, but real) whitespace into the output, which would
  // make an exact-output assertion depend on formatting.
  it("concatenates fragments without re-escaping them", () => {
    const items: SafeHtml[] = [html`<b>${"a<b"}</b>`, html`<b>${"c"}</b>`];

    expect(html`<span>${joinHtml(items)}</span>`).toBe(
      "<span><b>a&lt;b</b><b>c</b></span>"
    );
  });

  it("honours a separator", () => {
    const items: SafeHtml[] = [html`<b>a</b>`, html`<b>b</b>`];

    expect(joinHtml(items, ", ")).toEqual(raw("<b>a</b>, <b>b</b>"));
  });

  it("renders an empty list as nothing", () => {
    expect(html`<span>${joinHtml([])}</span>`).toBe("<span></span>");
  });
});
