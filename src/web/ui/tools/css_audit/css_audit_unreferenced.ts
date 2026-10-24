/**
 * Check B of the UI V2 CSS audit: selectors that can never match.
 *
 * Every `.class`, `[data-*]` attribute name and `morcus-*` custom-element tag
 * in the stylesheets must appear in non-test TypeScript source (see
 * `css_audit_sources.ts`), or match an allowlisted dynamic class prefix.
 *
 * Standard HTML attributes (`[open]`, `[hidden]`, `[href]`, `[aria-*]`, …)
 * are not checked: the browser toggles several of them without any source
 * file naming them.
 *
 * The allowlist is checked both ways: a prefix that no longer appears before
 * a `${...}` substitution in source, or that matches no class in CSS, is
 * reported as stale.
 */

import selectorParser from "postcss-selector-parser";
import type { DeclarationEntry } from "@/web/ui/tools/css_audit/css_audit_cascade";
import type { SourceReferences } from "@/web/ui/tools/css_audit/css_audit_sources";

type CssNameKind = "class" | "data-attr" | "custom-element";

interface CssName {
  readonly kind: CssNameKind;
  readonly name: string;
  /** `file:line` of each rule using the name, deduplicated. */
  readonly sites: readonly string[];
}

export interface UnreferencedReport {
  readonly unreferenced: readonly CssName[];
  readonly staleAllowlist: readonly { prefix: string; reason: string }[];
}

/**
 * Class-name prefixes that are completed at runtime from a template
 * substitution. ADDING AN ENTRY REQUIRES HUMAN REVIEW: prefer a literal class
 * name per case (as `page_shell.server.ts` does for `body-*`), and only use a
 * prefix when the suffix set is open-ended. A prefix must not also be the
 * start of unrelated literal class names, or they would be shielded by it.
 */
const DYNAMIC_CLASS_PREFIX_ALLOWLIST: Readonly<Record<string, string>> = {
  "dict-badge-":
    "Per-lexicon language badge (entry_view, dict_toc, dict_landing).",
  "toc-badge-": "Per-lexicon language badge in the dictionary TOC rail.",
  "lang-chip-": "Language filter chip in the search bar and suggestions.",
};

/** Extracts every checked name from the flattened selector branches. */
export function collectCssNames(
  entries: readonly DeclarationEntry[]
): CssName[] {
  const byKey = new Map<
    string,
    { kind: CssNameKind; name: string; sites: Set<string> }
  >();
  const add = (kind: CssNameKind, name: string, site: string): void => {
    const key = `${kind}:${name}`;
    let record = byKey.get(key);
    if (!record) {
      record = { kind, name, sites: new Set() };
      byKey.set(key, record);
    }
    record.sites.add(site);
  };

  const seenRules = new Set<number>();
  for (const entry of entries) {
    if (seenRules.has(entry.ruleId)) continue;
    seenRules.add(entry.ruleId);
    const site = `${entry.file}:${entry.line}`;
    for (const branch of entry.branches) {
      const root = selectorParser().astSync(branch.selector, {
        lossless: false,
      });
      root.walk((node) => {
        if (node.type === "class") add("class", node.value, site);
        else if (node.type === "attribute") {
          const attr = node.attribute.toLowerCase();
          if (attr.startsWith("data-")) add("data-attr", attr, site);
        } else if (node.type === "tag" && node.value.includes("-")) {
          add("custom-element", node.value.toLowerCase(), site);
        }
      });
    }
  }
  return [...byKey.values()]
    .map((r) => ({ kind: r.kind, name: r.name, sites: [...r.sites].sort() }))
    .sort(
      (x, y) => x.kind.localeCompare(y.kind) || x.name.localeCompare(y.name)
    );
}

export function findUnreferencedCssNames(
  names: readonly CssName[],
  refs: SourceReferences,
  allowlist: Readonly<Record<string, string>> = DYNAMIC_CLASS_PREFIX_ALLOWLIST
): UnreferencedReport {
  const prefixes = Object.keys(allowlist);
  const prefixHits = new Map<string, number>(prefixes.map((p) => [p, 0]));

  const unreferenced = names.filter((entry) => {
    switch (entry.kind) {
      case "class": {
        for (const prefix of prefixes) {
          if (
            entry.name.startsWith(prefix) &&
            entry.name.length > prefix.length
          ) {
            prefixHits.set(prefix, (prefixHits.get(prefix) ?? 0) + 1);
          }
        }
        if (refs.tokens.has(entry.name)) return false;
        return !prefixes.some(
          (p) => entry.name.startsWith(p) && entry.name.length > p.length
        );
      }
      case "data-attr":
        return (
          !refs.tokens.has(entry.name) &&
          !refs.datasetAttributes.has(entry.name)
        );
      case "custom-element":
        return !refs.tokens.has(entry.name);
    }
  });

  const staleAllowlist = prefixes.flatMap((prefix) => {
    const reasons: string[] = [];
    if (!refs.dynamicPrefixes.has(prefix)) {
      reasons.push("no `" + prefix + "${...}` template in source");
    }
    if ((prefixHits.get(prefix) ?? 0) === 0) {
      reasons.push(`no class starting with "${prefix}" in CSS`);
    }
    return reasons.length ? [{ prefix, reason: reasons.join("; ") }] : [];
  });

  return { unreferenced, staleAllowlist };
}

export function formatCssName(entry: CssName): string {
  const prefix =
    entry.kind === "class" ? "." : entry.kind === "data-attr" ? "[" : "<";
  const suffix =
    entry.kind === "data-attr"
      ? "]"
      : entry.kind === "custom-element"
      ? ">"
      : "";
  const sites = entry.sites.slice(0, 3).join(", ");
  const more = entry.sites.length > 3 ? ` (+${entry.sites.length - 3})` : "";
  return `${prefix}${entry.name}${suffix}  @ ${sites}${more}`;
}
