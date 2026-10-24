import {
  collectDeclarations,
  loadCascadeOrder,
  type DeclarationEntry,
} from "@/web/ui/tools/css_audit/css_audit_cascade";
import {
  findShadowedDeclarations,
  type ShadowFinding,
} from "@/web/ui/tools/css_audit/css_audit_shadowing";
import {
  longhandsOf,
  resetsProperty,
} from "@/web/ui/tools/css_audit/css_audit_shorthands";
import {
  camelToDataAttribute,
  scanSourceReferences,
} from "@/web/ui/tools/css_audit/css_audit_sources";
import {
  collectCssNames,
  findUnreferencedCssNames,
} from "@/web/ui/tools/css_audit/css_audit_unreferenced";

/** Builds a cascade from an in-memory file map; `entry.css` imports the rest. */
function cascade(files: Record<string, string>): DeclarationEntry[] {
  const names = Object.keys(files);
  const entry = names.map((n) => `@import "./${n}";`).join("\n");
  const read = (rel: string): string => {
    const name = rel.replace(/^.*\//, "");
    if (name === "entry.css") return entry;
    const text = files[name];
    if (text === undefined) throw new Error(`no fixture ${rel}`);
    return text;
  };
  return collectDeclarations(loadCascadeOrder(["v2/entry.css"], read));
}

function shadowed(files: Record<string, string>): ShadowFinding[] {
  return findShadowedDeclarations(cascade(files));
}

function dead(files: Record<string, string>): ShadowFinding[] {
  return shadowed(files).filter((f) => f.kind === "dead");
}

describe("css_audit_cascade", () => {
  it("expands imports in cascade order, once each", () => {
    const seen: string[] = [];
    const read = (rel: string): string => {
      seen.push(rel);
      if (rel === "a/entry.css") return '@import "./x.css"; @import "./y.css";';
      if (rel === "a/x.css") return '@import "./y.css"; .x { color: red; }';
      return ".y { color: blue; }";
    };
    const sheets = loadCascadeOrder(["a/entry.css"], read);
    expect(sheets.map((s) => s.file)).toEqual([
      "a/y.css",
      "a/x.css",
      "a/entry.css",
    ]);
    expect(seen).toEqual(["a/entry.css", "a/x.css", "a/y.css"]);
  });

  it("gives each selector-list branch its own specificity", () => {
    const [entry] = cascade({ "a.css": ".a, #b .c, div { color: red; }" });
    expect(entry.branches).toEqual([
      { selector: ".a", specificity: { a: 0, b: 1, c: 0 } },
      { selector: "#b .c", specificity: { a: 1, b: 1, c: 0 } },
      { selector: "div", specificity: { a: 0, b: 0, c: 1 } },
    ]);
  });

  it("flattens nested rules but keeps :is() specificity from the parent list", () => {
    const entries = cascade({
      "a.css":
        ".a, html:has(> body.b) { &:hover { color: red; } & .kid { color: blue; } }",
    });
    const hover = entries.find((e) => e.value === "red")!;
    expect(hover.branches.map((b) => b.selector)).toEqual([
      ".a:hover",
      "html:has(> body.b):hover",
    ]);
    // :is(.a, html:has(> body.b)) is (0,1,2); :hover adds (0,1,0).
    expect(hover.branches.map((b) => b.specificity)).toEqual([
      { a: 0, b: 2, c: 2 },
      { a: 0, b: 2, c: 2 },
    ]);
    const kid = entries.find((e) => e.value === "blue")!;
    expect(kid.branches.map((b) => b.selector)).toEqual([
      ".a .kid",
      "html:has(> body.b) .kid",
    ]);
  });

  it("treats a nested rule without & as a descendant and resolves deeper levels", () => {
    const entries = cascade({
      "a.css": ".a, .b { .c { &:focus { outline: 0; } } }",
    });
    expect(entries[0].branches.map((b) => b.selector)).toEqual([
      ".a .c:focus",
      ".b .c:focus",
    ]);
    expect(entries[0].branches[0].specificity).toEqual({ a: 0, b: 3, c: 0 });
  });

  it("gives bare declarations inside nested at-rules the enclosing selector and context", () => {
    const [entry] = cascade({
      "a.css": ".a { @media (hover: hover) { transition: none; } }",
    });
    expect(entry.branches.map((b) => b.selector)).toEqual([".a"]);
    expect(entry.context).toBe("@media (hover: hover)");
  });

  it("sorts commutative at-rules in the context key but keeps @layer order", () => {
    const [x] = cascade({
      "a.css": "@media (a) { @supports (b) { .x { color: red; } } }",
    });
    const [y] = cascade({
      "a.css": "@supports (b) { @media (a) { .x { color: red; } } }",
    });
    expect(x.context).toBe(y.context);
    const [l1] = cascade({
      "a.css": "@layer one { @layer two { .x { color: red; } } }",
    });
    const [l2] = cascade({
      "a.css": "@layer two { @layer one { .x { color: red; } } }",
    });
    expect(l1.context).not.toBe(l2.context);
  });

  it("skips @keyframes and selector-less at-rules", () => {
    const entries = cascade({
      "a.css":
        "@keyframes k { from { opacity: 0; } to { opacity: 1; } } @font-face { font-family: x; }",
    });
    expect(entries).toEqual([]);
  });

  it("canonicalizes whitespace on the AST without touching attribute values or escapes", () => {
    const text = (css: string) =>
      cascade({ "a.css": css })[0].branches[0].selector;
    expect(text(".a   >   .b  .c { color: red; }")).toBe(".a > .b .c");
    expect(text("a:not( .x , .y ) { color: red; }")).toBe("a:not(.x,.y)");
    expect(text("html:has( > body.b):hover { color: red; }")).toBe(
      "html:has(> body.b):hover"
    );
    expect(text('[ data-x = "1" i ] { color: red; }')).toBe('[data-x="1" i]');
    // These pairs must stay distinct.
    expect(text('.x[data-v="a>b"] { color: red; }')).not.toBe(
      text('.x[data-v="a > b"] { color: red; }')
    );
    expect(text('[title="a  b"] { color: red; }')).not.toBe(
      text('[title="a b"] { color: red; }')
    );
    expect(text(".a\\>b { color: red; }")).not.toBe(
      text(".a\\ > b { color: red; }")
    );
    expect(text('[data-x="1i"] { color: red; }')).not.toBe(
      text('[data-x="1" i] { color: red; }')
    );
  });

  it("refuses @import forms it cannot model", () => {
    const read = (rel: string): string =>
      rel.endsWith("entry.css") ? '@import "./c.css" layer(x);' : ".c {}";
    expect(() => loadCascadeOrder(["v2/entry.css"], read)).toThrow(
      /unsupported @import/
    );
    const unquoted = (rel: string): string =>
      rel.endsWith("entry.css") ? "@import url(c.css);" : ".c {}";
    expect(() => loadCascadeOrder(["v2/entry.css"], unquoted)).toThrow(
      /unsupported @import/
    );
    const ok = (rel: string): string =>
      rel.endsWith("entry.css") ? '@import url("./c.css");' : ".c {}";
    expect(loadCascadeOrder(["v2/entry.css"], ok).map((s) => s.file)).toEqual([
      "v2/c.css",
      "v2/entry.css",
    ]);
  });
});

describe("css_audit_shorthands", () => {
  it("expands shorthands transitively from mdn-data", () => {
    expect(resetsProperty("padding", "padding-bottom")).toBe(true);
    expect(resetsProperty("border", "border-top-width")).toBe(true);
    expect(resetsProperty("background", "background-color")).toBe(true);
    expect(resetsProperty("font", "line-height")).toBe(true);
    expect(resetsProperty("flex", "flex-basis")).toBe(true);
    expect(resetsProperty("inset", "top")).toBe(true);
    expect(resetsProperty("transition", "transition-duration")).toBe(true);
  });

  it("patches in logical longhands", () => {
    expect(resetsProperty("padding", "padding-inline")).toBe(true);
    expect(resetsProperty("padding", "padding-inline-start")).toBe(true);
    expect(resetsProperty("margin", "margin-block-end")).toBe(true);
    expect(resetsProperty("inset", "inset-inline")).toBe(true);
  });

  it("knows the spec traps", () => {
    expect(resetsProperty("border", "border-radius")).toBe(false);
    expect(resetsProperty("border", "border-image")).toBe(true);
    expect(resetsProperty("outline", "outline-offset")).toBe(false);
    expect(resetsProperty("padding-bottom", "padding")).toBe(false);
    expect(resetsProperty("color", "background-color")).toBe(false);
    // `grid` does not reset the gutters (CSSWG 2017), despite mdn-data.
    expect(resetsProperty("grid", "column-gap")).toBe(false);
    expect(resetsProperty("grid", "row-gap")).toBe(false);
    expect(resetsProperty("grid", "gap")).toBe(false);
    expect(resetsProperty("grid", "grid-template-columns")).toBe(true);
  });

  it("treats `all` as resetting everything but custom properties and bidi", () => {
    expect(resetsProperty("all", "color")).toBe(true);
    expect(resetsProperty("all", "--x")).toBe(false);
    expect(resetsProperty("all", "direction")).toBe(false);
  });

  it("exposes longhands for inspection", () => {
    expect(longhandsOf("flex")).toEqual([
      "flex-basis",
      "flex-grow",
      "flex-shrink",
    ]);
  });
});

describe("findShadowedDeclarations", () => {
  it("flags an identical selector and property in a later file as dead", () => {
    const [f] = dead({
      "a.css": ".x { color: red; }",
      "b.css": ".x { color: blue; }",
    });
    expect(f).toMatchObject({
      kind: "dead",
      selectors: [".x"],
      earlier: { file: "v2/a.css", line: 1, prop: "color", value: "red" },
      key: "v2/a.css||.x|color",
    });
    expect(f.laterSites).toEqual([
      { file: "v2/b.css", line: 1, prop: "color", value: "blue" },
    ]);
  });

  it("flags same-file shadowing too, but never within one rule", () => {
    expect(
      dead({ "a.css": ".x { color: red; } .x { color: blue; }" })
    ).toHaveLength(1);
    expect(dead({ "a.css": ".x { color: red; color: blue; }" })).toHaveLength(
      0
    );
  });

  it("treats a later shorthand as resetting an earlier longhand, not vice versa", () => {
    expect(
      dead({
        "a.css": "@media (max-width: 640px) { .p { padding-bottom: 1px; } }",
        "b.css": "@media (max-width: 640px) { .p { padding: 0 0 2px; } }",
      })
    ).toHaveLength(1);
    expect(
      dead({
        "a.css": ".p { padding-inline: 1px; }",
        "b.css": ".p { padding: 0; }",
      })
    ).toHaveLength(1);
    expect(
      dead({
        "a.css": ".p { border-top-width: 1px; }",
        "b.css": ".p { border: 0; }",
      })
    ).toHaveLength(1);
    expect(
      dead({
        "a.css": ".p { padding: 0; }",
        "b.css": ".p { padding-bottom: 2px; }",
      })
    ).toHaveLength(0);
    expect(
      dead({
        "a.css": ".p { border-radius: 4px; }",
        "b.css": ".p { border: 0; }",
      })
    ).toHaveLength(0);
  });

  it("does not compare across different contexts or importance", () => {
    expect(
      dead({
        "a.css": "@media (max-width: 640px) { .x { color: red; } }",
        "b.css": ".x { color: blue; }",
      })
    ).toHaveLength(0);
    expect(
      dead({
        "a.css": "@supports (gap: 1px) { .x { color: red; } }",
        "b.css": "@supports (inset: 0) { .x { color: blue; } }",
      })
    ).toHaveLength(0);
    expect(
      dead({
        "a.css": ".x { color: red !important; }",
        "b.css": ".x { color: blue; }",
      })
    ).toHaveLength(0);
  });

  it("reports a partially shadowed selector list as partial", () => {
    const [f] = shadowed({
      "a.css": ".a, .b { color: red; }",
      "b.css": ".a { color: blue; }",
    });
    expect(f.kind).toBe("partial");
    expect(f.selectors).toEqual([".a"]);
    expect(
      shadowed({
        "a.css": ".a, .b { color: red; }",
        "b.css": ".a { color: blue; } .b { color: green; }",
      })[0].kind
    ).toBe("dead");
  });

  it("respects the :is() specificity of nested rules", () => {
    // Nested first: its (0,2,2) beats the later plain (0,2,0), so not dead.
    expect(
      dead({
        "a.css": ".a, html:has(> body.b) { &:hover { color: red; } }",
        "b.css": ".a:hover { color: blue; }",
      })
    ).toHaveLength(0);
    // Plain first: the later nested rule is at least as specific, so dead.
    const [f] = dead({
      "a.css": ".a:hover { color: blue; }",
      "b.css": ".a, html:has(> body.b) { &:hover { color: red; } }",
    });
    expect(f.selectors).toEqual([".a:hover"]);
  });

  it("matches bare declarations inside nested at-rules by enclosing selector", () => {
    const [f] = dead({
      "a.css": ".a { @media (hover: hover) { transition: opacity 0.2s; } }",
      "b.css": "@media (hover: hover) { .a { transition: none; } }",
    });
    expect(f).toMatchObject({
      context: "@media (hover: hover)",
      selectors: [".a"],
    });
  });

  it("keys findings independently of line numbers", () => {
    const [a] = dead({
      "a.css": ".x { color: red; }",
      "b.css": ".x { color: blue; }",
    });
    const [b] = dead({
      "a.css": "\n\n.x { color: red; }",
      "b.css": ".x { color: blue; }",
    });
    expect(a.key).toBe(b.key);
    expect(a.earlier.line).not.toBe(b.earlier.line);
  });

  it("keys findings independently of selector-list order", () => {
    const [a] = dead({
      "a.css": ".x, .y { color: red; }",
      "b.css": ".x { color: blue; } .y { color: blue; }",
    });
    const [b] = dead({
      "a.css": ".y, .x { color: red; }",
      "b.css": ".x { color: blue; } .y { color: blue; }",
    });
    expect(a.key).toBe(b.key);
  });

  it("flags an unwrapped base declaration overridden in both branches of a complementary @media pair", () => {
    const [f] = dead({
      "a.css": `
        .x { display: grid; }
        @media (width <= 640px) { .x { display: block; } }
        @media (width > 640px) { .x { display: flex; } }
      `,
    });
    expect(f).toMatchObject({
      kind: "dead",
      context: "",
      selectors: [".x"],
      earlier: { file: "v2/a.css", prop: "display", value: "grid" },
      key: "v2/a.css||.x|display",
    });
    expect(f.laterSites).toHaveLength(2);
    // Shorthand in both branches overrides longhand base, but longhand does not override shorthand.
    expect(
      dead({
        "a.css": `
          .x { padding-top: 4px; }
          @media (width <= 640px) { .x { padding: 0; } }
          @media (width > 640px) { .x { padding: 8px; } }
        `,
      })
    ).toHaveLength(1);
    expect(
      dead({
        "a.css": `
          .x { padding: 4px; }
          @media (width <= 640px) { .x { padding-top: 0; } }
          @media (width > 640px) { .x { padding-top: 8px; } }
        `,
      })
    ).toHaveLength(0);
    // Only one branch overridden: base declaration is still live.
    expect(
      dead({
        "a.css": `
          .x { display: grid; }
          @media (width <= 640px) { .x { display: block; } }
        `,
      })
    ).toHaveLength(0);
    // Importance mismatch does not shadow.
    expect(
      dead({
        "a.css": `
          .x { display: grid !important; }
          @media (width <= 640px) { .x { display: block; } }
          @media (width > 640px) { .x { display: flex; } }
        `,
      })
    ).toHaveLength(0);
    // Multi-branch selector where only one branch is overridden in both halves -> partial.
    const [partial] = shadowed({
      "a.css": `
        .x, .y { display: grid; }
        @media (width <= 640px) { .x { display: block; } }
        @media (width > 640px) { .x { display: flex; } }
      `,
    });
    expect(partial.kind).toBe("partial");
    expect(partial.selectors).toEqual([".x"]);
  });
});

describe("scanSourceReferences", () => {
  const scan = (text: string) => scanSourceReferences([{ path: "x.ts", text }]);

  it("ignores module specifiers, require() arguments and type-position literals", () => {
    const refs = scan(`
      import { a } from "@/web/ui/dict/mod-one";
      import "side-effect-two";
      export { b } from "./mod-three";
      const c = require("mod-four");
      type T = import("mod-five").X;
      const d: "lit-six" = "lit-six";
      let e: "lit-seven" | "lit-eight";
      const live = "live-token";
    `);
    for (const t of [
      "mod-one",
      "side-effect-two",
      "mod-three",
      "mod-four",
      "mod-five",
      "lit-seven",
      "lit-eight",
      "dict",
    ]) {
      expect(refs.tokens.has(t)).toBe(false);
    }
    expect(refs.tokens.has("lit-six")).toBe(true); // the value, not the type
    expect(refs.tokens.has("live-token")).toBe(true);
  });

  it("collects tokens from string and template literals, not comments", () => {
    const refs = scan(`
      // .in-comment and /* also-in-comment */
      const a = "foo-bar baz";
      const b = \`<div class="qux \${x} quux-\${y}"></div>\`;
      const re = /regex-token/;
    `);
    expect(refs.tokens.has("foo-bar")).toBe(true);
    expect(refs.tokens.has("baz")).toBe(true);
    expect(refs.tokens.has("qux")).toBe(true);
    expect(refs.tokens.has("in-comment")).toBe(false);
    expect(refs.tokens.has("also-in-comment")).toBe(false);
    expect(refs.tokens.has("regex-token")).toBe(false);
  });

  it("records a dynamic prefix only when a chunk ends in `word-` before ${", () => {
    const refs = scan(
      "const c = `lang-chip lang-chip-${lang} tail-${{ a: 1 }.a} end-of-${x}-mid`;"
    );
    expect([...refs.dynamicPrefixes].sort()).toEqual([
      "end-of-",
      "lang-chip-",
      "tail-",
    ]);
    // The last chunk ("-mid") is a tail and never a prefix.
    expect(refs.dynamicPrefixes.has("-mid")).toBe(false);
    expect(scan("const d = `${a}${b}`;").dynamicPrefixes.size).toBe(0);
  });

  it("maps dataset access to data-* attribute names", () => {
    const refs = scan(
      'el.dataset.fooBar = ""; delete el.dataset["bazQux"]; const d = el.dataset;'
    );
    expect([...refs.datasetAttributes].sort()).toEqual([
      "data-baz-qux",
      "data-foo-bar",
    ]);
    expect(camelToDataAttribute("readerHideGutter")).toBe(
      "data-reader-hide-gutter"
    );
  });
});

describe("collectCssNames / findUnreferencedCssNames", () => {
  const css = (text: string) => collectCssNames(cascade({ "a.css": text }));
  const refs = (text: string) => scanSourceReferences([{ path: "x.ts", text }]);

  it("collects classes, data-* attributes and custom elements, ignoring standard attributes", () => {
    const names = css(
      '.a, [data-foo] morcus-x[open][aria-expanded="true"] > .b:hover::before { color: red; }'
    );
    expect(names.map((n) => `${n.kind}:${n.name}`)).toEqual([
      "class:a",
      "class:b",
      "custom-element:morcus-x",
      "data-attr:data-foo",
    ]);
  });

  it("flags names missing from source and accepts those present", () => {
    const report = findUnreferencedCssNames(
      css(
        ".used, .unused, [data-ok], [data-missing], morcus-ok, morcus-missing { color: red; }"
      ),
      refs('const h = `<morcus-ok class="used">`; el.dataset.ok = "";'),
      {}
    );
    expect(report.unreferenced.map((n) => n.name)).toEqual([
      "unused",
      "morcus-missing",
      "data-missing",
    ]);
  });

  it("accepts allowlisted dynamic prefixes and reports stale ones", () => {
    const names = css(".lang-chip-la, .lang-chip-en, .other { color: red; }");
    const ok = findUnreferencedCssNames(
      names,
      refs("const c = `lang-chip-${lang}`; const o = 'other';"),
      { "lang-chip-": "test" }
    );
    expect(ok.unreferenced).toEqual([]);
    expect(ok.staleAllowlist).toEqual([]);

    // A template that is not allowlisted does not satisfy the class.
    const notAllowlisted = findUnreferencedCssNames(
      names,
      refs("const c = `lang-chip-${lang}`; const o = 'other';"),
      {}
    );
    expect(notAllowlisted.unreferenced.map((n) => n.name)).toEqual([
      "lang-chip-en",
      "lang-chip-la",
    ]);

    // Prefix gone from source: stale.
    const noSource = findUnreferencedCssNames(
      names,
      refs("const o = 'other lang-chip-la lang-chip-en';"),
      {
        "lang-chip-": "test",
      }
    );
    expect(noSource.staleAllowlist.map((s) => s.prefix)).toEqual([
      "lang-chip-",
    ]);

    // Prefix gone from CSS: stale.
    const noCss = findUnreferencedCssNames(
      css(".other { color: red; }"),
      refs("const c = `lang-chip-${lang}`; const o = 'other';"),
      {
        "lang-chip-": "test",
      }
    );
    expect(noCss.staleAllowlist[0].reason).toMatch(/no class starting with/);
  });
});
