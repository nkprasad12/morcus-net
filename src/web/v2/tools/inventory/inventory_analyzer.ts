/**
 * Cross-slice inventory analyzer for UI V2.
 *
 * Computes two metrics across `src/web/v2/`, each enforced only as a growth
 * guard by `inventory_ratchet.json`:
 * - **A. Cross-file duplicate CSS declaration blocks:** rules with >= 3
 *   declarations sharing identical `(contextKey, declarationKey)` across 2+
 *   distinct CSS files (including `core/`). Keying is shared with the per-file
 *   stylelint rule via `css_declaration_key.cjs`.
 * - **B. Client DOM construction/mutation outside `core/`:** call sites for DOM
 *   creation (`createElement*`, `createTextNode`, `createDocumentFragment`),
 *   mutation (`appendChild`, `insertBefore`, `append`, `prepend`, `before`,
 *   `after`, `replaceWith`, `replaceChildren`, `insertAdjacent*`), HTML sink
 *   helpers (`setHtml`, `replaceWithHtml`), and `.innerHTML` / `.outerHTML`
 *   assignments.
 *
 * Receiver disambiguation approach (§3.B):
 * Uses a real `ts.Program` type checker over the target `.client.ts` files
 * (`lib.es2022.d.ts` + `lib.dom.d.ts` + `lib.dom.iterable.d.ts`, skipping
 * external npm type packages). Building the program and type-checking all 25
 * client files takes ~1.3 s in-process (~1.9 s via `./morcus.sh inventory`)
 * on the cloudtop, well within the 3 s budget, so the syntactic fallback is
 * not needed. Calls to `append`, `prepend`, `before`, `after`, `replaceWith`,
 * etc. are counted only when the receiver's non-nullable type is assignable to
 * `Node`, `ParentNode`, or `ChildNode` (excluding `URLSearchParams`, `FormData`,
 * and `Headers`).
 */

import { execFileSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import postcss from "postcss";
import * as ts from "typescript";
import {
  DEFAULT_MIN_DECLARATIONS,
  contextKey,
  declarationKey,
  isKeyframeStep,
} from "@/web/v2/tools/stylelint/css_declaration_key.cjs";

export const V2_PREFIX = "src/web/v2/";
export const CORE_PREFIX = "src/web/v2/core/";

export const SHARED_EXCLUDED_PREFIXES: readonly string[] = [
  "src/web/v2/testing/",
  "src/web/v2/tools/",
  "src/web/v2/prototypes/",
];

const DOM_CREATION_And_MUTATION_METHODS = new Set<string>([
  "createElement",
  "createElementNS",
  "createTextNode",
  "createDocumentFragment",
  "appendChild",
  "insertBefore",
  "append",
  "prepend",
  "before",
  "after",
  "replaceWith",
  "replaceChildren",
  "insertAdjacentHTML",
  "insertAdjacentElement",
  "insertAdjacentText",
]);

const HTML_SINK_HELPERS = new Set<string>(["setHtml", "replaceWithHtml"]);

const HTML_SINK_PROPERTIES = new Set<string>(["innerHTML", "outerHTML"]);

export interface CssOccurrence {
  readonly file: string;
  readonly line: number;
  readonly selector: string;
}

export interface CssDuplicatePattern {
  readonly id: string;
  readonly fullKey: string;
  readonly contextKey: string;
  readonly declarationKey: string;
  readonly declCount: number;
  readonly declarations: readonly string[];
  readonly files: readonly string[];
  readonly occurrences: readonly CssOccurrence[];
}

export interface CallSiteCitation {
  readonly file: string;
  readonly line: number;
  readonly method: string;
  readonly snippet: string;
}

export interface FileMetricAnalysis {
  readonly callsPerFile: Readonly<Record<string, number>>;
  readonly citations: readonly CallSiteCitation[];
  readonly totalCalls: number;
}

export interface InventoryAnalysis {
  readonly cssDuplicates: readonly CssDuplicatePattern[];
  readonly domMutationOutsideCore: FileMetricAnalysis;
}

export interface SelectedInventoryFiles {
  readonly cssFiles: readonly string[];
  readonly clientTsFiles: readonly string[];
}

export function normalizeRelPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

/**
 * Shared exclusion check applied across both metrics (§2).
 */
export function isExcludedInventoryPath(relPath: string): boolean {
  const norm = normalizeRelPath(relPath);
  if (!norm.startsWith(V2_PREFIX)) return true;
  if (norm.endsWith(".test.ts")) return true;
  for (const prefix of SHARED_EXCLUDED_PREFIXES) {
    if (norm.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Selects target files for Metric A (`cssFiles`, which includes `core/`) and
 * Metrics B & C (`clientTsFiles`, which excludes `core/`).
 */
export function selectInventoryFiles(
  paths: readonly string[]
): SelectedInventoryFiles {
  const cssSet = new Set<string>();
  const clientTsSet = new Set<string>();

  for (const rawPath of paths) {
    const norm = normalizeRelPath(rawPath);
    if (isExcludedInventoryPath(norm)) continue;
    if (norm.endsWith(".css")) {
      cssSet.add(norm);
    } else if (norm.endsWith(".client.ts") && !norm.startsWith(CORE_PREFIX)) {
      clientTsSet.add(norm);
    }
  }

  return {
    cssFiles: [...cssSet].sort(),
    clientTsFiles: [...clientTsSet].sort(),
  };
}

/**
 * Lists tracked files under `src/web/v2/` using `git ls-files` so untracked
 * scratch files never change inventory counts.
 */
export function listTrackedV2Files(repoRoot: string = process.cwd()): string[] {
  const out = execFileSync("git", ["ls-files", "src/web/v2"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) => line.length > 0 && fs.existsSync(path.join(repoRoot, line))
    );
}

/**
 * Computes the stable 8-hex-character SHA-256 pattern ID for a CSS fullKey.
 */
export function computeCssPatternId(fullKey: string): string {
  return crypto.createHash("sha256").update(fullKey).digest("hex").slice(0, 8);
}

/**
 * Metric A: Cross-file duplicate CSS declaration blocks.
 */
export function analyzeCssDuplicates(
  cssInputs: ReadonlyArray<{ readonly path: string; readonly content: string }>,
  minDeclarations: number = DEFAULT_MIN_DECLARATIONS
): CssDuplicatePattern[] {
  const allowedPaths = new Set(
    selectInventoryFiles(cssInputs.map((f) => f.path)).cssFiles
  );

  const byFullKey = new Map<
    string,
    {
      id: string;
      fullKey: string;
      contextKey: string;
      declarationKey: string;
      declCount: number;
      declarations: readonly string[];
      files: Set<string>;
      occurrences: CssOccurrence[];
    }
  >();

  const sortedInputs = [...cssInputs]
    .map((f) => ({ path: normalizeRelPath(f.path), content: f.content }))
    .filter((f) => allowedPaths.has(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const input of sortedInputs) {
    const root = postcss.parse(input.content, { from: input.path });
    root.walkRules((rule) => {
      if (isKeyframeStep(rule)) return;
      const { key, declCount, declarations } = declarationKey(rule);
      if (declCount < minDeclarations) return;

      const ctx = contextKey(rule);
      const fullKey = `${ctx}##${key}`;
      let entry = byFullKey.get(fullKey);
      if (!entry) {
        entry = {
          id: computeCssPatternId(fullKey),
          fullKey,
          contextKey: ctx,
          declarationKey: key,
          declCount,
          declarations,
          files: new Set<string>(),
          occurrences: [],
        };
        byFullKey.set(fullKey, entry);
      }
      entry.files.add(input.path);
      entry.occurrences.push({
        file: input.path,
        line: rule.source?.start?.line ?? 1,
        selector: rule.selector.replace(/\s+/g, " ").trim(),
      });
    });
  }

  const patterns: CssDuplicatePattern[] = [];
  for (const entry of byFullKey.values()) {
    if (entry.files.size < 2) continue;
    const files = [...entry.files].sort();
    const occurrences = [...entry.occurrences].sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line
    );
    patterns.push({
      id: entry.id,
      fullKey: entry.fullKey,
      contextKey: entry.contextKey,
      declarationKey: entry.declarationKey,
      declCount: entry.declCount,
      declarations: entry.declarations,
      files,
      occurrences,
    });
  }

  // Sort by number of files (descending), then declaration count (descending),
  // then pattern ID (ascending) for deterministic output (§7.2).
  patterns.sort(
    (a, b) =>
      b.files.length - a.files.length ||
      b.declCount - a.declCount ||
      a.id.localeCompare(b.id)
  );

  return patterns;
}

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  baseUrl: "./src",
  paths: { "@/*": ["*"] },
  types: [],
  skipLibCheck: true,
};

const diskSourceFileCache = new Map<string, ts.SourceFile>();
let cachedProgram: ts.Program | undefined;

function createTypeCheckerProgram(
  repoRoot: string,
  targetRelPaths: readonly string[],
  virtualFiles?: ReadonlyMap<string, string>
): ts.Program {
  const options: ts.CompilerOptions = {
    ...COMPILER_OPTIONS,
    baseUrl: path.join(repoRoot, "src"),
  };
  const baseHost = ts.createCompilerHost(options);

  const virtualByAbs = new Map<string, string>();
  if (virtualFiles) {
    for (const [rel, content] of virtualFiles.entries()) {
      virtualByAbs.set(path.resolve(repoRoot, rel), content);
    }
  }

  const host: ts.CompilerHost = {
    ...baseHost,
    fileExists: (fileName: string): boolean => {
      const abs = path.resolve(fileName);
      return virtualByAbs.has(abs) || baseHost.fileExists(fileName);
    },
    readFile: (fileName: string): string | undefined => {
      const abs = path.resolve(fileName);
      if (virtualByAbs.has(abs)) {
        return virtualByAbs.get(abs);
      }
      return baseHost.readFile(fileName);
    },
    getSourceFile: (
      fileName: string,
      languageVersionOrOptions: ts.ScriptTarget | ts.CreateSourceFileOptions,
      onError?: (message: string) => void,
      shouldCreateNewSourceFile?: boolean
    ): ts.SourceFile | undefined => {
      const abs = path.resolve(fileName);
      const virtualContent = virtualByAbs.get(abs);
      if (virtualContent !== undefined) {
        return ts.createSourceFile(
          fileName,
          virtualContent,
          languageVersionOrOptions,
          true
        );
      }
      const cached = diskSourceFileCache.get(abs);
      if (cached) return cached;
      const sf = baseHost.getSourceFile(
        fileName,
        languageVersionOrOptions,
        onError,
        shouldCreateNewSourceFile
      );
      if (sf) {
        diskSourceFileCache.set(abs, sf);
      }
      return sf;
    },
    resolveModuleNameLiterals: (
      moduleLiterals: readonly ts.StringLiteralLike[],
      containingFile: string
    ): readonly ts.ResolvedModuleWithFailedLookupLocations[] => {
      return moduleLiterals.map((lit) => {
        const name = lit.text;
        // Skip third-party npm packages (e.g. `express` in transitive server
        // RPC helpers) so `@types/node` is not pulled into the client program.
        if (!name.startsWith("@/") && !name.startsWith(".")) {
          return { resolvedModule: undefined };
        }
        return ts.resolveModuleName(name, containingFile, options, host);
      });
    },
  };

  const rootNames = targetRelPaths.map((rel) => path.resolve(repoRoot, rel));
  const program = ts.createProgram(rootNames, options, host, cachedProgram);
  cachedProgram = program;
  return program;
}

function resolveDomTargetTypes(
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile
): ts.Type[] {
  const types: ts.Type[] = [];
  for (const name of ["Node", "ParentNode", "ChildNode"]) {
    const sym = checker.resolveName(
      name,
      sourceFile,
      ts.SymbolFlags.Type,
      false
    );
    if (sym) {
      types.push(checker.getDeclaredTypeOfSymbol(sym));
    }
  }
  return types;
}

function isDomNodeReceiver(
  checker: ts.TypeChecker,
  receiver: ts.Expression,
  domTargetTypes: readonly ts.Type[],
  cache: Map<ts.Type, boolean>
): boolean {
  if (domTargetTypes.length === 0) return false;
  const rawType = checker.getTypeAtLocation(receiver);
  const cachedRaw = cache.get(rawType);
  if (cachedRaw !== undefined) return cachedRaw;

  const nonNull = checker.getNonNullableType(rawType);
  if (
    (nonNull.flags &
      (ts.TypeFlags.Any | ts.TypeFlags.Never | ts.TypeFlags.Unknown)) !==
    0
  ) {
    cache.set(rawType, false);
    return false;
  }

  const parts = nonNull.isUnion() ? nonNull.types : [nonNull];
  const result = parts.some((part) => {
    const cachedPart = cache.get(part);
    if (cachedPart !== undefined) return cachedPart;
    const base = checker.getBaseConstraintOfType(part) ?? part;
    if (
      (base.flags &
        (ts.TypeFlags.Any | ts.TypeFlags.Never | ts.TypeFlags.Unknown)) !==
      0
    ) {
      cache.set(part, false);
      return false;
    }
    const apparent = checker.getApparentType(base);
    const matches = domTargetTypes.some(
      (target) =>
        checker.isTypeAssignableTo(base, target) ||
        checker.isTypeAssignableTo(apparent, target)
    );
    cache.set(part, matches);
    return matches;
  });
  cache.set(rawType, result);
  return result;
}

function formatOneLineSnippet(
  node: ts.Node,
  sourceFile: ts.SourceFile
): string {
  const singleLine = node.getText(sourceFile).replace(/\s+/g, " ").trim();
  return singleLine.length > 100 ? `${singleLine.slice(0, 99)}…` : singleLine;
}

function buildFileMetricAnalysis(
  citations: readonly CallSiteCitation[]
): FileMetricAnalysis {
  const sortedCitations = [...citations].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line
  );
  const counts = new Map<string, number>();
  for (const c of sortedCitations) {
    counts.set(c.file, (counts.get(c.file) ?? 0) + 1);
  }
  const callsPerFile: Record<string, number> = {};
  for (const file of [...counts.keys()].sort()) {
    const count = counts.get(file) ?? 0;
    if (count > 0) {
      callsPerFile[file] = count;
    }
  }
  return {
    callsPerFile,
    citations: sortedCitations,
    totalCalls: sortedCitations.length,
  };
}

/**
 * Analyzes Metric B across the selected `.client.ts` files.
 */
export function analyzeClientTsFiles(
  repoRoot: string,
  targetRelPaths: readonly string[],
  virtualFiles?: ReadonlyMap<string, string>
): {
  domMutationOutsideCore: FileMetricAnalysis;
} {
  const selectedPaths = selectInventoryFiles(targetRelPaths).clientTsFiles;
  if (selectedPaths.length === 0) {
    return { domMutationOutsideCore: buildFileMetricAnalysis([]) };
  }

  const program = createTypeCheckerProgram(
    repoRoot,
    selectedPaths,
    virtualFiles
  );
  const checker = program.getTypeChecker();

  const domCitations: CallSiteCitation[] = [];
  const domTypeCache = new Map<ts.Type, boolean>();
  let domTargetTypes: ts.Type[] | undefined;

  for (const relPath of selectedPaths) {
    const absPath = path.resolve(repoRoot, relPath);
    const sourceFile = program.getSourceFile(absPath);
    if (!sourceFile) continue;

    if (!domTargetTypes) {
      domTargetTypes = resolveDomTargetTypes(checker, sourceFile);
    }
    const targetTypes = domTargetTypes;

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        if (ts.isPropertyAccessExpression(node.expression)) {
          const methodName = node.expression.name.text;
          const receiver = node.expression.expression;

          // Metric B: DOM creation/mutation methods on a DOM receiver, or
          // `setHtml` / `replaceWithHtml` via namespace property access.
          if (HTML_SINK_HELPERS.has(methodName)) {
            const line =
              sourceFile.getLineAndCharacterOfPosition(
                node.getStart(sourceFile)
              ).line + 1;
            domCitations.push({
              file: relPath,
              line,
              method: methodName,
              snippet: formatOneLineSnippet(node, sourceFile),
            });
          } else if (
            DOM_CREATION_And_MUTATION_METHODS.has(methodName) &&
            isDomNodeReceiver(checker, receiver, targetTypes, domTypeCache)
          ) {
            const line =
              sourceFile.getLineAndCharacterOfPosition(
                node.getStart(sourceFile)
              ).line + 1;
            domCitations.push({
              file: relPath,
              line,
              method: methodName,
              snippet: formatOneLineSnippet(node, sourceFile),
            });
          }
        } else if (ts.isIdentifier(node.expression)) {
          const fnName = node.expression.text;
          if (HTML_SINK_HELPERS.has(fnName)) {
            const line =
              sourceFile.getLineAndCharacterOfPosition(
                node.getStart(sourceFile)
              ).line + 1;
            domCitations.push({
              file: relPath,
              line,
              method: fnName,
              snippet: formatOneLineSnippet(node, sourceFile),
            });
          }
        }
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        ts.isPropertyAccessExpression(node.left)
      ) {
        const propName = node.left.name.text;
        if (
          HTML_SINK_PROPERTIES.has(propName) &&
          isDomNodeReceiver(
            checker,
            node.left.expression,
            targetTypes,
            domTypeCache
          )
        ) {
          const line =
            sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
              .line + 1;
          domCitations.push({
            file: relPath,
            line,
            method: propName,
            snippet: formatOneLineSnippet(node, sourceFile),
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return {
    domMutationOutsideCore: buildFileMetricAnalysis(domCitations),
  };
}

/**
 * Runs the full cross-slice inventory over an in-memory map of relative file
 * paths to file contents (used by unit tests with inline fixtures).
 */
export function analyzeVirtualInventory(
  files: Readonly<Record<string, string>>,
  repoRoot: string = process.cwd()
): InventoryAnalysis {
  const allPaths = Object.keys(files).map(normalizeRelPath);
  const { cssFiles, clientTsFiles } = selectInventoryFiles(allPaths);

  const cssInputs = cssFiles.map((p) => ({
    path: p,
    content: files[p] ?? "",
  }));

  const virtualMap = new Map<string, string>();
  for (const [k, v] of Object.entries(files)) {
    virtualMap.set(normalizeRelPath(k), v);
  }

  const cssDuplicates = analyzeCssDuplicates(cssInputs);
  const { domMutationOutsideCore } = analyzeClientTsFiles(
    repoRoot,
    clientTsFiles,
    virtualMap
  );

  return {
    cssDuplicates,
    domMutationOutsideCore,
  };
}

/**
 * Runs the full cross-slice inventory over the tracked files in `src/web/v2/`.
 */
export function analyzeRepoInventory(
  repoRoot: string = process.cwd()
): InventoryAnalysis {
  const trackedPaths = listTrackedV2Files(repoRoot);
  const { cssFiles, clientTsFiles } = selectInventoryFiles(trackedPaths);

  const cssInputs = cssFiles.map((relPath) => ({
    path: relPath,
    content: fs.readFileSync(path.join(repoRoot, relPath), "utf8"),
  }));

  const cssDuplicates = analyzeCssDuplicates(cssInputs);
  const { domMutationOutsideCore } = analyzeClientTsFiles(
    repoRoot,
    clientTsFiles
  );

  return {
    cssDuplicates,
    domMutationOutsideCore,
  };
}
