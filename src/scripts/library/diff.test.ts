import fs from "fs";
import os from "os";
import path from "path";

import {
  diffRenders,
  formatReport,
  reportDiffers,
} from "@/scripts/library/diff";
import {
  RENDER_INDEX,
  RENDER_INDEX_VERSION,
  shortHash,
  type RenderIndex,
  type RenderedWork,
} from "@/scripts/library/render";

type Pages = Record<string, string>;

/** Writes a minimal render (index.json + page files) and returns its dir. */
function writeRender(
  root: string,
  label: string,
  works: Record<string, Pages>,
  failures: Record<string, string> = {}
): string {
  const dir = path.join(root, label);
  const index: RenderIndex = {
    version: RENDER_INDEX_VERSION,
    label,
    createdAt: "2026-01-01T00:00:00.000Z",
    root: "/tei",
    works: {},
    failures,
  };
  for (const [id, pages] of Object.entries(works)) {
    fs.mkdirSync(path.join(dir, id), { recursive: true });
    const work: RenderedWork = {
      id,
      title: "T",
      author: "A",
      urlAuthor: "a",
      urlName: "t",
      attribution: "perseus",
      hasTranslation: false,
      textParts: ["chapter"],
      paginationDepth: 1,
      pages: [],
    };
    for (const [pageId, html] of Object.entries(pages)) {
      fs.writeFileSync(path.join(dir, id, `${pageId}.html`), html);
      work.pages.push({
        id: pageId,
        file: pageId,
        title: `Caput ${pageId}`,
        sectionCount: 1,
        citationRange: [pageId, pageId],
        html: shortHash(html),
      });
    }
    index.works[id] = work;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, RENDER_INDEX), JSON.stringify(index));
  return dir;
}

describe("diffRenders", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "render-diff-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("is empty for identical renders", () => {
    const pages = { "1": "<p>a</p>", "2": "<p>b</p>" };
    const a = writeRender(tmp, "a", { w: pages });
    const b = writeRender(tmp, "b", { w: pages });
    const report = diffRenders(a, b);
    expect(reportDiffers(report)).toBe(false);
    expect(report.totals.pagesCompared).toBe(2);
    expect(formatReport(report)).toContain("**No differences**");
  });

  it("does not count attribute reordering as a difference", () => {
    const a = writeRender(tmp, "a", {
      w: { "1": `<p class="x" id="y">a</p>` },
    });
    const b = writeRender(tmp, "b", {
      w: { "1": `<p id="y" class="x">a</p>` },
    });
    const report = diffRenders(a, b);
    expect(reportDiffers(report)).toBe(false);
    expect(report.totals.cosmeticOnly).toBe(1);
  });

  it("reports changed, added and removed pages and works", () => {
    const a = writeRender(
      tmp,
      "a",
      { w: { "1": "<p>a</p>", "2": "<p>b</p>" }, gone: { "1": "x" } },
      { broken: "boom" }
    );
    const b = writeRender(tmp, "b", {
      w: { "1": "<p><em>a</em></p>", "3": "<p>c</p>" },
      broken: { "1": "fixed" },
      fresh: { "1": "y" },
    });
    const report = diffRenders(a, b);
    expect(reportDiffers(report)).toBe(true);
    const byId = Object.fromEntries(report.works.map((w) => [w.id, w]));
    expect(byId.w.status).toBe("changed");
    expect(byId.w.changedPages).toEqual(["1"]);
    expect(byId.w.addedPages).toEqual(["3"]);
    expect(byId.w.removedPages).toEqual(["2"]);
    expect(byId.w.tags).toEqual({ em: 1 });
    expect(byId.gone.status).toBe("removed");
    expect(byId.fresh.status).toBe("added");
    expect(byId.broken.status).toBe("fixed");
    expect(byId.broken.failure).toEqual({ from: "boom", to: undefined });
    expect(report.totals.worksDiffering).toBe(4);
    const md = formatReport(report);
    expect(md).toContain("| `w` | changed | 1 | 1 | 1 | 0 |");
    expect(md).toContain("[1 html] <p>{+<em>+}a{+</em>+}</p>");
  });

  it("pairs works renamed via aliases", () => {
    const a = writeRender(tmp, "a", { old: { "1": "<p>a</p>" } });
    const b = writeRender(tmp, "b", { new: { "1": "<p>a</p>" } });
    const report = diffRenders(a, b, undefined, { old: "new" });
    expect(report.works).toHaveLength(1);
    expect(report.works[0]).toMatchObject({
      id: "new",
      status: "renamed",
      renamedFrom: "old",
    });
    expect(report.totals.pagesCompared).toBe(1);
    expect(formatReport(report)).toContain("- renamed from `old`");
    // Without the alias they are an unrelated removal and addition.
    const plain = diffRenders(a, b, undefined, {});
    expect(plain.works.map((w) => w.status).sort()).toEqual([
      "added",
      "removed",
    ]);
  });
});
