/**
 * Cascade model for the UI V2 CSS audit (see `css_audit_shadowing.ts` and
 * `css_audit_unreferenced.ts`).
 *
 * Loads a stylesheet entry point, expands `@import` in cascade order, and
 * flattens every declaration into a record carrying:
 * - the selector branches it applies to (nesting resolved, one entry per
 *   comma-separated branch), each with its effective specificity;
 * - a normalized key for the at-rules enclosing it;
 * - its `!important` flag and source position.
 *
 * Nesting follows CSS Nesting: `&` means `:is(<parent list>)`, so a nested
 * rule takes the specificity of the *most specific* parent branch, not of the
 * branch it is flattened against. The flattened selector text is still kept
 * per branch so that later plain rules can be matched against it.
 */

import * as path from "path";
import postcss, { type AtRule, type Declaration, type Rule } from "postcss";
import selectorParser, {
  type Root as SelectorRoot,
} from "postcss-selector-parser";
import {
  flattenNestedSelector,
  resolveNestedSelector,
} from "@csstools/selector-resolve-nested";
import { selectorSpecificity } from "@csstools/selector-specificity";

type ReadCssFile = (repoRelativePath: string) => string;

interface Specificity {
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

interface SelectorBranch {
  /** Canonical selector text for this branch, with nesting flattened. */
  readonly selector: string;
  /** Effective specificity per CSS Nesting (`&` = `:is(parents)`). */
  readonly specificity: Specificity;
}

export interface DeclarationEntry {
  /** Repo-relative path of the stylesheet. */
  readonly file: string;
  readonly line: number;
  /** Lower-cased property name. */
  readonly prop: string;
  readonly value: string;
  readonly important: boolean;
  /** Normalized key of the enclosing at-rules; "" when unwrapped. */
  readonly context: string;
  readonly branches: readonly SelectorBranch[];
  /** Identifies the owning rule node, so same-rule pairs can be skipped. */
  readonly ruleId: number;
  /** Position in the cascade (ascending = later). */
  readonly order: number;
}

interface LoadedSheet {
  readonly file: string;
  readonly root: postcss.Root;
}

/** Compares specificities; negative when `x` is less specific than `y`. */
export function compareSpecificity(x: Specificity, y: Specificity): number {
  if (x.a !== y.a) return x.a - y.a;
  if (x.b !== y.b) return x.b - y.b;
  return x.c - y.c;
}

/**
 * Expands `@import` depth-first from the given entry points and returns the
 * sheets in cascade order. Each file is included once, at its first import.
 */
export function loadCascadeOrder(
  entryFiles: readonly string[],
  readFile: ReadCssFile
): LoadedSheet[] {
  const order: LoadedSheet[] = [];
  const seen = new Set<string>();

  const load = (file: string): void => {
    const normalized = path.posix.normalize(file);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    const root = postcss.parse(readFile(normalized), { from: normalized });
    root.walkAtRules("import", (at) => {
      // Only a bare quoted path is supported. A `layer(...)`, `supports(...)`
      // or media qualifier would put the imported rules in a different
      // context, and an unquoted `url(...)` would otherwise be skipped
      // silently; both would make the audit wrong, so refuse them.
      const match = at.params.match(
        /^\s*(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*$/
      );
      if (!match) {
        throw new Error(
          `${normalized}: unsupported @import "${at.params}" (use a bare ` +
            `quoted path; qualifiers are not modelled by the CSS audit)`
        );
      }
      load(path.posix.join(path.posix.dirname(normalized), match[1]));
    });
    order.push({ file: normalized, root });
  };

  for (const entry of entryFiles) load(entry);
  return order;
}

const COMMUTATIVE_AT_RULES = new Set(["media", "supports", "container"]);

function isRule(node: postcss.Node): node is Rule {
  return node.type === "rule";
}

function isAtRule(node: postcss.Node): node is AtRule {
  return node.type === "atrule";
}

function isKeyframes(at: AtRule): boolean {
  return /keyframes$/i.test(at.name);
}

/**
 * Builds the context key for a declaration from its enclosing at-rules.
 * Condition at-rules (`@media`, `@supports`, `@container`) commute, so they
 * are sorted; everything else (`@layer`, `@scope`, …) keeps its nesting
 * order. Every enclosing at-rule participates, so a future at-rule can never
 * be confused with an unwrapped context.
 */
function contextKeyOf(atRules: readonly AtRule[]): string {
  const ordered: string[] = [];
  const commutative: string[] = [];
  for (const at of atRules) {
    const key = `@${at.name.toLowerCase()} ${at.params
      .replace(/\s+/g, " ")
      .trim()}`.trim();
    (COMMUTATIVE_AT_RULES.has(at.name.toLowerCase())
      ? commutative
      : ordered
    ).push(key);
  }
  commutative.sort();
  return [...ordered, ...commutative].join("|");
}

function parseSelectorList(selector: string): SelectorRoot {
  return selectorParser().astSync(selector, { lossless: false });
}

/**
 * Canonical text for each branch of a selector list, normalized on the AST so
 * that attribute values and escapes are left untouched: whitespace around
 * nodes is dropped, descendant combinators become a single space and other
 * combinators are padded with one space on each side. Differences this does
 * not fold (quote style, case, `:before` vs `::before`) keep two selectors
 * apart, which can hide a finding but never invent one.
 */
function canonicalize(selectorRoot: SelectorRoot): string[] {
  const root = selectorRoot.clone();
  root.walk((node) => {
    if (node.type === "combinator") {
      if (node.value.trim() === "") {
        node.value = " ";
        node.spaces = { before: "", after: "" };
      } else {
        node.value = node.value.trim();
        const leading = node.parent?.first === node;
        node.spaces = { before: leading ? "" : " ", after: " " };
      }
      return;
    }
    if (node.type === "attribute") {
      node.spaces = {
        before: "",
        after: "",
        attribute: { before: "", after: "" },
        operator: { before: "", after: "" },
        value: { before: "", after: "" },
        insensitive: { before: node.insensitive ? " " : "", after: "" },
      };
      if (node.raws) delete node.raws.spaces;
      return;
    }
    node.spaces = { before: "", after: "" };
  });
  return root.nodes.map((node) => node.toString());
}

interface ResolvedLevel {
  /** Flattened selector text for each branch, with its specificity. */
  readonly branches: readonly SelectorBranch[];
  /** Flattened list, used as the parent for the next level's flattening. */
  readonly flatList: SelectorRoot;
  /** `:is()`-resolved list, used as the parent for specificity. */
  readonly resolvedList: SelectorRoot;
}

/**
 * Resolves a chain of nested rules (outermost first) into selector branches.
 * Rules without `&` are implicitly `& <selector>` per CSS Nesting; the
 * `@csstools` resolver applies that rule.
 */
function resolveRuleChain(rules: readonly Rule[]): readonly SelectorBranch[] {
  let level: ResolvedLevel | undefined;
  for (const rule of rules) {
    const child = parseSelectorList(rule.selector);
    if (level === undefined) {
      const texts = canonicalize(child);
      level = {
        branches: child.nodes.map((node, i) => ({
          selector: texts[i],
          specificity: selectorSpecificity(node),
        })),
        flatList: child,
        resolvedList: child,
      };
      continue;
    }
    const branches: SelectorBranch[] = [];
    const flatNodes: SelectorRoot[] = [];
    const resolvedNodes: SelectorRoot[] = [];
    for (const childBranch of child.nodes) {
      const single = selectorParser.root({ value: "" });
      single.append(childBranch.clone());
      const flat = flattenNestedSelector(single, level.flatList);
      const resolved = resolveNestedSelector(single, level.resolvedList);
      const specificity = selectorSpecificity(resolved.nodes[0]);
      for (const text of canonicalize(flat))
        branches.push({ selector: text, specificity });
      flatNodes.push(flat);
      resolvedNodes.push(resolved);
    }
    level = {
      branches,
      flatList: concatLists(flatNodes),
      resolvedList: concatLists(resolvedNodes),
    };
  }
  return level?.branches ?? [];
}

function concatLists(lists: readonly SelectorRoot[]): SelectorRoot {
  const out = selectorParser.root({ value: "" });
  for (const list of lists)
    for (const node of list.nodes) out.append(node.clone());
  return out;
}

/**
 * Flattens every declaration in the given sheets (in cascade order) into
 * `DeclarationEntry` records. Declarations inside `@keyframes`, `@font-face`
 * and other selector-less contexts are skipped.
 */
export function collectDeclarations(
  sheets: readonly LoadedSheet[]
): DeclarationEntry[] {
  const entries: DeclarationEntry[] = [];
  const ruleIds = new Map<Rule, number>();
  const branchCache = new Map<Rule, readonly SelectorBranch[]>();
  let order = 0;

  const ruleIdOf = (rule: Rule): number => {
    let id = ruleIds.get(rule);
    if (id === undefined) {
      id = ruleIds.size;
      ruleIds.set(rule, id);
    }
    return id;
  };

  for (const { file, root } of sheets) {
    root.walkDecls((decl: Declaration) => {
      const rules: Rule[] = [];
      const atRules: AtRule[] = [];
      for (
        let node: postcss.Container | postcss.Document | undefined =
          decl.parent;
        node && node.type !== "root";
        node = node.parent
      ) {
        if (isRule(node)) rules.unshift(node);
        else if (isAtRule(node)) atRules.unshift(node);
      }
      if (rules.length === 0 || atRules.some(isKeyframes)) return;

      const innermost = rules[rules.length - 1];
      let branches = branchCache.get(innermost);
      if (branches === undefined) {
        branches = resolveRuleChain(rules);
        branchCache.set(innermost, branches);
      }

      entries.push({
        file,
        line: decl.source?.start?.line ?? 0,
        prop: decl.prop.trim().toLowerCase(),
        value: decl.value.trim(),
        important: Boolean(decl.important),
        context: contextKeyOf(atRules),
        branches,
        ruleId: ruleIdOf(innermost),
        order: order++,
      });
    });
  }
  return entries;
}
