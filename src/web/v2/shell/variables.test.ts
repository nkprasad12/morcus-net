import * as fs from "fs";
import * as path from "path";

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
});
