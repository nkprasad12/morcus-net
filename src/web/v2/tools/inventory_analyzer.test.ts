import {
  analyzeVirtualInventory,
  selectInventoryFiles,
} from "@/web/v2/tools/inventory_analyzer";

describe("inventory_analyzer", () => {
  describe("shared file selection and core/ rule", () => {
    it("excludes tests, testing/, tools/, and prototypes/, while keeping core/ only for CSS", () => {
      const selected = selectInventoryFiles([
        "src/web/v2/core/components.css",
        "src/web/v2/core/dom.client.ts",
        "src/web/v2/dict/search.css",
        "src/web/v2/dict/dict_search.client.ts",
        "src/web/v2/dict/dict_search.test.ts",
        "src/web/v2/dict/dict_chunk_cache.client.test.ts",
        "src/web/v2/testing/slot_parity.ts",
        "src/web/v2/testing/fixture.css",
        "src/web/v2/tools/inventory.ts",
        "src/web/v2/tools/fixture.css",
        "src/web/v2/prototypes/demo.css",
        "src/web/v2/prototypes/demo.client.ts",
      ]);

      expect(selected.cssFiles).toEqual([
        "src/web/v2/core/components.css",
        "src/web/v2/dict/search.css",
      ]);
      expect(selected.clientTsFiles).toEqual([
        "src/web/v2/dict/dict_search.client.ts",
      ]);
    });

    it("excludes core/ for Metric B while including core/ for Metric A", () => {
      const result = analyzeVirtualInventory({
        "src/web/v2/core/components.css": `
          .pill {
            display: inline-flex;
            align-items: center;
            gap: 4px;
          }
        `,
        "src/web/v2/dict/search.css": `
          .search-pill {
            gap: 4px;
            display: inline-flex;
            align-items: center;
          }
        `,
        "src/web/v2/core/dom.client.ts": `
          export function makeDiv(): HTMLElement {
            const el = document.createElement("div");
            document.body.appendChild(el);
            return el;
          }
        `,
        "src/web/v2/dict/dict_search.client.ts": `
          const el = document.createElement("span");
          document.body.appendChild(el);
        `,
      });

      expect(result.cssDuplicates).toHaveLength(1);
      expect(result.cssDuplicates[0].files).toEqual([
        "src/web/v2/core/components.css",
        "src/web/v2/dict/search.css",
      ]);

      expect(result.domMutationOutsideCore.callsPerFile).toEqual({
        "src/web/v2/dict/dict_search.client.ts": 2,
      });
    });
  });

  describe("Metric A: cross-file duplicate CSS declaration blocks", () => {
    it("matches duplicate blocks across files despite comments, multi-line rules, declaration order, and varied whitespace", () => {
      const result = analyzeVirtualInventory({
        "src/web/v2/dict/a.css": `
          /* leading comment */
          .card-a,
          .card-a-alt {
            /* comment inside */
            COLOR : var(--text) ;
            padding:   8px  12px ;
            display: flex;
          }
        `,
        "src/web/v2/reader/b.css": `
          .card-b { display:flex; color:var(--text); /* trailing */ padding:8px  12px; }
        `,
      });

      expect(result.cssDuplicates).toHaveLength(1);
      expect(result.cssDuplicates[0].files).toEqual([
        "src/web/v2/dict/a.css",
        "src/web/v2/reader/b.css",
      ]);
      expect(result.cssDuplicates[0].declCount).toBe(3);
      expect(result.cssDuplicates[0].id).toMatch(/^[0-9a-f]{8}$/);
    });

    it("does not count an @media override of a base rule in another file, but counts matching @media contexts", () => {
      const result = analyzeVirtualInventory({
        "src/web/v2/dict/a.css": `
          .box {
            display: flex;
            padding: 8px;
            margin: 0;
          }
          @media (max-width: 640px) {
            .mobile-box {
              display: grid;
              gap: 4px;
              padding: 4px;
            }
          }
        `,
        "src/web/v2/reader/b.css": `
          @media (max-width: 640px) {
            .box {
              display: flex;
              padding: 8px;
              margin: 0;
            }
            .reader-mobile-box {
              display: grid;
              gap: 4px;
              padding: 4px;
            }
          }
        `,
      });

      expect(result.cssDuplicates).toHaveLength(1);
      expect(result.cssDuplicates[0].contextKey).toBe(
        "@media (max-width: 640px)"
      );
      expect(
        result.cssDuplicates[0].occurrences.map((o) => o.selector)
      ).toEqual([".mobile-box", ".reader-mobile-box"]);
    });

    it("distinguishes nested rules and skips @keyframes steps", () => {
      const result = analyzeVirtualInventory({
        "src/web/v2/dict/a.css": `
          .btn-a {
            display: inline-flex;
            padding: 4px;
            color: var(--text);
            &:hover { color: var(--primary); }
          }
          .btn-same-nested {
            display: inline-flex;
            padding: 4px;
            color: var(--text);
            &:focus-visible { outline: 2px solid var(--primary); }
          }
          @keyframes fade-a {
            from { opacity: 0; transform: scale(0.9); color: var(--text); }
            to { opacity: 1; transform: scale(1); color: var(--primary); }
          }
        `,
        "src/web/v2/reader/b.css": `
          .btn-b {
            display: inline-flex;
            padding: 4px;
            color: var(--text);
            &:focus { color: var(--primary); }
          }
          .btn-same-nested-b {
            display: inline-flex;
            padding: 4px;
            color: var(--text);
            &:focus-visible { outline: 2px solid var(--primary); }
          }
          @keyframes fade-b {
            from { opacity: 0; transform: scale(0.9); color: var(--text); }
            to { opacity: 1; transform: scale(1); color: var(--primary); }
          }
        `,
      });

      expect(result.cssDuplicates).toHaveLength(1);
      expect(
        result.cssDuplicates[0].occurrences.map((o) => o.selector)
      ).toEqual([".btn-same-nested", ".btn-same-nested-b"]);
    });

    it("ignores two-declaration blocks and single-file duplicates", () => {
      const result = analyzeVirtualInventory({
        "src/web/v2/dict/a.css": `
          .two-a { display: flex; align-items: center; }
          .same-file-1 { display: flex; align-items: center; gap: 8px; }
          .same-file-2 { display: flex; align-items: center; gap: 8px; }
        `,
        "src/web/v2/reader/b.css": `
          .two-b { display: flex; align-items: center; }
        `,
      });

      expect(result.cssDuplicates).toHaveLength(0);
    });
  });

  describe("Metric B: client DOM construction and mutation", () => {
    it("ignores URLSearchParams.append, FormData.append, and Headers.append while counting DOM Node mutations, innerHTML, and setHtml", () => {
      const result = analyzeVirtualInventory({
        "src/web/v2/dict/sample.client.ts": `
          import { setHtml, replaceWithHtml } from "@/web/v2/core/dom.client";
          import { html } from "@/web/v2/core/html.common";

          export function run(host: HTMLElement, form: HTMLFormElement): void {
            const params = new URLSearchParams();
            params.append("q", "amo");

            const fd = new FormData(form);
            fd.append("dict", "LS");

            const headers = new Headers();
            headers.append("X-Requested-With", "fetch");

            const child = document.createElement("div");
            const text = document.createTextNode("salve");
            child.appendChild(text);
            host.append(child);
            host.prepend("prefix");
            child.innerHTML = "<span>raw</span>";
            setHtml(host, html\`<p>safe</p>\`);
            replaceWithHtml(child, html\`<b>replaced</b>\`);
          }
        `,
      });

      const citations = result.domMutationOutsideCore.citations;
      expect(citations.map((c) => c.method)).toEqual([
        "createElement",
        "createTextNode",
        "appendChild",
        "append",
        "prepend",
        "innerHTML",
        "setHtml",
        "replaceWithHtml",
      ]);
      expect(result.domMutationOutsideCore.callsPerFile).toEqual({
        "src/web/v2/dict/sample.client.ts": 8,
      });
    });
  });
});
