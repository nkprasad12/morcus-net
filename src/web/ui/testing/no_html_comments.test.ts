/**
 * No UI source file may put an HTML comment (`<!-- -->`) in its markup.
 *
 * Comments in templates ship in every response but are invisible to users,
 * and because they are unique prose they compress badly. Document markup with
 * TypeScript comments beside the template instead.
 */

import fs from "fs";
import path from "path";

const UI_ROOT = path.resolve(__dirname, "..");

function uiSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...uiSourceFiles(full));
    } else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

test("UI templates contain no HTML comments", () => {
  const offenders: string[] = [];
  for (const file of uiSourceFiles(UI_ROOT)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.includes("<!--")) {
        offenders.push(`${path.relative(UI_ROOT, file)}:${i + 1}`);
      }
    });
  }
  expect(offenders).toEqual([]);
});
