/**
 * TypeScript source scanner for the UI V2 CSS audit (Check B).
 *
 * Collects, from string and template literals, every `[\w-]+` token that could
 * be a class name, `data-*` attribute name or custom-element tag, plus:
 * - `data-*` names implied by `el.dataset.fooBar` / `el.dataset["fooBar"]`;
 * - dynamic class-name prefixes: the trailing `<prefix>-` of a template chunk
 *   that ends right before a `${...}` substitution (`lang-chip-${lang}`).
 *
 * Files are parsed with `ts.createSourceFile` and walked with `forEachChild`,
 * so comments and regex literals never count as references.
 */

import * as ts from "typescript";

export interface SourceReferences {
  /** Every `[\w-]+` token found inside a string or template literal. */
  readonly tokens: ReadonlySet<string>;
  /** `data-*` attribute names implied by `dataset` property access. */
  readonly datasetAttributes: ReadonlySet<string>;
  /** Template chunks ending in `<word>-` right before `${`. */
  readonly dynamicPrefixes: ReadonlySet<string>;
}

export interface SourceFileInput {
  readonly path: string;
  readonly text: string;
}

const TOKEN_RE = /[\w-]+/g;
const DYNAMIC_PREFIX_RE = /([\w-]*[A-Za-z_][\w-]*-)$/;

export function camelToDataAttribute(name: string): string {
  return `data-${name.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`;
}

function isDatasetAccess(node: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(node) && node.name.text === "dataset";
}

function isRequireCall(node: ts.Node): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "require"
  );
}

/** Scans a set of source files and returns the union of their references. */
export function scanSourceReferences(
  files: readonly SourceFileInput[]
): SourceReferences {
  const tokens = new Set<string>();
  const datasetAttributes = new Set<string>();
  const dynamicPrefixes = new Set<string>();

  const addTokens = (text: string): void => {
    for (const match of text.matchAll(TOKEN_RE)) tokens.add(match[0]);
  };
  const addDynamicPrefix = (chunkBeforeSubstitution: string): void => {
    const match = chunkBeforeSubstitution.match(DYNAMIC_PREFIX_RE);
    if (match) dynamicPrefixes.add(match[1]);
  };

  const visit = (node: ts.Node): void => {
    // Module specifiers and type-position literals never reach the DOM, and
    // across ~370 files path segments like "dict" or "v2" would otherwise
    // shield short class names.
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      // Export declarations have no runtime literals besides the specifier.
      return;
    }
    if (
      ts.isImportTypeNode(node) ||
      ts.isLiteralTypeNode(node) ||
      isRequireCall(node)
    ) {
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      addTokens(node.text);
    } else if (ts.isTemplateExpression(node)) {
      addTokens(node.head.text);
      addDynamicPrefix(node.head.text);
      node.templateSpans.forEach((span, i) => {
        addTokens(span.literal.text);
        // The last span's literal is the tail; nothing follows it.
        if (i < node.templateSpans.length - 1)
          addDynamicPrefix(span.literal.text);
      });
    } else if (
      ts.isPropertyAccessExpression(node) &&
      isDatasetAccess(node.expression)
    ) {
      datasetAttributes.add(camelToDataAttribute(node.name.text));
    } else if (
      ts.isElementAccessExpression(node) &&
      isDatasetAccess(node.expression) &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      datasetAttributes.add(camelToDataAttribute(node.argumentExpression.text));
    }
    ts.forEachChild(node, visit);
  };

  for (const file of files) {
    const source = ts.createSourceFile(
      file.path,
      file.text,
      ts.ScriptTarget.ES2022,
      false,
      ts.ScriptKind.TS
    );
    visit(source);
  }

  return { tokens, datasetAttributes, dynamicPrefixes };
}
