import * as fs from "fs";
import * as path from "path";
import { THEME_COLOR } from "@/web/ui/shell/theme_color.common";

const SHELL_DIR = __dirname;

/**
 * Extracts custom property declarations (`--name: value`) from a CSS block body.
 */
function parseCustomProperties(blockBody: string): Map<string, string> {
  const props = new Map<string, string>();
  const clean = blockBody.replace(/\/\*[\s\S]*?\*\//g, "");
  const declRegex = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match: RegExpExecArray | null;
  while ((match = declRegex.exec(clean)) !== null) {
    const name = match[1].trim();
    const value = match[2]
      .replace(/\s+/g, " ")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .trim();
    props.set(name, value);
  }
  return props;
}

/**
 * Extracts the three canonical theme blocks from a variables stylesheet:
 * 1. Light & base `:root, :root[data-theme="light"], [data-theme="light"]`
 * 2. OS dark `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }`
 * 3. Explicit dark `:root[data-theme="dark"], [data-theme="dark"]`
 */
function extractThemeBlocks(cssContent: string) {
  const clean = cssContent.replace(/\/\*[\s\S]*?\*\//g, "");

  const lightMatch = clean.match(
    /:root\s*,\s*:root\[data-theme="light"\]\s*,\s*\[data-theme="light"\]\s*\{([^}]+)\}/
  );
  const mediaDarkMatch = clean.match(
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]+)\}\s*\}/
  );
  const explicitDarkMatch = clean.match(
    /:root\[data-theme="dark"\]\s*,\s*\[data-theme="dark"\]\s*\{([^}]+)\}/
  );

  return {
    light: lightMatch ? parseCustomProperties(lightMatch[1]) : null,
    mediaDark: mediaDarkMatch ? parseCustomProperties(mediaDarkMatch[1]) : null,
    explicitDark: explicitDarkMatch
      ? parseCustomProperties(explicitDarkMatch[1])
      : null,
  };
}

describe("UI V2 Design Token Parity (variables.css & critical_variables.css)", () => {
  test.each(["variables.css", "critical_variables.css"])(
    "%s keeps light, OS-dark, and explicit [data-theme='dark'] tokens in strict parity",
    (filename) => {
      const filePath = path.join(SHELL_DIR, filename);
      const css = fs.readFileSync(filePath, "utf8");
      const blocks = extractThemeBlocks(css);

      expect(blocks.light).not.toBeNull();
      expect(blocks.mediaDark).not.toBeNull();
      expect(blocks.explicitDark).not.toBeNull();

      const light = blocks.light!;
      const mediaDark = blocks.mediaDark!;
      const explicitDark = blocks.explicitDark!;

      // 1. OS dark (@media) and explicit [data-theme="dark"] must have identical keys and values
      expect(Object.fromEntries(explicitDark)).toEqual(
        Object.fromEntries(mediaDark)
      );

      // 2. Every dark token must also have a corresponding definition in the light/root block
      for (const key of explicitDark.keys()) {
        expect(light.has(key)).toBe(true);
      }
    }
  );

  test("variables.css defines --border-mid in both light and dark blocks", () => {
    const css = fs.readFileSync(path.join(SHELL_DIR, "variables.css"), "utf8");
    const blocks = extractThemeBlocks(css);

    expect(blocks.light?.get("--border-mid")).toBe("#b7bac1");
    expect(blocks.mediaDark?.get("--border-mid")).toBe("#4d525c");
    expect(blocks.explicitDark?.get("--border-mid")).toBe("#4d525c");
  });

  test("THEME_COLOR matches --app-bar-bg", () => {
    const css = fs.readFileSync(
      path.join(SHELL_DIR, "critical_variables.css"),
      "utf8"
    );
    const blocks = extractThemeBlocks(css);

    expect(blocks.light?.get("--app-bar-bg")).toBe(THEME_COLOR.light);
    expect(blocks.explicitDark?.get("--app-bar-bg")).toBe(THEME_COLOR.dark);
  });

  test("dark mode mutes the app-bar icons and the active nav pill; light mode keeps them", () => {
    const css = fs.readFileSync(path.join(SHELL_DIR, "variables.css"), "utf8");
    const blocks = extractThemeBlocks(css);

    expect(blocks.light?.get("--app-bar-icon")).toBe("var(--app-bar-text)");
    expect(blocks.light?.get("--app-bar-nav-active-text")).toBe("#0d2820");
    for (const dark of [blocks.mediaDark, blocks.explicitDark]) {
      expect(dark?.get("--app-bar-icon")).toBe("var(--app-bar-nav-text)");
      expect(dark?.get("--app-bar-nav-active-text")).toBe("#e2ece7");
      expect(dark?.get("--app-bar-nav-active-bg")).toBe(
        "rgba(124, 196, 166, 0.14)"
      );
    }

    const appBar = fs
      .readFileSync(path.join(SHELL_DIR, "app_bar.css"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(appBar).toMatch(
      /\.theme-toggle-btn,\s*\.mobile-menu-btn \{[^}]*color: var\(--app-bar-icon\)/
    );
    expect(appBar).toMatch(
      /\.mobile-menu-btn:hover \{[^}]*color: var\(--app-bar-text\)/
    );
    expect(appBar).toMatch(
      /\.theme-toggle-btn\[aria-expanded="true"\],\s*\.mobile-menu\[open\] > \.mobile-menu-btn \{\s*color: var\(--app-bar-text\)/
    );
  });
});

/** WCAG 2 contrast ratio between two `#rrggbb` colours. */
function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("reading-text contrast levels and highlight text colours", () => {
  const variables = fs.readFileSync(
    path.join(SHELL_DIR, "variables.css"),
    "utf8"
  );
  const tokens = extractThemeBlocks(variables);
  const critical = extractThemeBlocks(
    fs.readFileSync(path.join(SHELL_DIR, "critical_variables.css"), "utf8")
  );
  const theme = {
    light: { base: tokens.light!, bg: critical.light!.get("--bg")! },
    dark: {
      base: tokens.explicitDark!,
      bg: critical.explicitDark!.get("--bg")!,
    },
  };
  const hex = (v: string | undefined) => {
    expect(v).toMatch(/^#[0-9a-f]{6}$/i);
    return v!;
  };

  /** `{ "light:higher": props with the theme suffix dropped, ... }` */
  function contrastRules(): Map<string, Map<string, string>> {
    const rules = new Map<string, Map<string, string>>();
    const clean = variables.replace(/\/\*[\s\S]*?\*\//g, "");
    const re = /\[data-text-contrast-(light|dark)="([a-z]+)"\]\s*\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean)) !== null) {
      const key = `${m[1]}:${m[2]}`;
      expect(rules.has(key)).toBe(false);
      const props = new Map<string, string>();
      for (const [name, value] of parseCustomProperties(m[3])) {
        // A level may only set its own theme's variables.
        expect(name.endsWith(`-${m[1]}`)).toBe(true);
        props.set(name.slice(0, -m[1].length - 1), value);
      }
      rules.set(key, props);
    }
    return rules;
  }

  /** The default inside `var(--x-light, default)`, resolving `var(--text)`. */
  function normal(name: "light" | "dark", token: string): string | undefined {
    const value = theme[name].base.get(token);
    const m = value?.match(/^var\(--[a-z-]+-(light|dark), (.+)\)$/);
    if (!m) return value;
    expect(m[1]).toBe(name);
    return m[2] === "var(--text)"
      ? (name === "light" ? critical.light! : critical.explicitDark!).get(
          "--text"
        )
      : m[2];
  }

  test("there is one rule per theme and level", () => {
    expect([...contrastRules().keys()].sort()).toEqual(
      ["softer", "higher", "highest"]
        .flatMap((l) => [`light:${l}`, `dark:${l}`])
        .sort()
    );
  });

  test.each(["light", "dark"] as const)(
    "%s levels stay readable and rise monotonically",
    (name) => {
      const { bg } = theme[name];
      const rules = contrastRules();
      const ratios = ["softer", "normal", "higher", "highest"].map((level) => {
        const props =
          rules.get(`${name}:${level}`) ?? new Map<string, string>();
        const reading = hex(
          props.get("--reading-text") ?? normal(name, "--reading-text")
        );
        expect(contrastRatio(reading, bg)).toBeGreaterThanOrEqual(7);
        // Light glosses follow the reading text (currentColor).
        if (name === "dark") {
          const emph = hex(
            props.get("--emph-text") ?? normal(name, "--emph-text")
          );
          expect(contrastRatio(emph, bg)).toBeGreaterThanOrEqual(7);
        }
        // Softer and Normal keep today's muted text (light's sits at 4.2:1, a
        // pre-existing token); the levels that change it must reach AA.
        const muted = props.get("--text-muted");
        if (muted !== undefined) {
          expect(contrastRatio(hex(muted), bg)).toBeGreaterThanOrEqual(4.5);
        }
        return contrastRatio(reading, bg);
      });
      expect(ratios).toEqual([...ratios].sort((a, b) => a - b));
      expect(new Set(ratios).size).toBe(ratios.length);
    }
  );

  test.each(["light", "dark"] as const)(
    "%s highlight text colours reach 4.5:1 on every entry surface",
    (name) => {
      const { base } = theme[name];
      const surfaces = [
        theme[name].bg,
        ...["--card-surface-bg", "--paper-bg", "--tag-bg"].map((t) =>
          hex(base.get(t))
        ),
      ];
      for (const cat of ["orth", "grammar", "quote", "bibl"]) {
        const fg = hex(base.get(`--fg-${cat}`));
        for (const surface of surfaces) {
          expect({
            cat,
            surface,
            ok: contrastRatio(fg, surface) >= 4.5,
          }).toEqual({
            cat,
            surface,
            ok: true,
          });
        }
      }
    }
  );
});
